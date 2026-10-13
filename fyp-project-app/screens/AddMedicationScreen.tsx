import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { toApiErrorMessage } from '../services/api';
import {
  DEFAULT_TIMES,
  FREQUENCY_OPTIONS,
  createMedication,
  deleteMedication,
  formatTime12,
  getMedication,
  slotDate,
  toHHMM,
  updateMedication,
  weeklyDayLabel,
  type MedicationFrequency,
  type MedicationInput,
} from '../services/medicationService';
import { refreshMedicationReminders } from '../services/medicationReminderService';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type AddMedicationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MAX_TIMES = 6;
const GAP_OPTIONS = [2, 4, 6, 8, 12];

function defaultGap(frequency: MedicationFrequency) {
  if (frequency === 'twice_daily') return 12;
  if (frequency === 'three_times_daily') return 6;
  return 4;
}

/** A time `hours` after an "HH:MM" time, wrapping past midnight. */
function addHours(time: string, hours: number) {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `count` dose times starting at `first`, `gap` hours apart (duplicates after wrapping dropped). */
function spreadTimes(first: string, count: number, gap: number) {
  const times = Array.from({ length: count }, (_, i) => addHours(first, i * gap));
  return [...new Set(times)];
}

/** The gap of an existing schedule, when its first two times are whole hours apart. */
function inferGap(times: string[]) {
  if (times.length < 2) return null;
  const [h1, m1] = times[0].split(':').map(Number);
  const [h2, m2] = times[1].split(':').map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  return diff > 0 && diff % 60 === 0 ? diff / 60 : null;
}

export function AddMedicationScreen() {
  const navigation = useNavigation<AddMedicationScreenNavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddMedication'>>();
  const medicationId = route.params?.medicationId;
  const isEditing = medicationId !== undefined;

  // Form state
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState<MedicationFrequency>('daily');
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(DEFAULT_TIMES.daily);
  const [supplyCount, setSupplyCount] = useState('');
  const [refillThreshold, setRefillThreshold] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [createdAt, setCreatedAt] = useState(new Date().toISOString());
  const [gapHours, setGapHours] = useState(defaultGap('daily'));
  const [customGap, setCustomGap] = useState('');

  // UI state
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTimeIndex, setSelectedTimeIndex] = useState(0);
  // iOS: the time being dialled in the picker sheet, applied on "Done"
  const [draftTime, setDraftTime] = useState(new Date());

  useEffect(() => {
    if (medicationId === undefined) return;
    getMedication(medicationId)
      .then((medication) => {
        setMedicationName(medication.name);
        setDosage(medication.dosage);
        setFrequency(medication.frequency);
        setScheduleTimes(medication.schedule_times);
        const gap = inferGap(medication.schedule_times) ?? defaultGap(medication.frequency);
        setGapHours(gap);
        setCustomGap(GAP_OPTIONS.includes(gap) ? '' : String(gap));
        setSupplyCount(medication.supply_count === null ? '' : String(medication.supply_count));
        setRefillThreshold(String(medication.refill_threshold));
        setNotes(medication.notes ?? '');
        setIsActive(medication.is_active);
        setCreatedAt(medication.created_at);
      })
      .catch((error) => setLocalError(toApiErrorMessage(error, 'Failed to load medication.')))
      .finally(() => setIsLoading(false));
  }, [medicationId]);

  const handleFrequencyChange = (value: MedicationFrequency) => {
    setFrequency(value);
    setScheduleTimes(DEFAULT_TIMES[value]);
    setGapHours(defaultGap(value));
    setCustomGap('');
  };

  const applyGap = (gap: number) => {
    setGapHours(gap);
    if (scheduleTimes.length > 1) {
      setScheduleTimes(spreadTimes(scheduleTimes[0], scheduleTimes.length, gap));
    }
  };

  const handleCustomGap = (text: string) => {
    setCustomGap(text);
    const gap = Number(text);
    if (Number.isInteger(gap) && gap >= 1 && gap <= 23) applyGap(gap);
  };

  const handleSave = async () => {
    setLocalError(null);

    const trimmedName = medicationName.trim();
    const trimmedDosage = dosage.trim();

    // Validation
    if (!trimmedName) {
      setLocalError('Medication name is required.');
      return;
    }

    if (!trimmedDosage) {
      setLocalError('Dosage is required.');
      return;
    }

    if (frequency !== 'as_needed' && scheduleTimes.length === 0) {
      setLocalError('Add at least one dose time.');
      return;
    }

    const supplyText = supplyCount.trim();
    const supply = supplyText === '' ? null : Number(supplyText);
    if (supply !== null && (!Number.isInteger(supply) || supply < 0)) {
      setLocalError('Supply count must be a whole number.');
      return;
    }

    const thresholdText = refillThreshold.trim();
    const threshold = thresholdText === '' ? 7 : Number(thresholdText);
    if (!Number.isInteger(threshold) || threshold < 0) {
      setLocalError('Refill alert must be a whole number.');
      return;
    }

    const payload: MedicationInput = {
      name: trimmedName,
      dosage: trimmedDosage,
      frequency,
      schedule_times: frequency === 'as_needed' ? [] : scheduleTimes,
      supply_count: supply,
      refill_threshold: threshold,
      notes: notes.trim(),
      is_active: isActive,
    };

    setIsSaving(true);
    try {
      if (isEditing) {
        await updateMedication(medicationId, payload);
      } else {
        await createMedication(payload);
      }
      await refreshMedicationReminders({ askPermission: true });

      Alert.alert(
        'Success',
        isEditing ? 'Medication updated successfully!' : 'Medication added successfully! Reminders are set for each dose time.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error saving medication:', error);
      setLocalError(toApiErrorMessage(error, 'Failed to save medication. Please check your connection and try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing) return;
    Alert.alert(
      'Delete medication?',
      `${medicationName} and its dose history will be removed, and its reminders cancelled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              await deleteMedication(medicationId);
              await refreshMedicationReminders();
              navigation.goBack();
            } catch (error) {
              setLocalError(toApiErrorMessage(error, 'Failed to delete medication.'));
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  const setTimeAt = (index: number, date: Date) => {
    const time = toHHMM(date);
    if (scheduleTimes.some((existing, i) => i !== index && existing === time)) {
      setLocalError(`${formatTime12(time)} is already a dose time.`);
      return;
    }
    setLocalError(null);
    const newScheduleTimes = [...scheduleTimes];
    newScheduleTimes[index] = time;
    setScheduleTimes(newScheduleTimes);
  };

  // Android: native clock dialog, which reports "set" or "dismissed" once
  const handleAndroidTimeChange = (event: any, pickedDate?: Date) => {
    setShowTimePicker(false);
    if (event.type === 'set' && pickedDate) setTimeAt(selectedTimeIndex, pickedDate);
  };

  const confirmIosTime = () => {
    setShowTimePicker(false);
    setTimeAt(selectedTimeIndex, draftTime);
  };

  const showTimePickerForIndex = (index: number) => {
    setSelectedTimeIndex(index);
    setDraftTime(slotDate(new Date(), scheduleTimes[index] ?? '08:00'));
    setShowTimePicker(true);
  };

  const addTime = () => {
    const last = scheduleTimes[scheduleTimes.length - 1];
    const next = last ? addHours(last, gapHours) : '08:00';
    if (scheduleTimes.includes(next)) {
      setLocalError(`${formatTime12(next)} is already a dose time. Pick a smaller gap or tap a time to change it.`);
      return;
    }
    setLocalError(null);
    setScheduleTimes([...scheduleTimes, next]);
  };

  const removeTime = (index: number) => {
    setScheduleTimes(scheduleTimes.filter((_, i) => i !== index));
  };

  const pickerValue = slotDate(new Date(), scheduleTimes[selectedTimeIndex] ?? '08:00');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{isEditing ? 'Edit Medication' : 'Add New Medication'}</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.formCard}>
          {/* Medication Name */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Medication Name</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Paracetamol"
              placeholderTextColor="#9CA3AF"
              value={medicationName}
              onChangeText={setMedicationName}
            />
          </View>

          {/* Dosage */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Dosage</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. 500mg"
              placeholderTextColor="#9CA3AF"
              value={dosage}
              onChangeText={setDosage}
            />
          </View>

          {/* Frequency */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Frequency</Text>
            <View style={styles.frequencyContainer}>
              {FREQUENCY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.frequencyButton,
                    frequency === option.value && styles.frequencyButtonActive
                  ]}
                  onPress={() => handleFrequencyChange(option.value)}
                >
                  <Text style={[
                    styles.frequencyButtonText,
                    frequency === option.value && styles.frequencyButtonTextActive
                  ]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {frequency === 'weekly' && (
              <Text style={styles.helperText}>Repeats every {weeklyDayLabel({ created_at: createdAt })}.</Text>
            )}
          </View>

          {/* Schedule Times */}
          {frequency === 'as_needed' ? (
            <Text style={styles.helperText}>
              {'As-needed medications have no fixed reminders. Log a dose with "Take now" on the Medication screen.'}
            </Text>
          ) : (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Dose Times (a reminder is sent at each)</Text>
              <Text style={styles.helperText}>Tap a time to change it.</Text>
              <View style={styles.scheduleTimesContainer}>
                {scheduleTimes.map((time, index) => (
                  <View key={`${time}-${index}`} style={styles.timeChip}>
                    <Pressable
                      style={[styles.timePickerButton, styles.timePickerButtonRow]}
                      onPress={() => showTimePickerForIndex(index)}
                    >
                      <Ionicons name="time-outline" size={18} color={Colors.primary} />
                      <Text style={styles.timePickerText}>{formatTime12(time)}</Text>
                      <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
                    </Pressable>
                    {scheduleTimes.length > 1 && (
                      <Pressable onPress={() => removeTime(index)} hitSlop={8}>
                        <Text style={styles.removeTimeText}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                {scheduleTimes.length < MAX_TIMES && (
                  <Pressable style={[styles.timePickerButton, styles.addTimeButton]} onPress={addTime}>
                    <Text style={styles.addTimeText}>+ Add time</Text>
                  </Pressable>
                )}
              </View>

              <Text style={[styles.formLabel, styles.gapLabel]}>Gap between doses</Text>
              <View style={styles.gapContainer}>
                {GAP_OPTIONS.map((gap) => {
                  const selected = gapHours === gap && customGap === '';
                  return (
                    <Pressable
                      key={gap}
                      style={[styles.gapButton, selected && styles.frequencyButtonActive]}
                      onPress={() => {
                        setCustomGap('');
                        applyGap(gap);
                      }}
                    >
                      <Text style={[styles.frequencyButtonText, selected && styles.frequencyButtonTextActive]}>
                        {gap}h
                      </Text>
                    </Pressable>
                  );
                })}
                <TextInput
                  style={[styles.gapInput, customGap !== '' && styles.gapInputActive]}
                  placeholder="Custom h"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={2}
                  value={customGap}
                  onChangeText={handleCustomGap}
                />
              </View>
              <Text style={styles.helperText}>
                {scheduleTimes.length > 1
                  ? `Doses are spaced ${gapHours} hours apart from the first time. Tap any time to change it.`
                  : `"+ Add time" adds a dose ${gapHours} hours after the last one.`}
              </Text>
            </View>
          )}

          {/* Supply Count */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Current Supply (tablets/units)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. 30 (leave empty to skip refill alerts)"
              placeholderTextColor="#9CA3AF"
              value={supplyCount}
              onChangeText={setSupplyCount}
              keyboardType="number-pad"
            />
          </View>

          {/* Refill Threshold */}
          {supplyCount.trim() !== '' && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Refill Alert (when units left reach)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. 7"
                placeholderTextColor="#9CA3AF"
                value={refillThreshold}
                onChangeText={setRefillThreshold}
                keyboardType="number-pad"
              />
              <Text style={styles.helperText}>Supply goes down by one each time you mark a dose as taken.</Text>
            </View>
          )}

          {/* Notes */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Notes / Doctor Instructions</Text>
            <TextInput
              style={[styles.formInput, styles.formTextarea]}
              placeholder="e.g. Take after meals"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          {isEditing && (
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.formLabel}>Active</Text>
                <Text style={styles.helperText}>Pause to stop reminders without deleting history.</Text>
              </View>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: Colors.primary }} />
            </View>
          )}

          {/* Save Button */}
          <Pressable
            style={[styles.addMedicationButton, isSaving && styles.addMedicationButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.addMedicationButtonText}>{isEditing ? 'Save Changes' : 'Add Medication'}</Text>
            )}
          </Pressable>

          {isEditing && (
            <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={isSaving}>
              <Text style={styles.deleteButtonText}>Delete Medication</Text>
            </Pressable>
          )}

          {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        </View>

        {showTimePicker && Platform.OS === 'android' && (
          <DateTimePicker value={pickerValue} mode="time" display="clock" onChange={handleAndroidTimeChange} />
        )}
      </ScrollView>

      {Platform.OS === 'ios' && (
        <Modal visible={showTimePicker} transparent animationType="slide" onRequestClose={() => setShowTimePicker(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowTimePicker(false)}>
            <Pressable style={styles.sheet} onPress={() => undefined}>
              <View style={styles.sheetHeader}>
                <Pressable onPress={() => setShowTimePicker(false)} hitSlop={8}>
                  <Text style={styles.sheetCancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>Dose time</Text>
                <Pressable onPress={confirmIosTime} hitSlop={8}>
                  <Text style={styles.sheetDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draftTime}
                mode="time"
                display="spinner"
                themeVariant="light"
                onChange={(_event: any, date?: Date) => date && setDraftTime(date)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 60,
  },
  formCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    gap: 16,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  formInput: {
    height: 42,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '400',
    color: Colors.textPrimary,
  },
  formTextarea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  helperText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  frequencyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyButton: {
    height: 42,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    minWidth: '45%',
  },
  frequencyButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  frequencyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  frequencyButtonTextActive: {
    color: Colors.white,
  },
  scheduleTimesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timePickerButton: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    minWidth: 100,
  },
  timePickerButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sheetCancel: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  sheetDone: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  timePickerText: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textPrimary,
  },
  removeTimeText: {
    fontSize: 14,
    color: Colors.error,
    fontWeight: '700',
  },
  addTimeButton: {
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  gapLabel: {
    marginTop: 8,
  },
  gapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gapButton: {
    height: 38,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 48,
    paddingHorizontal: 10,
  },
  gapInput: {
    height: 38,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 10,
    minWidth: 84,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  gapInputActive: {
    borderColor: Colors.primary,
  },
  addTimeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    gap: 2,
  },
  addMedicationButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  addMedicationButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  addMedicationButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  deleteButton: {
    borderWidth: 1.5,
    borderColor: Colors.error,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: Colors.error,
    fontWeight: '700',
    fontSize: 16,
  },
  errorText: {
    color: Colors.error,
    fontWeight: '600',
    marginTop: 4,
  },
});
