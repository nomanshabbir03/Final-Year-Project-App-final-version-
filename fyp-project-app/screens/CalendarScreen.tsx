import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useAppContext } from '../context/AppContext';
import { ScreenContainer } from '../components/ScreenContainer';

interface CalendarDay {
  date: Date;
  tasks: any[];
  isCurrentMonth: boolean;
}

export function CalendarScreen() {
  const { tasks, fetchTasks } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: CalendarDay[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      const prevMonthDay = new Date(year, month, -startingDayOfWeek + i + 1);
      days.push({
        date: prevMonthDay,
        tasks: [],
        isCurrentMonth: false,
      });
    }

    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayTasks = tasks.filter(task => {
        if (!task.deadline) return false;
        const taskDate = new Date(task.deadline);
        return taskDate.toDateString() === date.toDateString();
      });

      days.push({
        date,
        tasks: dayTasks,
        isCurrentMonth: true,
      });
    }

    // Add empty cells to complete the grid
    const remainingCells = 42 - days.length; // 6 weeks * 7 days
    for (let i = 0; i < remainingCells; i++) {
      const nextMonthDay = new Date(year, month + 1, i + 1);
      days.push({
        date: nextMonthDay,
        tasks: [],
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate, tasks]);

  const monthYear = useMemo(() => {
    return currentDate.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  }, [currentDate]);

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const navigateMonth = (direction: number) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
  };

  const handleDayPress = (day: CalendarDay) => {
    if (day.isCurrentMonth) {
      setSelectedDate(day.date);
      if (day.tasks.length > 0) {
        Alert.alert(
          'Tasks for this day',
          day.tasks.map(task => `• ${task.title}`).join('\n')
        );
      }
    }
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    return date.toDateString() === selectedDate.toDateString();
  };

  return (
    <ScreenContainer title="Calendar">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.navButton} 
            onPress={() => navigateMonth(-1)}
          >
            <Text style={styles.navButtonText}>‹</Text>
          </TouchableOpacity>
          
          <Text style={styles.monthYear}>{monthYear}</Text>
          
          <TouchableOpacity 
            style={styles.navButton} 
            onPress={() => navigateMonth(1)}
          >
            <Text style={styles.navButtonText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Week days */}
        <View style={styles.weekContainer}>
          {weekDays.map(day => (
            <Text key={day} style={styles.weekDay}>
              {day}
            </Text>
          ))}
        </View>

        {/* Calendar grid */}
        <ScrollView style={styles.calendarContainer}>
          <View style={styles.calendarGrid}>
            {calendarDays.map((day, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  !day.isCurrentMonth && styles.otherMonthDay,
                  isToday(day.date) && styles.today,
                  isSelected(day.date) && styles.selectedDay,
                ]}
                onPress={() => handleDayPress(day)}
              >
                <Text style={[
                  styles.dayText,
                  !day.isCurrentMonth && styles.otherMonthText,
                  isToday(day.date) && styles.todayText,
                ]}>
                  {day.date.getDate()}
                </Text>
                {day.tasks.length > 0 && (
                  <View style={styles.taskIndicator}>
                    <Text style={styles.taskIndicatorText}>
                      {day.tasks.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Selected date info */}
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedDateText}>
            Selected: {selectedDate.toLocaleDateString()}
          </Text>
          <Text style={styles.taskCount}>
            {tasks.filter(task => {
              if (!task.deadline) return false;
              return new Date(task.deadline).toDateString() === selectedDate.toDateString();
            }).length} tasks for this date
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FF6B2C',
  },
  navButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  navButtonText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '700',
  },
  monthYear: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  weekContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  calendarContainer: {
    flex: 1,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  otherMonthDay: {
    backgroundColor: '#f8fafc',
  },
  today: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  selectedDay: {
    backgroundColor: '#FF6B2C',
    borderColor: '#FF6B2C',
  },
  dayText: {
    fontSize: 14,
    color: '#1f2937',
  },
  otherMonthText: {
    color: '#9ca3af',
  },
  todayText: {
    color: '#FF6B2C',
    fontWeight: '700',
  },
  taskIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskIndicatorText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '700',
  },
  selectedInfo: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 5,
  },
  taskCount: {
    fontSize: 14,
    color: '#64748b',
  },
});
