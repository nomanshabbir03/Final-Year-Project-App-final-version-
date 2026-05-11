import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, parseJsonData } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type MedicationScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Medication {
  id: number;
  name: string;
  dosage: string;
  frequency: string;
  schedule_times: string[];
  supply_count: number;
  refill_threshold: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MedicationLog {
  id: number;
  medication: number;
  status: 'taken' | 'skipped' | 'deferred';
  scheduled_time: string;
  taken_at?: string;
  notes?: string;
  created_at: string;
}

export function MedicationScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<MedicationScreenNavigationProp>();
  
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMedications();
    fetchMedicationLogs();
  }, []);

  const fetchMedications = async () => {
    try {
      console.log('API base URL:', api.defaults.baseURL);
      console.log('Full URL:', `${api.defaults.baseURL}/medications/`);
      const response = await api.get('/medications/');
      const data = parseJsonData(response.data);
      setMedications(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch medications');
      console.error('Error fetching medications:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMedicationLogs = async () => {
    try {
      console.log('API base URL:', api.defaults.baseURL);
      console.log('Full URL:', `${api.defaults.baseURL}/medication-logs/`);
      const response = await api.get('/medication-logs/');
      const data = parseJsonData(response.data);
      setMedicationLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching medication logs:', err);
    }
  };

  const getTodayDosesStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = medicationLogs.filter(log => 
      log.scheduled_time.startsWith(today)
    );
    
    // Calculate total scheduled doses for today
    let totalDoses = 0;
    medications.forEach(med => {
      if (med.is_active) {
        if (med.frequency === 'daily') {
          totalDoses += med.schedule_times.length || 1;
        } else if (med.frequency === 'twice_daily') {
          totalDoses += 2;
        } else if (med.frequency === 'three_times_daily') {
          totalDoses += 3;
        } else if (med.frequency === 'weekly') {
          totalDoses += 1; // Simplified for weekly
        }
      }
    });

    const takenDoses = todayLogs.filter(log => log.status === 'taken').length;
    return { taken: takenDoses, total: totalDoses };
  };

  const handleAddMedication = () => {
    navigation.navigate('AddMedication');
  };

  const handleViewHistory = () => {
    navigation.navigate('MedicationHistory');
  };

  const handleLogDose = async (medicationId: number) => {
    try {
      console.log('API base URL:', api.defaults.baseURL);
      console.log('Full URL:', `${api.defaults.baseURL}/medication-logs/`);
      const now = new Date().toISOString();
      await api.post('/medication-logs/', {
        medication: medicationId,
        status: 'taken',
        scheduled_time: now,
        taken_at: now,
      });
      fetchMedicationLogs(); // Refresh logs
    } catch (err) {
      console.error('Error logging dose:', err);
    }
  };

  const getFrequencyDisplay = (frequency: string) => {
    const frequencyMap: Record<string, string> = {
      'daily': 'Daily',
      'twice_daily': 'Twice Daily',
      'three_times_daily': 'Three Times Daily',
      'weekly': 'Weekly',
      'as_needed': 'As Needed',
    };
    return frequencyMap[frequency] || frequency;
  };

  const needsRefill = (medication: Medication) => {
    return medication.supply_count <= medication.refill_threshold;
  };

  const { taken, total } = getTodayDosesStats();
  const progressPercentage = total > 0 ? (taken / total) * 100 : 0;

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
          <Pressable style={styles.retryButton} onPress={fetchMedications}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Medication</Text>
          <Text style={styles.subtitle}>Track your medications and never miss a dose.</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Today's Doses</Text>
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

        <Pressable style={styles.addMedicationButton} onPress={handleAddMedication}>
          <Text style={styles.addMedicationButtonText}>+ Add Medication</Text>
        </Pressable>

        {medications.length > 0 && (
          <View style={styles.medicationsSection}>
            <Text style={styles.sectionTitle}>My Medications</Text>
            {medications.map((medication) => (
              <View key={medication.id} style={styles.medicationCard}>
                <View style={styles.medicationLeft}>
                  <Text style={styles.medicationEmoji}>💊</Text>
                  <View>
                    <Text style={styles.medicationName}>{medication.name}</Text>
                    <Text style={styles.medicationDosage}>{medication.dosage}</Text>
                  </View>
                </View>
                <View style={styles.medicationRight}>
                  <Text style={styles.frequencyBadge}>{getFrequencyDisplay(medication.frequency)}</Text>
                  {medication.is_active && (
                    <Pressable 
                      style={styles.logDoseButton} 
                      onPress={() => handleLogDose(medication.id)}
                    >
                      <Text style={styles.logDoseButtonText}>Log Dose</Text>
                    </Pressable>
                  )}
                  {needsRefill(medication) && (
                    <Text style={styles.refillBadge}>⚠️ Refill Soon</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable style={styles.historyButton} onPress={handleViewHistory}>
          <Text style={styles.historyButtonText}>View History 📋</Text>
        </Pressable>
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  medicationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  medicationEmoji: {
    fontSize: 24,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  medicationDosage: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  medicationRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  frequencyBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  logDoseButton: {
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logDoseButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 12,
  },
  refillBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.error,
    backgroundColor: '#ffebee',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
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
});
