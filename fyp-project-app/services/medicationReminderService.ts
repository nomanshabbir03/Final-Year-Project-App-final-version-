import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import './notificationService'; // installs the foreground notification handler
import {
  addDays,
  findLogForSlot,
  getMedication,
  isScheduledOn,
  listMedicationLogs,
  listMedications,
  logDose,
  slotDate,
  startOfDay,
  type DoseStatus,
  type Medication,
  type MedicationLog,
} from './medicationService';

/**
 * Medication dose reminders (FR-05.2), built on on-device scheduled notifications so they
 * also work offline:
 *  - a repeating reminder at every dose time (daily, or weekly on the medication's weekday)
 *  - a one-off follow-up 10 minutes later if the next dose is not logged yet (UC-07 AF-1)
 *  - Taken / Skip / Remind in 10 min actions on the notification (TC-30)
 *  - an immediate refill alert when a taken dose drops supply to the threshold (FR-05.4)
 */

const CATEGORY_ID = 'medication-dose';
const CHANNEL_ID = 'medication-reminders';
const ID_PREFIX = 'med-';
const FOLLOW_UP_MINUTES = 10;

const ACTION_TAKEN = 'MED_TAKEN';
const ACTION_SKIP = 'MED_SKIP';
const ACTION_DEFER = 'MED_DEFER';

type DoseNotificationData = {
  type: 'medication-dose';
  medicationId: number;
  time: string;
  /** ISO time of the dose slot, when known up front (follow-ups and snoozes). */
  scheduledAt?: string;
  /** ISO time a "remind me later" snooze goes off. */
  remindAt?: string;
};

/** Quick choices for "remind me later", in minutes. */
export const SNOOZE_OPTIONS = [5, 10, 15, 30, 60];

const timeId = (time: string) => time.replace(':', '');
const reminderId = (medicationId: number, time: string) => `${ID_PREFIX}${medicationId}-${timeId(time)}`;
const followUpId = (medicationId: number, time: string) => `${reminderId(medicationId, time)}-followup`;
const snoozeId = (medicationId: number, time: string) => `${reminderId(medicationId, time)}-snooze`;
const refillId = (medicationId: number) => `${ID_PREFIX}refill-${medicationId}`;

let setupDone = false;

async function ensureSetup() {
  if (setupDone) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Medication reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: ACTION_TAKEN, buttonTitle: '✓ Taken', options: { opensAppToForeground: true } },
    { identifier: ACTION_SKIP, buttonTitle: 'Skip', options: { opensAppToForeground: true } },
    { identifier: ACTION_DEFER, buttonTitle: `Remind in ${FOLLOW_UP_MINUTES} min`, options: { opensAppToForeground: true } },
  ]);
  setupDone = true;
}

async function hasPermission(askIfNeeded: boolean) {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!askIfNeeded || !current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

function doseContent(medication: Medication, time: string, followUp: boolean, scheduledAt?: Date, remindAt?: Date) {
  const data: DoseNotificationData = {
    type: 'medication-dose',
    medicationId: medication.id,
    time,
    scheduledAt: scheduledAt?.toISOString(),
    remindAt: remindAt?.toISOString(),
  };
  return {
    title: followUp ? `⏰ Reminder: ${medication.name}` : `💊 Time for ${medication.name}`,
    body: followUp
      ? `You haven't logged your ${medication.dosage} dose yet. Did you take it?`
      : `Take ${medication.dosage}${medication.notes ? ` · ${medication.notes}` : ''}`,
    sound: 'default',
    categoryIdentifier: CATEGORY_ID,
    data,
  };
}

async function cancelIds(ids: string[]) {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

async function scheduledMedicationIds() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.map((request) => request.identifier).filter((id) => id.startsWith(ID_PREFIX));
}

/** Next dose slot of this time whose follow-up has not passed yet and is not already logged. */
function nextFollowUpSlot(medication: Medication, time: string, logs: MedicationLog[]) {
  const now = Date.now();
  for (let offset = 0; offset < 8; offset += 1) {
    const day = addDays(startOfDay(new Date()), offset);
    if (!isScheduledOn(medication, day)) continue;
    const scheduledAt = slotDate(day, time);
    if (scheduledAt.getTime() + FOLLOW_UP_MINUTES * 60 * 1000 <= now) continue;
    if (findLogForSlot(logs, medication.id, scheduledAt)) continue;
    return scheduledAt;
  }
  return null;
}

async function scheduleFollowUp(medication: Medication, time: string, logs: MedicationLog[]) {
  await Notifications.cancelScheduledNotificationAsync(followUpId(medication.id, time)).catch(() => undefined);
  const scheduledAt = nextFollowUpSlot(medication, time, logs);
  if (!scheduledAt) return;
  await Notifications.scheduleNotificationAsync({
    identifier: followUpId(medication.id, time),
    content: doseContent(medication, time, true, scheduledAt),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(scheduledAt.getTime() + FOLLOW_UP_MINUTES * 60 * 1000),
      channelId: CHANNEL_ID,
    },
  });
}

async function scheduleMedication(medication: Medication, logs: MedicationLog[]) {
  if (!medication.is_active || medication.frequency === 'as_needed') return;

  for (const time of medication.schedule_times) {
    const [hour, minute] = time.split(':').map(Number);
    const trigger: Notifications.NotificationTriggerInput =
      medication.frequency === 'weekly'
        ? {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            // expo weekday: 1 = Sunday ... 7 = Saturday
            weekday: new Date(medication.created_at).getDay() + 1,
            hour,
            minute,
            channelId: CHANNEL_ID,
          }
        : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID };

    await Notifications.scheduleNotificationAsync({
      identifier: reminderId(medication.id, time),
      content: doseContent(medication, time, false),
      trigger,
    });
    await scheduleFollowUp(medication, time, logs);
  }
}

/**
 * Replace all scheduled medication reminders with ones matching the given medications.
 * Pending "remind me later" snoozes are kept.
 */
export async function syncMedicationReminders(
  medications: Medication[],
  logs: MedicationLog[],
  options: { askPermission?: boolean } = {}
) {
  try {
    const needsReminders = medications.some((m) => m.is_active && m.frequency !== 'as_needed' && m.schedule_times.length);
    if (!(await hasPermission(Boolean(options.askPermission) && needsReminders))) return false;
    await ensureSetup();

    const existing = await scheduledMedicationIds();
    await cancelIds(existing.filter((id) => !id.endsWith('-snooze')));

    for (const medication of medications) {
      await scheduleMedication(medication, logs);
    }
    return true;
  } catch (error) {
    console.warn('Failed to sync medication reminders', error);
    return false;
  }
}

/** Fetch medications and today's logs, then reschedule all reminders. */
export async function refreshMedicationReminders(options: { askPermission?: boolean } = {}) {
  try {
    const [medications, logs] = await Promise.all([
      listMedications(),
      listMedicationLogs({ from: startOfDay(new Date()) }),
    ]);
    return await syncMedicationReminders(medications, logs, options);
  } catch (error) {
    console.warn('Failed to refresh medication reminders', error);
    return false;
  }
}

/** Cancel every medication notification (e.g. on sign out). */
export async function cancelAllMedicationReminders() {
  try {
    await cancelIds(await scheduledMedicationIds());
  } catch (error) {
    console.warn('Failed to cancel medication reminders', error);
  }
}

/** Show a refill alert right away when a medication's supply is at or below its threshold. */
export async function notifyRefillIfNeeded(medication: Pick<Medication, 'id' | 'name' | 'supply_count' | 'needs_refill'>) {
  if (!medication.needs_refill || medication.supply_count === null) return;
  try {
    if (!(await hasPermission(false))) return;
    await ensureSetup();
    await Notifications.scheduleNotificationAsync({
      identifier: refillId(medication.id),
      content: {
        title: `🔔 Refill needed: ${medication.name}`,
        body:
          medication.supply_count === 0
            ? `You have run out of ${medication.name}. Please get a refill.`
            : `Only ${medication.supply_count} left. Time to refill ${medication.name}.`,
        sound: 'default',
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('Failed to show refill alert', error);
  }
}

/**
 * Remind again about a specific dose after `minutes` ("Defer"). Returns when the reminder
 * goes off, or null when notifications are not allowed.
 */
export async function snoozeDose(medication: Medication, time: string, scheduledAt: Date, minutes = FOLLOW_UP_MINUTES) {
  if (!(await hasPermission(false))) return null;
  await ensureSetup();
  const remindAt = new Date(Date.now() + minutes * 60 * 1000);
  await Notifications.scheduleNotificationAsync({
    identifier: snoozeId(medication.id, time),
    content: doseContent(medication, time, true, scheduledAt, remindAt),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remindAt, channelId: CHANNEL_ID },
  });
  return remindAt;
}

/** Pending snoozes keyed like dose slots (`<medicationId>-<HH:MM>`), with when each goes off. */
export async function getSnoozedDoses() {
  const snoozes: Record<string, Date> = {};
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of scheduled) {
      if (!request.identifier.startsWith(ID_PREFIX) || !request.identifier.endsWith('-snooze')) continue;
      const data = request.content.data as Partial<DoseNotificationData> | undefined;
      if (typeof data?.medicationId !== 'number' || !data.time || !data.remindAt) continue;
      snoozes[`${data.medicationId}-${data.time}`] = new Date(data.remindAt);
    }
  } catch (error) {
    console.warn('Failed to read medication snoozes', error);
  }
  return snoozes;
}

/**
 * Record a dose and keep its notifications in step: clears the pending follow-up/snooze,
 * snoozes on "deferred", and raises a refill alert when supply runs low.
 */
export async function recordDose(
  medication: Medication,
  time: string,
  scheduledAt: Date,
  status: DoseStatus,
  snoozeMinutes = FOLLOW_UP_MINUTES
) {
  const log = await logDose(medication.id, status, scheduledAt);
  let remindAt: Date | null = null;

  try {
    await cancelIds([followUpId(medication.id, time), snoozeId(medication.id, time)]);
    if (status === 'deferred') {
      remindAt = await snoozeDose(medication, time, scheduledAt, snoozeMinutes);
    } else if (await hasPermission(false)) {
      await scheduleFollowUp(medication, time, [log]);
    }
    if (status === 'taken') {
      await notifyRefillIfNeeded({
        id: medication.id,
        name: medication.name,
        supply_count: log.medication_supply_count,
        needs_refill: log.medication_needs_refill,
      });
    }
  } catch (error) {
    console.warn('Failed to update medication notifications', error);
  }

  return { log, remindAt };
}

/** The dose slot a notification refers to: the latest occurrence of its time at or before delivery. */
function slotFromNotification(data: DoseNotificationData, deliveredAt: number) {
  if (data.scheduledAt) return new Date(data.scheduledAt);
  const delivered = new Date(deliveredAt || Date.now());
  const sameDay = slotDate(delivered, data.time);
  return sameDay.getTime() > delivered.getTime() + 60 * 1000 ? addDays(sameDay, -1) : sameDay;
}

const handledResponses = new Set<string>();

/**
 * Handle a tap on a medication notification. Returns true when the notification was a
 * medication reminder, so the caller can open the Medication screen.
 */
export async function handleMedicationNotificationResponse(response: Notifications.NotificationResponse) {
  const { notification, actionIdentifier } = response;
  const data = notification.request.content.data as Partial<DoseNotificationData> | undefined;
  if (data?.type !== 'medication-dose' || typeof data.medicationId !== 'number' || !data.time) {
    return false;
  }

  const responseKey = `${notification.request.identifier}:${notification.date}:${actionIdentifier}`;
  if (handledResponses.has(responseKey)) return true;
  handledResponses.add(responseKey);

  const statusByAction: Record<string, DoseStatus> = {
    [ACTION_TAKEN]: 'taken',
    [ACTION_SKIP]: 'skipped',
    [ACTION_DEFER]: 'deferred',
  };
  const status = statusByAction[actionIdentifier];
  if (!status) return true; // plain tap: just open the Medication screen

  try {
    const medication = await getMedication(data.medicationId);
    const scheduledAt = slotFromNotification(data as DoseNotificationData, notification.date);
    await recordDose(medication, data.time, scheduledAt, status);
    await Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => undefined);
  } catch (error) {
    console.warn('Failed to log dose from notification', error);
  }
  return true;
}
