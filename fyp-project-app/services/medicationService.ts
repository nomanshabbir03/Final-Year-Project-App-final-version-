import { api, parseJsonData } from './api';

export type MedicationFrequency = 'daily' | 'twice_daily' | 'three_times_daily' | 'weekly' | 'as_needed';
export type DoseStatus = 'taken' | 'skipped' | 'deferred';

export interface Medication {
  id: number;
  name: string;
  dosage: string;
  frequency: MedicationFrequency;
  schedule_times: string[];
  /** Remaining units; null when supply is not tracked (refill alert bypassed). */
  supply_count: number | null;
  refill_threshold: number;
  notes?: string | null;
  is_active: boolean;
  needs_refill: boolean;
  days_of_supply_left: number | null;
  created_at: string;
  updated_at: string;
}

export interface MedicationLog {
  id: number;
  medication: number;
  medication_name: string;
  medication_dosage: string;
  status: DoseStatus;
  scheduled_time: string;
  taken_at?: string | null;
  notes?: string | null;
  created_at: string;
  medication_supply_count: number | null;
  medication_needs_refill: boolean;
}

export type MedicationInput = {
  name: string;
  dosage: string;
  frequency: MedicationFrequency;
  schedule_times: string[];
  supply_count: number | null;
  refill_threshold: number;
  notes: string;
  is_active?: boolean;
};

export const FREQUENCY_OPTIONS: { value: MedicationFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'twice_daily', label: 'Twice Daily' },
  { value: 'three_times_daily', label: 'Three Times Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'as_needed', label: 'As Needed' },
];

export const DEFAULT_TIMES: Record<MedicationFrequency, string[]> = {
  daily: ['08:00'],
  twice_daily: ['08:00', '20:00'],
  three_times_daily: ['08:00', '14:00', '20:00'],
  weekly: ['09:00'],
  as_needed: [],
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function frequencyLabel(frequency: string) {
  return FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label ?? frequency;
}

/** Weekly medications repeat on the weekday they were added. */
export function weeklyDay(medication: Pick<Medication, 'created_at'>) {
  return new Date(medication.created_at).getDay();
}

export function weeklyDayLabel(medication: Pick<Medication, 'created_at'>) {
  return WEEKDAYS[weeklyDay(medication)];
}

// ---------- API ----------

export async function listMedications(): Promise<Medication[]> {
  const response = await api.get('/medications/');
  const data = parseJsonData<Medication[]>(response.data);
  return Array.isArray(data) ? data : [];
}

export async function getMedication(id: number): Promise<Medication> {
  const response = await api.get(`/medications/${id}/`);
  return parseJsonData<Medication>(response.data);
}

export async function createMedication(input: MedicationInput): Promise<Medication> {
  const response = await api.post('/medications/', input);
  return parseJsonData<Medication>(response.data);
}

export async function updateMedication(id: number, input: Partial<MedicationInput>): Promise<Medication> {
  const response = await api.patch(`/medications/${id}/`, input);
  return parseJsonData<Medication>(response.data);
}

export async function deleteMedication(id: number): Promise<void> {
  await api.delete(`/medications/${id}/`);
}

export async function listMedicationLogs(range?: { from?: Date; to?: Date }): Promise<MedicationLog[]> {
  const params: Record<string, string> = {};
  if (range?.from) params.from = range.from.toISOString();
  if (range?.to) params.to = range.to.toISOString();
  const response = await api.get('/medication-logs/', { params });
  const data = parseJsonData<MedicationLog[]>(response.data);
  return Array.isArray(data) ? data : [];
}

/** Log a dose. Logging the same dose slot again updates the existing entry. */
export async function logDose(medicationId: number, status: DoseStatus, scheduledAt: Date): Promise<MedicationLog> {
  const response = await api.post('/medication-logs/', {
    medication: medicationId,
    status,
    scheduled_time: scheduledAt.toISOString(),
    taken_at: status === 'taken' ? new Date().toISOString() : null,
  });
  return parseJsonData<MedicationLog>(response.data);
}

export async function deleteDoseLog(logId: number): Promise<void> {
  await api.delete(`/medication-logs/${logId}/`);
}

// ---------- Dose schedule helpers ----------

export function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Local Date for an "HH:MM" dose time on the given day. */
export function slotDate(day: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function formatTime12(time: string) {
  return slotDate(new Date(), time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function toHHMM(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Whether a medication has scheduled doses on the given day. */
export function isScheduledOn(medication: Medication, day: Date) {
  if (!medication.is_active || medication.frequency === 'as_needed' || !medication.schedule_times.length) {
    return false;
  }
  if (startOfDay(day) < startOfDay(new Date(medication.created_at))) {
    return false;
  }
  return medication.frequency !== 'weekly' || day.getDay() === weeklyDay(medication);
}

export type SlotStatus = DoseStatus | 'pending' | 'missed';

export interface DoseSlot {
  key: string;
  medication: Medication;
  time: string;
  scheduledAt: Date;
  log?: MedicationLog;
  status: SlotStatus;
}

/** A dose with no log this long after its time counts as missed. */
const MISSED_AFTER_MS = 60 * 60 * 1000;

export function findLogForSlot(logs: MedicationLog[], medicationId: number, scheduledAt: Date) {
  const target = scheduledAt.getTime();
  return logs.find(
    (log) => log.medication === medicationId && Math.abs(new Date(log.scheduled_time).getTime() - target) < 60 * 1000
  );
}

export function getDoseSlotsForDay(medications: Medication[], logs: MedicationLog[], day = new Date()): DoseSlot[] {
  const now = Date.now();
  const slots: DoseSlot[] = [];

  medications.forEach((medication) => {
    if (!isScheduledOn(medication, day)) return;
    medication.schedule_times.forEach((time) => {
      const scheduledAt = slotDate(day, time);
      const log = findLogForSlot(logs, medication.id, scheduledAt);
      let status: SlotStatus = log?.status ?? 'pending';
      if (!log && scheduledAt.getTime() + MISSED_AFTER_MS < now) {
        status = 'missed';
      }
      slots.push({ key: `${medication.id}-${time}`, medication, time, scheduledAt, log, status });
    });
  });

  return slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/** Next upcoming dose (today or later) for a medication, or null. */
export function getNextDose(medication: Medication, from = new Date()) {
  for (let offset = 0; offset < 8; offset += 1) {
    const day = addDays(startOfDay(from), offset);
    if (!isScheduledOn(medication, day)) continue;
    const upcoming = medication.schedule_times
      .map((time) => slotDate(day, time))
      .filter((date) => date > from)
      .sort((a, b) => a.getTime() - b.getTime());
    if (upcoming.length) return upcoming[0];
  }
  return null;
}

export interface AdherenceSummary {
  expected: number;
  taken: number;
  skipped: number;
  deferred: number;
  missed: number;
  asNeededTaken: number;
  /** Percentage of expected doses that were taken, or null when nothing was due. */
  adherence: number | null;
}

/** Adherence over the last `days` days (including today), counting only doses already due. */
export function computeAdherence(medications: Medication[], logs: MedicationLog[], days: number): AdherenceSummary {
  const summary: AdherenceSummary = { expected: 0, taken: 0, skipped: 0, deferred: 0, missed: 0, asNeededTaken: 0, adherence: null };
  const now = new Date();
  const windowStart = addDays(startOfDay(now), -(days - 1));

  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(windowStart, offset);
    getDoseSlotsForDay(medications, logs, day).forEach((slot) => {
      if (slot.scheduledAt > now || slot.scheduledAt < new Date(slot.medication.created_at)) return;
      summary.expected += 1;
      if (slot.status === 'taken') summary.taken += 1;
      else if (slot.status === 'skipped') summary.skipped += 1;
      else if (slot.status === 'deferred') summary.deferred += 1;
      else summary.missed += 1;
    });
  }

  const asNeededIds = new Set(medications.filter((m) => m.frequency === 'as_needed').map((m) => m.id));
  summary.asNeededTaken = logs.filter(
    (log) => asNeededIds.has(log.medication) && log.status === 'taken' && new Date(log.scheduled_time) >= windowStart
  ).length;
  summary.adherence = summary.expected > 0 ? Math.round((summary.taken / summary.expected) * 100) : null;
  return summary;
}
