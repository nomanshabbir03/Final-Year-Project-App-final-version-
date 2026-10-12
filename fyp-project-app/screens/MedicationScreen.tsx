import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { toApiErrorMessage } from '../services/api';
import {
  deleteDoseLog,
  formatTime12,
  frequencyLabel,
  getDoseSlotsForDay,
  getNextDose,
  listMedicationLogs,
  listMedications,
  slotDate,
  startOfDay,
  toHHMM,
  type DoseSlot,
  type DoseStatus,
  type Medication,
  type MedicationLog,
} from '../services/medicationService';
import {
  SNOOZE_OPTIONS,
  getSnoozedDoses,
  recordDose,
  syncMedicationReminders,
} from '../services/medicationReminderService';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type MedicationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** "9:41" under an hour, "1h 05m" above. */
function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, '0')}m`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function snoozeLabel(minutes: number) {
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} min`;
}

const STATUS_LABELS: Record<DoseSlot['status'], string> = {
  taken: '✓ Taken',
  skipped: '✕ Skipped',
  deferred: '⏰ Due now',
  pending: 'Upcoming',
  missed: 'Missed',
};

export function MedicationScreen() {
  const navigation = useNavigation<MedicationScreenNavigationProp>();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [todayLogs, setTodayLogs] = useState<MedicationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  // "Remind me later": when each snoozed dose goes off, keyed by slot key
  const [snoozes, setSnoozes] = useState<Record<string, Date>>({});
  const [now, setNow] = useState(Date.now());
  const [snoozeSlot, setSnoozeSlot] = useState<DoseSlot | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [showSnoozeTimePicker, setShowSnoozeTimePicker] = useState(false);
  const [snoozeDraft, setSnoozeDraft] = useState(new Date());

  const loadData = useCallback(async () => {
    try {
      const [meds, logs] = await Promise.all([
        listMedications(),
        listMedicationLogs({ from: startOfDay(new Date()) }),
      ]);
      setMedications(meds);
      setTodayLogs(logs);
      setSnoozes(await getSnoozedDoses());
      setNow(Date.now());
      setError(null);
      // Keep on-device reminders in step with the server (asks for permission once)
      syncMedicationReminders(meds, logs, { askPermission: true });
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to fetch medications'));
      console.error('Error fetching medications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation, loadData]);

  // Tick the countdowns once a second while any snooze is still running
  const hasRunningSnooze = Object.values(snoozes).some((date) => date.getTime() > now);
  useEffect(() => {
    if (!hasRunningSnooze) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasRunningSnooze]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const slots = getDoseSlotsForDay(medications, todayLogs);
  const taken = slots.filter((slot) => slot.status === 'taken').length;
  const total = slots.length;
  const progressPercentage = total > 0 ? (taken / total) * 100 : 0;
  const asNeeded = medications.filter((med) => med.is_active && med.frequency === 'as_needed');
  const lowSupply = medications.filter((med) => med.is_active && med.needs_refill);

  const handleLogDose = async (
    medication: Medication,
    time: string,
    scheduledAt: Date,
    status: DoseStatus,
    key: string,
    snoozeMinutes?: number
  ) => {
    setBusySlot(key);
    try {
      const { log, remindAt } = await recordDose(medication, time, scheduledAt, status, snoozeMinutes);
      if (status === 'taken' && log.medication_needs_refill) {
        Alert.alert(
          'Refill reminder',
          log.medication_supply_count === 0
            ? `You have run out of ${medication.name}. Please get a refill.`
            : `Only ${log.medication_supply_count} left of ${medication.name}. Time to refill.`
        );
      } else if (status === 'deferred' && !remindAt) {
        Alert.alert('Notifications are off', 'Allow notifications for this app to get a reminder later.');
      }
      await loadData();
    } catch (err) {
      Alert.alert('Error', toApiErrorMessage(err, 'Failed to log dose'));
      console.error('Error logging dose:', err);
    } finally {
      setBusySlot(null);
    }
  };

  const openSnoozePicker = (slot: DoseSlot) => {
    setCustomMinutes('');
    setSnoozeSlot(slot);
  };

  const closeSnoozePicker = () => {
    setShowSnoozeTimePicker(false);
    setSnoozeSlot(null);
  };

  const snoozeFor = (minutes: number) => {
    const slot = snoozeSlot;
    closeSnoozePicker();
    if (!slot) return;
    handleLogDose(slot.medication, slot.time, slot.scheduledAt, 'deferred', slot.key, minutes);
  };

  const handleCustomMinutes = () => {
    const minutes = Number(customMinutes.trim());
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) {
      Alert.alert('Invalid time', 'Enter a number of minutes between 1 and 1440.');
      return;
    }
    snoozeFor(minutes);
  };

  const openSnoozeTimePicker = () => {
    setSnoozeDraft(new Date(Date.now() + 30 * 60 * 1000));
    setShowSnoozeTimePicker(true);
  };

  // Android: native clock dialog reports "set" or "dismissed" once
  const handleAndroidSnoozeTime = (event: any, picked?: Date) => {
    setShowSnoozeTimePicker(false);
    if (event.type === 'set' && picked) snoozeUntil(picked);
  };

  const snoozeUntil = (picked: Date) => {
    setShowSnoozeTimePicker(false);
    const target = slotDate(new Date(), toHHMM(picked));
    const minutes = Math.ceil((target.getTime() - Date.now()) / 60000);
    if (minutes < 1) {
      Alert.alert('Pick a later time', 'The reminder time has to be later today.');
      return;
    }
    snoozeFor(minutes);
  };

  const handleUndo = (slot: DoseSlot) => {
    if (!slot.log) return;
    const logId = slot.log.id;
    Alert.alert('Undo dose log?', `Remove the "${slot.log.status}" entry for ${slot.medication.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoseLog(logId);
            await loadData();
          } catch (err) {
            Alert.alert('Error', toApiErrorMessage(err, 'Failed to undo'));
          }
        },
      },
    ]);
  };

  const handleAddMedication = () => navigation.navigate('AddMedication');
  const handleEditMedication = (id: number) => navigation.navigate('AddMedication', { medicationId: id });
  const handleViewHistory = () => navigation.navigate('MedicationHistory');
  const handleViewAllMedications = () => navigation.navigate('AllMedications');

  const displayMedications = medications.slice(0, 3);
  const shouldShowViewAllButton = medications.length > 3;

  const handleSOSPress = () => {
    Alert.alert(
      'Emergency Call',
      'Call 1122 (Rescue) now?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call Now',
          style: 'destructive',
          onPress: () => Linking.openURL('tel:1122')
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading medications...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => { setLoading(true); loadData(); }}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const renderSlot = (slot: DoseSlot) => {
    const isFinal = slot.status === 'taken' || slot.status === 'skipped';
    const busy = busySlot === slot.key;
    const remindAt = slot.status === 'deferred' ? snoozes[slot.key] : undefined;
    const snoozeLeft = remindAt ? remindAt.getTime() - now : 0;
    return (
      <View key={slot.key} style={styles.slotCard}>
        <View style={styles.slotHeader}>
          <Text style={styles.slotTime}>{formatTime12(slot.time)}</Text>
          <View style={styles.slotInfo}>
            <Text style={styles.slotName}>{slot.medication.name}</Text>
            <Text style={styles.slotDosage}>{slot.medication.dosage}</Text>
          </View>
          <View style={[styles.statusChip, chipStyle(slot.status)]}>
            <Text style={styles.statusChipText}>
              {snoozeLeft > 0 ? `⏰ ${formatCountdown(snoozeLeft)}` : STATUS_LABELS[slot.status]}
            </Text>
          </View>
        </View>
        {remindAt && snoozeLeft > 0 && !busy && (
          <Text style={styles.snoozeText}>Reminder at {formatTime12(toHHMM(remindAt))}</Text>
        )}
        {isFinal ? (
          <Pressable onPress={() => handleUndo(slot)}>
            <Text style={styles.undoText}>
              {slot.status === 'taken' && slot.log?.taken_at
                ? `Logged at ${formatTime12(toHHMM(new Date(slot.log.taken_at)))} · Undo`
                : 'Undo'}
            </Text>
          </Pressable>
        ) : busy ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          <View style={styles.actionButtons}>
            <Pressable
              style={[styles.actionButton, styles.takeButton]}
              onPress={() => handleLogDose(slot.medication, slot.time, slot.scheduledAt, 'taken', slot.key)}
            >
              <Text style={styles.takeButtonText}>✓ Take</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.deferButton]}
              onPress={() => openSnoozePicker(slot)}
            >
              <Text style={styles.deferButtonText}>{snoozeLeft > 0 ? '⏰ Change' : '⏸ Later'}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.skipButton]}
              onPress={() => handleLogDose(slot.medication, slot.time, slot.scheduledAt, 'skipped', slot.key)}
            >
              <Text style={styles.skipButtonText}>✕ Skip</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Medication</Text>
          <Text style={styles.subtitle}>Track your medications and never miss a dose.</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{"Today's Doses"}</Text>
          {total === 0 ? (
            <Text style={styles.summaryText}>No medications scheduled for today</Text>
          ) : (
            <>
              <Text style={styles.summaryText}>
                {taken} of {total} doses taken today
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercentage}%` }
                  ]}
                />
              </View>
            </>
          )}
        </View>

        {lowSupply.length > 0 && (
          <View style={styles.refillBanner}>
            <Text style={styles.refillBannerTitle}>⚠️ Refill needed</Text>
            {lowSupply.map((med) => (
              <Text key={med.id} style={styles.refillBannerText}>
                {med.name}: {med.supply_count} left
                {med.days_of_supply_left !== null ? ` (~${med.days_of_supply_left} days)` : ''}
              </Text>
            ))}
          </View>
        )}

        <Pressable style={styles.addMedicationButton} onPress={handleAddMedication}>
          <Text style={styles.addMedicationButtonText}>+ Add Medication</Text>
        </Pressable>

        {slots.length > 0 && (
          <View style={styles.medicationsSection}>
            <Text style={styles.sectionTitle}>{"Today's Schedule"}</Text>
            {slots.map(renderSlot)}
          </View>
        )}

        {asNeeded.length > 0 && (
          <View style={styles.medicationsSection}>
            <Text style={styles.sectionTitle}>As Needed</Text>
            {asNeeded.map((med) => {
              const key = `${med.id}-now`;
              return (
                <View key={key} style={[styles.slotCard, styles.slotHeader]}>
                  <View style={styles.slotInfo}>
                    <Text style={styles.slotName}>{med.name}</Text>
                    <Text style={styles.slotDosage}>{med.dosage}</Text>
                  </View>
                  {busySlot === key ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : (
                    <Pressable
                      style={[styles.actionButton, styles.takeButton, styles.takeNowButton]}
                      onPress={() => {
                        const now = new Date();
                        now.setSeconds(0, 0);
                        handleLogDose(med, toHHMM(now), now, 'taken', key);
                      }}
                    >
                      <Text style={styles.takeButtonText}>Take now</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {displayMedications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💊</Text>
            <Text style={styles.emptyText}>No medications added yet</Text>
            <Pressable style={styles.addFirstButton} onPress={handleAddMedication}>
              <Text style={styles.addFirstButtonText}>+ Add Your First Medication</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.medicationsSection}>
            <Text style={styles.sectionTitle}>My Medications</Text>
            {displayMedications.map((medication) => {
              const nextDose = getNextDose(medication);
              const isToday = nextDose?.toDateString() === new Date().toDateString();
              return (
                <Pressable
                  key={medication.id}
                  style={[styles.medicationCard, !medication.is_active && styles.inactiveCard]}
                  onPress={() => handleEditMedication(medication.id)}
                >
                  <View style={styles.medicationHeader}>
                    <View style={styles.medicationInfo}>
                      <Text style={styles.medicationName}>{medication.name}</Text>
                      <Text style={styles.medicationDosage}>
                        {medication.dosage} • {frequencyLabel(medication.frequency)}
                      </Text>
                      {!medication.is_active ? (
                        <Text style={styles.pausedText}>Paused · reminders off</Text>
                      ) : nextDose ? (
                        <Text style={styles.nextDoseTime}>
                          Next dose: {isToday ? '' : `${nextDose.toLocaleDateString('en-US', { weekday: 'short' })} `}
                          {formatTime12(toHHMM(nextDose))}
                        </Text>
                      ) : null}
                    </View>
                    {medication.needs_refill && (
                      <View style={styles.refillBadge}>
                        <Text style={styles.refillBadgeText}>⚠️ Low Supply</Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.medicationStats, styles.medicationStatsLast]}>
                    <Text style={styles.supplyText}>
                      {medication.supply_count === null ? 'Supply not tracked' : `Supply: ${medication.supply_count} units`}
                    </Text>
                    {medication.supply_count !== null && (
                      <Text style={styles.thresholdText}>
                        Refill at: {medication.refill_threshold} units
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}

            {/* View All Button */}
            {shouldShowViewAllButton && (
              <Pressable style={styles.viewAllButton} onPress={handleViewAllMedications}>
                <Text style={styles.viewAllButtonText}>
                  View All Medications
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <Pressable style={styles.historyButton} onPress={handleViewHistory}>
          <Text style={styles.historyButtonText}>View History 📋</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={snoozeSlot !== null} transparent animationType="fade" onRequestClose={closeSnoozePicker}>
        <Pressable style={styles.modalBackdrop} onPress={closeSnoozePicker}>
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Remind me in…</Text>
            {snoozeSlot && (
              <Text style={styles.modalSubtitle}>
                {snoozeSlot.medication.name} · {snoozeSlot.medication.dosage}
              </Text>
            )}
            <View style={styles.snoozeOptions}>
              {SNOOZE_OPTIONS.map((minutes) => (
                <Pressable key={minutes} style={styles.snoozeOption} onPress={() => snoozeFor(minutes)}>
                  <Text style={styles.snoozeOptionText}>{snoozeLabel(minutes)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.modalLabel}>Custom</Text>
            <View style={styles.customRow}>
              <TextInput
                style={styles.customInput}
                placeholder="Minutes, e.g. 45"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                value={customMinutes}
                onChangeText={setCustomMinutes}
                onSubmitEditing={handleCustomMinutes}
              />
              <Pressable style={styles.customSetButton} onPress={handleCustomMinutes}>
                <Text style={styles.customSetText}>Set</Text>
              </Pressable>
            </View>
            <Pressable style={styles.pickTimeButton} onPress={openSnoozeTimePicker}>
              <Ionicons name="time-outline" size={18} color={Colors.primary} />
              <Text style={styles.pickTimeText}>Pick a time</Text>
            </Pressable>
            {showSnoozeTimePicker && Platform.OS === 'android' && (
              <DateTimePicker value={snoozeDraft} mode="time" display="clock" onChange={handleAndroidSnoozeTime} />
            )}
            {showSnoozeTimePicker && Platform.OS === 'ios' && (
              <>
                <DateTimePicker
                  value={snoozeDraft}
                  mode="time"
                  display="spinner"
                  themeVariant="light"
                  onChange={(_event: any, date?: Date) => date && setSnoozeDraft(date)}
                />
                <Pressable style={styles.customSetButton} onPress={() => snoozeUntil(snoozeDraft)}>
                  <Text style={[styles.customSetText, styles.pickTimeConfirm]}>
                    Remind me at {formatTime12(toHHMM(snoozeDraft))}
                  </Text>
                </Pressable>
              </>
            )}
            <Pressable style={styles.modalCancel} onPress={closeSnoozePicker}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* SOS Button */}
      <Pressable style={styles.sosButton} onPress={handleSOSPress}>
        <Ionicons name="call" size={20} color="#ffffff" />
        <Text style={styles.sosText}>SOS</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function chipStyle(status: DoseSlot['status']) {
  switch (status) {
    case 'taken':
      return { backgroundColor: Colors.success };
    case 'skipped':
    case 'missed':
      return { backgroundColor: Colors.error };
    case 'deferred':
      return { backgroundColor: Colors.warning };
    default:
      return { backgroundColor: Colors.primaryLight };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
  },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  summaryText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  addMedicationButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  addMedicationButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  medicationsSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  medicationCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  medicationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  medicationInfo: {
    flex: 1,
  },
  medicationName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  medicationDosage: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  nextDoseTime: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  medicationStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  supplyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  thresholdText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  takeButton: {
    backgroundColor: Colors.success,
  },
  takeButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  skipButton: {
    backgroundColor: Colors.error,
  },
  skipButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  refillBadge: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  refillBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#856404',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  addFirstButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  addFirstButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  sosButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sosText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
    marginTop: 2,
  },
  viewAllButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
  },
  viewAllButtonText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  historyButton: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 32,
  },
  historyButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  deferButton: {
    backgroundColor: Colors.warning,
  },
  deferButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  takeNowButton: {
    flex: 0,
    paddingHorizontal: 16,
  },
  slotCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  slotTime: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 72,
  },
  slotInfo: {
    flex: 1,
  },
  slotName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  slotDosage: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statusChip: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusChipText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  undoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  refillBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff3cd',
    borderColor: '#ffeaa7',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  refillBannerTitle: {
    fontWeight: '700',
    color: '#856404',
  },
  refillBannerText: {
    color: '#856404',
    fontSize: 13,
  },
  inactiveCard: {
    opacity: 0.6,
  },
  pausedText: {
    fontSize: 13,
    color: Colors.textHint,
    fontWeight: '600',
  },
  medicationStatsLast: {
    marginBottom: 0,
  },
  snoozeText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: -6,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  snoozeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snoozeOption: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  snoozeOptionText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  customRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  customSetButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  customSetText: {
    color: Colors.white,
    fontWeight: '700',
  },
  pickTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  pickTimeConfirm: {
    textAlign: 'center',
    paddingVertical: 12,
  },
  pickTimeText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
});
