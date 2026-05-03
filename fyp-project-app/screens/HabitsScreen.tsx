import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';

type HabitFrequency = 'Daily' | 'Weekly';

export function HabitsScreen() {
  const { habits, habitsLoading, habitsError, fetchHabits, addHabit, completeHabit } = useAppContext();
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<HabitFrequency>('Daily');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  const handleAddHabit = async () => {
    setLocalError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Habit name is required.');
      return;
    }

    const ok = await addHabit({ name: trimmed, frequency });
    if (!ok) {
      setLocalError('Unable to add habit. Please try again.');
      return;
    }

    setName('');
    setFrequency('Daily');
  };

  const markCompleted = async (id: string) => {
    await completeHabit(id);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Habits</Text>
        <Text style={styles.subtitle}>Track habits synced with backend streak logic.</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Habit Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Read 20 minutes"
          style={styles.input}
        />

        <Text style={styles.label}>Frequency</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={frequency} onValueChange={(v) => setFrequency(v)}>
            <Picker.Item label="Daily" value="Daily" />
            <Picker.Item label="Weekly" value="Weekly" />
          </Picker>
        </View>

        <Pressable style={styles.addButton} onPress={handleAddHabit} disabled={habitsLoading}>
          <Text style={styles.addButtonText}>Add Habit</Text>
        </Pressable>

        {localError || habitsError ? <Text style={styles.errorText}>{localError ?? habitsError}</Text> : null}
      </View>

      <FlatList
        data={habits}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={habitsLoading} onRefresh={fetchHabits} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No habits yet. Add one above.</Text>}
        renderItem={({ item }) => {
          const today = getTodayDateString();
          const completedToday = item.lastCompletedDate === today;
          return (
            <View style={styles.habitCard}>
              <Text style={styles.habitName}>{item.name}</Text>
              <Text style={styles.meta}>Frequency: {item.frequency}</Text>
              <Text style={styles.meta}>Current Streak: {item.streakCount}</Text>
              <Text style={styles.meta}>
                Last Completed: {item.lastCompletedDate ?? 'Not completed yet'}
              </Text>

              <Pressable
                style={[styles.completeButton, completedToday && styles.completeButtonDisabled]}
                onPress={() => markCompleted(item.id)}
                disabled={completedToday}>
                <Text style={styles.completeButtonText}>
                  {completedToday ? 'Completed Today' : 'Mark as Completed'}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />

      {habitsLoading && habits.length > 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#1d4ed8" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function getTodayDateString() {
  return formatDate(new Date());
}

function formatDate(date: Date) {
  return date.toISOString().split('T')[0];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2f7',
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
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    paddingHorizontal: 16,
  },
  formCard: {
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe3ef',
    padding: 12,
    gap: 8,
  },
  label: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  addButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '600',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 14,
  },
  habitCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe3ef',
    padding: 12,
    gap: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  meta: {
    fontSize: 13,
    color: '#475569',
  },
  completeButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  completeButtonDisabled: {
    backgroundColor: '#86efac',
  },
  completeButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    right: 18,
    top: 14,
  },
});
