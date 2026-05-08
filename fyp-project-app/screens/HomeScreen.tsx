import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

export function HomeScreen() {
  const { tasks, habits, weather } = useAppContext();
  const { user, logout } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const todaysTasks = tasks.filter((task) => task.deadline === today).slice(0, 3);
  const openTasks = tasks.filter((task) => !task.done).length;

  const completedHabitsToday = habits.filter((habit) => habit.lastCompletedDate === today).length;
  const habitProgressPercent = habits.length
    ? Math.round((completedHabitsToday / habits.length) * 100)
    : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.contentContainer}>
      <View style={styles.heroCard}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>Daily Workspace</Text>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>Everything important for today, in one place.</Text>
          </View>
          <Pressable style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
        <Text style={styles.userText}>{user?.email ?? 'Unknown user'}</Text>
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Open Tasks</Text>
          <Text style={styles.kpiValue}>{openTasks}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Habit Streak</Text>
          <Text style={styles.kpiValue}>{habitProgressPercent}%</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Weather</Text>
          <Text style={styles.kpiValue}>{weather ? `${weather.temperatureC}°` : '--'}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today’s Tasks</Text>
        {todaysTasks.length > 0 ? (
          todaysTasks.map((task) => (
            <View key={task.id} style={styles.taskRow}>
              <Text style={styles.taskTitle} numberOfLines={1}>
                {task.title}
              </Text>
              <Text style={styles.taskPriority}>{task.priority}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.mutedText}>No tasks due today.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Habit Progress</Text>
        <Text style={styles.bigValue}>
          {completedHabitsToday}/{habits.length || 0} completed today
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${habitProgressPercent}%` }]} />
        </View>
        <Text style={styles.mutedText}>{habitProgressPercent}% complete</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Weather Snapshot</Text>
        <Text style={styles.bigValue}>
          {weather ? `${weather.temperatureC}°C - ${weather.condition}` : 'Tap Weather tab to load data'}
        </Text>
        <Text style={styles.mutedText}>City: {weather?.city ?? '--'}</Text>
        <Text style={styles.mutedText}>Updated: {weather?.updatedAt ?? '--'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  contentContainer: {
    padding: 16,
    gap: 14,
    paddingBottom: 30,
  },
  heroCard: {
    backgroundColor: Colors.textPrimary,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  overline: {
    color: Colors.textHint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.white,
  },
  subtitle: {
    color: Colors.textSecondary,
    marginTop: 3,
  },
  userText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  logoutButton: {
    backgroundColor: Colors.surfaceDark,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logoutText: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 4,
  },
  kpiLabel: {
    color: Colors.textHint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  kpiValue: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 10,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  taskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  taskTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  taskPriority: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  bigValue: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.textHint,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
  },
  mutedText: {
    color: Colors.textHint,
    fontSize: 13,
  },
});
