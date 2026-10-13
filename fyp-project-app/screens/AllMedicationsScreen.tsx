import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { toApiErrorMessage } from '../services/api';
import {
  formatTime12,
  frequencyLabel,
  getNextDose,
  listMedications,
  toHHMM,
  weeklyDayLabel,
  type Medication,
} from '../services/medicationService';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type AllMedicationsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function AllMedicationsScreen() {
  const navigation = useNavigation<AllMedicationsScreenNavigationProp>();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMedications = useCallback(async () => {
    try {
      setMedications(await listMedications());
      setError(null);
    } catch (err) {
      setError(toApiErrorMessage(err, 'Failed to fetch medications'));
      console.error('Error fetching medications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchMedications);
    return unsubscribe;
  }, [navigation, fetchMedications]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMedications();
  };

  const scheduleText = (medication: Medication) => {
    if (medication.frequency === 'as_needed') return 'Take when needed';
    const times = medication.schedule_times.map(formatTime12).join(', ');
    return medication.frequency === 'weekly' ? `Every ${weeklyDayLabel(medication)} · ${times}` : times;
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
          <Pressable style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </Pressable>
        <Text style={styles.title}>All Medications</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {medications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💊</Text>
            <Text style={styles.emptyText}>No medications added yet</Text>
          </View>
        ) : (
          <View style={styles.medicationsSection}>
            <Text style={styles.hintText}>Tap a medication to edit, pause or delete it.</Text>
            {medications.map((medication) => {
              const nextDose = getNextDose(medication);
              return (
                <Pressable
                  key={medication.id}
                  style={[styles.medicationCard, !medication.is_active && styles.inactiveCard]}
                  onPress={() => navigation.navigate('AddMedication', { medicationId: medication.id })}
                >
                  <View style={styles.medicationHeader}>
                    <View style={styles.medicationInfo}>
                      <Text style={styles.medicationName}>{medication.name}</Text>
                      <Text style={styles.medicationDosage}>
                        {medication.dosage} • {frequencyLabel(medication.frequency)}
                      </Text>
                      <Text style={styles.medicationDosage}>{scheduleText(medication)}</Text>
                      {!medication.is_active ? (
                        <Text style={styles.pausedText}>Paused · reminders off</Text>
                      ) : nextDose ? (
                        <Text style={styles.nextDoseTime}>
                          Next dose: {nextDose.toLocaleDateString('en-US', { weekday: 'short' })} {formatTime12(toHHMM(nextDose))}
                        </Text>
                      ) : null}
                    </View>
                    {medication.needs_refill && (
                      <View style={styles.refillBadge}>
                        <Text style={styles.refillBadgeText}>⚠️ Low Supply</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.medicationStats}>
                    <Text style={styles.supplyText}>
                      {medication.supply_count === null ? 'Supply not tracked' : `Supply: ${medication.supply_count} units`}
                    </Text>
                    {medication.supply_count !== null && (
                      <Text style={styles.thresholdText}>
                        Refill at: {medication.refill_threshold} units
                      </Text>
                    )}
                  </View>

                  {medication.notes ? <Text style={styles.notesText}>📝 {medication.notes}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  medicationsSection: {
    gap: 12,
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
  hintText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  inactiveCard: {
    opacity: 0.6,
  },
  pausedText: {
    fontSize: 13,
    color: Colors.textHint,
    fontWeight: '600',
  },
  notesText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
