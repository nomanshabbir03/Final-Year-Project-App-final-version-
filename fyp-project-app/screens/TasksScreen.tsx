import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Calendar } from 'react-native-calendars';
import { BarChart } from 'react-native-chart-kit';

const { width, height } = Dimensions.get('window');

import { Colors } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

type Task = {
  id: string;
  title: string;
  description: string;
  category?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'done';
  deadline?: string | null | undefined;
  done?: boolean;
  reminder_time?: string | null;
  time_slot_start?: string | null;
  time_slot_end?: string | null;
  links?: string[];
  time_spent_seconds?: number;
  progress_percentage?: number;
  email_reminder_enabled?: boolean;
  attachments?: any[];
  created_at?: string;
  updated_at?: string;
};

type FilterType = 'TODAY' | 'ALL';
type ReportPeriod = 'daily' | 'weekly' | 'monthly';

export function TasksScreen() {
  const { tasks, tasksLoading, tasksError, fetchTasks, deleteTask, updateTask, addTask } = useAppContext();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('TODAY');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportPeriod, setReportPeriod] = useState<string>('weekly');

  // New task form state
  const [newTask, setNewTask] = useState<{
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    deadline: string | null | undefined;
    email_reminder_enabled: boolean;
  }>({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    deadline: undefined,
    email_reminder_enabled: false,
  });

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    
    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply time-based filter
    if (selectedFilter === 'TODAY') {
      const today = new Date();
      filtered = filtered.filter(task => {
        if (task.deadline) {
          const taskDate = new Date(task.deadline);
          return taskDate.toDateString() === today.toDateString();
        }
        return false;
      });
    }
    // 'ALL' filter shows all tasks (no additional filtering needed)
    
    return filtered;
  }, [tasks, searchQuery, selectedFilter]);

  // Group tasks by status for display
  const groupedTasks = useMemo(() => {
    const pendingTasks = filteredTasks.filter(task => task.status === 'pending');
    const inProgressTasks = filteredTasks.filter(task => task.status === 'in_progress');
    const doneTasks = filteredTasks.filter(task => task.status === 'done');
    
    return {
      pending: pendingTasks,
      inProgress: inProgressTasks,
      done: doneTasks,
    };
  }, [filteredTasks]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return Colors.error;
      case 'medium': return Colors.warning;
      case 'low': return Colors.success;
      default: return Colors.textSecondary;
    }
  };

  const getPriorityEmoji = (priority: string) => {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderTaskCard = (task: Task) => {
    const priorityColor = getPriorityColor(task.priority);
    const priorityEmoji = getPriorityEmoji(task.priority);
    
    return (
      <Pressable 
        style={[styles.taskCard, { borderLeftColor: priorityColor }]}
        onPress={() => handleEditTask(task)}
      >
        <View style={styles.taskHeader}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <View style={styles.taskActions}>
            <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
              <Text style={styles.priorityText}>{priorityEmoji} {task.priority.toUpperCase()}</Text>
            </View>
            <Pressable 
              style={styles.actionButton} 
              onPress={() => handleStatusChange(task)}
            >
              <Text style={styles.actionButtonText}>
                {task.email_reminder_enabled === true ? '🔔' : ''}{task.status === 'pending' ? '⏳' : task.status === 'in_progress' ? '🔄' : '✅'}
              </Text>
            </Pressable>
            <Pressable 
              style={[styles.actionButton, styles.deleteButton]} 
              onPress={() => handleDeleteTask(task)}
            >
              <Text style={styles.actionButtonText}>🗑️</Text>
            </Pressable>
          </View>
        </View>
        
        <View style={styles.taskMeta}>
          <Text style={styles.taskCategory}>{task.category}</Text>
          <Text style={styles.taskTime}>⏱ {Math.floor((task.time_spent_seconds || 0) / 3600)}h {Math.floor(((task.time_spent_seconds || 0) % 3600) / 60)}m tracked</Text>
          {task.attachments && task.attachments.length > 0 && (
            <Text style={styles.taskAttachments}>📎 {task.attachments.length}</Text>
          )}
          {task.deadline && (
            <Text style={styles.taskDeadline}>📅 {formatDate(task.deadline)}</Text>
          )}
        </View>
        
        <View style={[styles.progressBar, { backgroundColor: priorityColor }]}>
          <View style={[styles.progressFill, { width: `${(task.progress_percentage || 0)}%` }]} />
        </View>
      </Pressable>
    );
  };

  const renderSection = (title: string, tasks: Task[]) => {
    if (tasks.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title} · {tasks.length} task{tasks.length !== 1 ? 's' : ''}</Text>
        {tasks.map((task) => (
          <View key={task.id}>
            {renderTaskCard(task)}
          </View>
        ))}
      </View>
    );
  };

  const handleEditTask = (task: Task) => {
    // Set the modal to edit mode with existing task data
    setNewTask({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      deadline: task.deadline || null,
      email_reminder_enabled: task.email_reminder_enabled === true ? true : false,
    });
    setShowCreateModal(true);
  };

  const handleStatusChange = (task: Task) => {
    let newStatus: 'pending' | 'in_progress' | 'done';
    
    if (task.status === 'pending') {
      newStatus = 'in_progress';
    } else if (task.status === 'in_progress') {
      newStatus = 'done';
    } else {
      newStatus = 'pending';
    }

    Alert.alert(
      'Change Status',
      `Change task status to ${newStatus.replace('_', ' ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Change', 
          onPress: async () => {
            const ok = await updateTask(task.id, { status: newStatus });
            if (ok) {
              await fetchTasks(true);
            }
          }
        }
      ]
    );
  };

  const handleDeleteTask = (task: Task) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteTask(task.id);
            if (ok !== undefined && ok) {
              await fetchTasks(true);
            }
          }
        }
      ]
    );
  };

  const handleSaveTask = async () => {
    if (!newTask.title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    // Show processing state
    setIsSaving(true);

    const taskData = {
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      priority: newTask.priority,
      deadline: newTask.deadline,
      email_reminder_enabled: newTask.email_reminder_enabled,
    };

    const ok = await addTask({
      title: newTask.title,
      description: newTask.description,
      priority: newTask.priority,
      deadline: newTask.deadline || '',
    });
    
    // Hide processing state and close modal
    setIsSaving(false);
    setShowCreateModal(false);

    if (ok) {
      Alert.alert('Success', 'Task created successfully!');
      setNewTask({
        title: '',
        description: '',
        priority: 'medium' as 'low' | 'medium' | 'high',
        deadline: null,
        email_reminder_enabled: false,
      });
      await fetchTasks(true);
    } else {
      Alert.alert('Error', 'Failed to create task. Please try again.');
    }
  };

  const renderReports = () => {
    if (!reportData) return null;
    
    return (
      <ScrollView style={styles.reportsContainer}>
        <View style={styles.reportToggle}>
          {(['daily', 'weekly', 'monthly'] as ReportPeriod[]).map(period => (
            <Pressable
              key={period}
              style={[styles.reportToggleItem, reportPeriod === period && styles.reportToggleItemActive]}
              onPress={() => setReportPeriod(period)}
            >
              <Text style={[styles.reportToggleText, reportPeriod === period && styles.reportToggleTextActive]}>
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        
        <View style={styles.summaryCards}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>{reportData.summary?.total || 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Completed</Text>
            <Text style={styles.summaryValue}>{reportData.summary?.completed || 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={styles.summaryValue}>{reportData.summary?.pending || 0}</Text>
          </View>
        </View>
        
        <Text style={styles.sectionTitle}>Completion trend</Text>
        <View style={styles.chartContainer}>
          {/* Bar chart would go here using react-native-chart-kit */}
          <Text style={styles.chartPlaceholder}>Chart data would be displayed here</Text>
        </View>
        
        <Text style={styles.sectionTitle}>By priority</Text>
        {Object.entries(reportData.by_priority || {}).map(([priority, data]: [string, any]) => (
          <View key={priority} style={styles.progressRow}>
            <Text style={styles.progressLabel}>{data.label}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(data.completed / data.total) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>{data.completed}/{data.total}</Text>
          </View>
        ))}
        
        <Text style={styles.sectionTitle}>By category</Text>
        {Object.entries(reportData.by_category || {}).map(([category, data]: [string, any]) => (
          <View key={category} style={styles.progressRow}>
            <Text style={styles.progressLabel}>{category}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(data.completed / data.total) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>{data.completed}/{data.total}</Text>
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Tasks</Text>
          <Text style={styles.headerSubtitle}>{filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} today</Text>
        </View>
        <Pressable 
          style={styles.addButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.addButtonText}>+ New</Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Search tasks..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        <Pressable
          style={[
            styles.filterChip,
            selectedFilter === 'TODAY' ? styles.filterChipActive : styles.filterChipInactive
          ]}
          onPress={() => setSelectedFilter('TODAY')}
        >
          <Text style={[
            styles.filterText,
            selectedFilter === 'TODAY' ? styles.filterTextActive : styles.filterTextInactive
          ]}>
            TODAY
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterChip,
            selectedFilter === 'ALL' ? styles.filterChipActive : styles.filterChipInactive
          ]}
          onPress={() => setSelectedFilter('ALL')}
        >
          <Text style={[
            styles.filterText,
            selectedFilter === 'ALL' ? styles.filterTextActive : styles.filterTextInactive
          ]}>
            ALL
          </Text>
        </Pressable>
      </ScrollView>

      {/* Task List */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={tasksLoading} onRefresh={fetchTasks} />}
        ListHeaderComponent={() => (
          <View>
            <Text style={styles.sectionTitle}>Tasks · {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}</Text>
          </View>
        )}
        renderItem={({ item }) => renderTaskCard(item)}
      />

      {/* Create Task Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowCreateModal(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New Task</Text>
            <Pressable style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={handleSaveTask}>
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : 'Save Task'}
              </Text>
            </Pressable>
          </View>
          
          <ScrollView 
          style={styles.modalContent}
          contentContainerStyle={styles.modalContentContainer}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="never"
        >
            {/* Complete Task Creation Form */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Title *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Enter task title"
                value={newTask.title}
                onChangeText={(text) => setNewTask(prev => ({ ...prev, title: text }))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description</Text>
              <TextInput
                style={[styles.formInput, styles.formTextarea]}
                placeholder="Enter task description"
                multiline
                numberOfLines={3}
                value={newTask.description}
                onChangeText={(text) => setNewTask(prev => ({ ...prev, description: text }))}
              />
            </View>

            
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Priority</Text>
              <View style={styles.priorityContainer}>
                {(['low', 'medium', 'high'] as const).map(priority => (
                  <Pressable
                    key={priority}
                    style={[
                      styles.priorityButton,
                      newTask.priority === priority && (
                        priority === 'high' ? styles.priorityButtonHigh :
                        priority === 'medium' ? styles.priorityButtonMedium :
                        styles.priorityButtonLow
                      )
                    ]}
                    onPress={() => setNewTask(prev => ({ ...prev, priority }))}
                  >
                    <Text style={[
                      styles.priorityButtonText,
                      newTask.priority === priority && (
                        priority === 'high' ? styles.priorityButtonTextHigh :
                        priority === 'medium' ? styles.priorityButtonTextMedium :
                        styles.priorityButtonTextLow
                      )
                    ]}>
                      {priority === 'high' ? '🔴 HIGH' : priority === 'medium' ? '🟡 MED' : '🟢 LOW'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Assign Day</Text>
              <Pressable
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <View style={styles.dateButtonContent}>
                  <Text style={styles.dateButtonText}>
                    📅 {newTask.deadline ? formatDate(newTask.deadline) : 'Assign day'}
                  </Text>
                  <Text style={styles.dateButtonChevron}>›</Text>
                </View>
              </Pressable>
              
              {showDatePicker && (
                <View style={styles.datePickerOverlay}>
                  <View style={styles.calendarContent}>
                    <View style={styles.calendarHeader}>
                      <Text style={styles.datePickerTitle}>📅 Assign Day</Text>
                      <Pressable onPress={() => setShowDatePicker(false)} style={styles.closeCalendarButton}>
                        <Text style={styles.closeCalendarText}>✕</Text>
                      </Pressable>
                    </View>
                    <Calendar
                      onDayPress={(day) => {
                        setNewTask(prev => ({ ...prev, deadline: day.dateString }));
                        setShowDatePicker(false);
                      }}
                      markedDates={{
                        [newTask.deadline || '']: { selected: true, selectedColor: Colors.primary, selectedTextColor: '#FFFFFF' }
                      }}
                      theme={{
                        backgroundColor: Colors.surfaceLight,
                        calendarBackground: Colors.surfaceLight,
                        textSectionTitleColor: Colors.textPrimary,
                        selectedDayBackgroundColor: Colors.primary,
                        selectedDayTextColor: '#FFFFFF',
                        todayTextColor: Colors.primary,
                        dayTextColor: Colors.textPrimary,
                        textDisabledColor: Colors.textSecondary,
                        arrowColor: Colors.primary,
                        monthTextColor: Colors.textPrimary,
                        textMonthFontSize: width * 0.05,
                        textMonthFontWeight: '800',
                        textDayFontWeight: '500',
                        textDayHeaderFontWeight: '700',
                        textDayFontSize: width * 0.038,
                        textDayHeaderFontSize: width * 0.032,
                      }}
                      style={styles.calendar}
                    />
                    <Pressable
                      style={[styles.datePickerButton, styles.datePickerCancel]}
                      onPress={() => {
                        setNewTask(prev => ({ ...prev, deadline: null }));
                        setShowDatePicker(false);
                      }}
                    >
                      <Text style={styles.datePickerButtonText}>Clear Date</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email Reminder</Text>
              <View style={styles.switchContainer}>
                <Pressable
                  style={[
                    styles.switchButton,
                    newTask.email_reminder_enabled && styles.switchButtonActive
                  ]}
                  onPress={() => setNewTask(prev => ({ 
                    ...prev, 
                    email_reminder_enabled: !prev.email_reminder_enabled 
                  }))}
                >
                  <Text style={[
                    styles.switchButtonText,
                    newTask.email_reminder_enabled && styles.switchButtonTextActive
                  ]}>
                    {newTask.email_reminder_enabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Loading Overlay */}
      {isSaving && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Saving task...</Text>
          </View>
        </View>
      )}

      {tasksError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{tasksError}</Text>
          <Pressable onPress={() => fetchTasks(true)} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {tasksLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}
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
    justifyContent: 'space-between',
    paddingHorizontal: width * 0.05,
    paddingVertical: height * 0.025,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLight,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: width * 0.058,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: width * 0.033,
    color: Colors.textSecondary,
    marginTop: height * 0.002,
  },
  addButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: width * 0.045,
    paddingVertical: height * 0.013,
    borderRadius: width * 0.06,
  },
  addButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: width * 0.038,
  },
  searchContainer: {
    paddingHorizontal: width * 0.05,
    marginTop: height * 0.02,
  },
  searchInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: width * 0.04,
    paddingHorizontal: width * 0.045,
    paddingVertical: height * 0.018,
    fontSize: width * 0.04,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  filterContainer: {
    paddingHorizontal: width * 0.05,
    paddingVertical: height * 0.018,
  },
  filterChip: {
    paddingHorizontal: width * 0.055,
    paddingVertical: height * 0.016,
    borderRadius: width * 0.06,
    marginRight: width * 0.03,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
  },
  filterChipInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: width * 0.038,
    fontWeight: '700',
    color: '#1A2E1E',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  filterTextInactive: {
    color: '#1D9E75',
  },
  listContent: {
    paddingHorizontal: width * 0.04,
    paddingBottom: height * 0.15,
  },
  section: {
    marginBottom: height * 0.02,
  },
  sectionTitle: {
    fontSize: width * 0.042,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: height * 0.018,
    marginTop: height * 0.01,
    letterSpacing: 1,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    paddingLeft: width * 0.03,
  },
  taskCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: width * 0.04,
    padding: width * 0.05,
    marginBottom: height * 0.02,
    borderLeftWidth: 5,
    shadowColor: Colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: height * 0.01,
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: width * 0.02,
  },
  actionButton: {
    padding: width * 0.02,
    borderRadius: width * 0.04,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    minWidth: width * 0.08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    backgroundColor: Colors.error + '20' || '#ffebee',
    borderColor: Colors.error || '#f44336',
  },
  actionButtonText: {
    fontSize: width * 0.035,
    fontWeight: '700',
  },
  taskTitle: {
    fontSize: width * 0.043,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: height * 0.012,
    marginTop: height * 0.01,
  },
  priorityBadge: {
    paddingHorizontal: width * 0.025,
    paddingVertical: height * 0.006,
    borderRadius: width * 0.04,
  },
  priorityText: {
    fontSize: width * 0.028,
    fontWeight: '700',
    color: Colors.white,
  },
  taskDeadline: {
    fontSize: width * 0.032,
    color: Colors.textSecondary,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: width * 0.04,
    marginBottom: height * 0.018,
  },
  taskCategory: {
    fontSize: width * 0.033,
    color: Colors.textSecondary,
  },
  taskTime: {
    fontSize: width * 0.032,
    color: Colors.textSecondary,
  },
  taskAttachments: {
    fontSize: width * 0.033,
    color: Colors.textSecondary,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: width * 0.03,
  },
  progressBar: {
    height: height * 0.008,
    borderRadius: width * 0.01,
    backgroundColor: Colors.primaryLight,
    overflow: 'hidden',
    flex: 1,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  progressText: {
    fontSize: width * 0.03,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  shortcutButtons: {
    flexDirection: 'row',
    gap: width * 0.04,
    marginTop: height * 0.03,
    marginBottom: height * 0.08,
  },
  shortcutButton: {
    flex: 1,
    backgroundColor: Colors.primarySurface,
    paddingVertical: height * 0.025,
    borderRadius: width * 0.04,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  shortcutButtonText: {
    fontSize: width * 0.04,
    fontWeight: '700',
    color: Colors.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.bgLight,
    maxWidth: width,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: width * 0.05,
    paddingVertical: height * 0.025,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLight,
    minHeight: height * 0.08,
    maxWidth: width,
  },
  closeButton: {
    fontSize: width * 0.06,
    fontWeight: '600',
    color: Colors.primary,
    paddingHorizontal: width * 0.02,
    paddingVertical: height * 0.01,
  },
  modalTitle: {
    fontSize: width * 0.052,
    fontWeight: '800',
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: width * 0.05,
    height: height * 0.05,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: width * 0.05,
    paddingVertical: height * 0.014,
    minWidth: width * 0.2,
    maxWidth: width * 0.25,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: width * 0.038,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.textSecondary,
    opacity: 0.6,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    backgroundColor: Colors.surfaceLight,
    padding: width * 0.08,
    borderRadius: width * 0.06,
    alignItems: 'center',
    gap: height * 0.02,
  },
  loadingText: {
    fontSize: width * 0.04,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: height * 0.01,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: width * 0.04,
    paddingBottom: height * 0.15,
    maxWidth: width,
  },
  placeholderText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: 100,
  },
  calendar: {
    borderRadius: 12,
    margin: 16,
  },
  reportsContainer: {
    flex: 1,
    padding: 16,
  },
  reportToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    padding: 4,
    marginBottom: 24,
  },
  reportToggleItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  reportToggleItemActive: {
    backgroundColor: Colors.primary,
  },
  reportToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  reportToggleTextActive: {
    color: Colors.white,
  },
  summaryCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
  },
  chartContainer: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartPlaceholder: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  progressLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  progressTextSmall: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  errorBox: {
    backgroundColor: '#ffebee', // Colors.errorLight doesn't exist
    borderRadius: 12,
    padding: 16,
    margin: 16,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 12,
  },
  retryText: {
    color: Colors.white,
    fontWeight: '600',
  },
  // Form styles
  cardGroup: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: width * 0.04,
    padding: width * 0.05,
    marginBottom: height * 0.02,
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  formGroup: {
    marginBottom: height * 0.03,
    maxWidth: width,
  },
  formLabel: {
    fontSize: width * 0.03,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: height * 0.012,
  },
  formInput: {
    height: height * 0.065,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    fontSize: width * 0.045,
    fontWeight: '600',
    color: Colors.textPrimary,
    maxWidth: width,
  },
  formInputBorderless: {
    height: height * 0.065,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    fontSize: width * 0.045,
    fontWeight: '600',
    color: Colors.textPrimary,
    maxWidth: width,
  },
  formTextarea: {
    minHeight: height * 0.1,
    textAlignVertical: 'top',
    paddingTop: height * 0.015,
    fontSize: width * 0.038,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: width * 0.025,
    backgroundColor: Colors.surfaceLight,
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: width * 0.02,
  },
  priorityButton: {
    flex: 1,
    height: height * 0.018,
    paddingVertical: height * 0.018,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: width * 0.035,
    backgroundColor: Colors.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priorityButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priorityButtonHigh: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  priorityButtonMedium: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  priorityButtonLow: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  priorityButtonText: {
    fontSize: width * 0.038,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  priorityButtonTextActive: {
    color: Colors.white,
  },
  priorityButtonTextHigh: {
    color: '#EF4444',
  },
  priorityButtonTextMedium: {
    color: '#F59E0B',
  },
  priorityButtonTextLow: {
    color: '#22C55E',
  },
  dateButton: {
    paddingVertical: height * 0.02,
    paddingHorizontal: width * 0.04,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: width * 0.03,
    backgroundColor: Colors.bgLight,
    justifyContent: 'center',
  },
  dateButtonContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: width * 0.04,
  },
  dateButtonChevron: {
    color: Colors.textSecondary,
    fontSize: width * 0.04,
  },
  switchContainer: {
    alignItems: 'flex-start',
  },
  switchButton: {
    paddingHorizontal: width * 0.05,
    paddingVertical: height * 0.012,
    borderRadius: width * 0.05,
    minWidth: width * 0.15,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.bgLight,
  },
  switchButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  switchButtonText: {
    fontWeight: '700',
    fontSize: width * 0.035,
    textAlign: 'center',
    color: Colors.textSecondary,
  },
  switchButtonTextActive: {
    color: Colors.white,
  },
  // Calendar styles
  datePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarContent: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: width * 0.06,
    padding: width * 0.06,
    marginHorizontal: width * 0.05,
    maxWidth: width * 0.9,
    maxHeight: height * 0.8,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: height * 0.03,
  },
  datePickerTitle: {
    fontSize: width * 0.05,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  closeCalendarButton: {
    padding: width * 0.02,
    borderRadius: width * 0.04,
    backgroundColor: Colors.bgLight,
  },
  closeCalendarText: {
    fontSize: width * 0.04,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  datePickerButton: {
    backgroundColor: Colors.primary,
    paddingVertical: height * 0.022,
    paddingHorizontal: width * 0.04,
    borderRadius: width * 0.035,
    marginTop: height * 0.03,
    alignItems: 'center',
  },
  datePickerButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: width * 0.04,
  },
  datePickerCancel: {
    backgroundColor: Colors.bgLight,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  datePickerCancelText: {
    color: Colors.textSecondary,
  },
});
