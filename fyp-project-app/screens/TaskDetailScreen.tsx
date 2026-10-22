import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';

import { Colors, Radius, Shadows } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

type TaskDetailRouteProp = RouteProp<RootStackParamList, 'TaskDetail'>;

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

export function TaskDetailScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<TaskDetailRouteProp>();
  const { taskId } = route.params;
  const { tasks, tasksLoading, fetchTasks, updateTask, deleteTask } = useAppContext();
  
  const [task, setTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedPriority, setEditedPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [editedDeadline, setEditedDeadline] = useState('');
  const [editedStatus, setEditedStatus] = useState<'pending' | 'in_progress' | 'done'>('pending');

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const foundTask = tasks.find(t => t.id === taskId);
    if (foundTask) {
      setTask(foundTask);
      setEditedTitle(foundTask.title);
      setEditedDescription(foundTask.description || '');
      setEditedPriority(foundTask.priority);
      setEditedDeadline(foundTask.deadline || '');
      setEditedStatus(foundTask.status);
    }
  }, [tasks, taskId]);

  const handleSave = async () => {
    if (!task) return;

    setIsEditing(true);
    try {
      const updated = await updateTask(task.id, {
        title: editedTitle,
        description: editedDescription,
        priority: editedPriority,
        deadline: editedDeadline,
        status: editedStatus,
      });
      
      if (updated) {
        Alert.alert('Success', 'Task updated successfully!');
        navigation.goBack();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update task');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (!task) return;

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
              navigation.goBack();
            }
          },
        },
      ]
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return Colors.error;
      case 'medium': return Colors.warning;
      case 'low': return Colors.success;
      default: return Colors.textSecondary;
    }
  };

  if (!task) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading task...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={tasksLoading} onRefresh={fetchTasks} />}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{task.title}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Text style={[styles.detailValue, { color: getPriorityColor(task.priority) }]}>
              {task.status}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Priority:</Text>
            <Text style={[styles.detailValue, { color: getPriorityColor(task.priority) }]}>
              {task.priority.toUpperCase()}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Deadline:</Text>
            <Text style={styles.detailValue}>
              {task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No deadline'}
            </Text>
          </View>
        </View>

        {isEditing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Edit Task</Text>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Title</Text>
              <TextInput
                style={styles.formInput}
                value={editedTitle}
                onChangeText={setEditedTitle}
                placeholder="Task title"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description</Text>
              <TextInput
                style={[styles.formInput, styles.formTextarea]}
                value={editedDescription}
                onChangeText={setEditedDescription}
                placeholder="Task description"
                multiline
                numberOfLines={4}
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
                      editedPriority === priority && (
                        priority === 'high' ? styles.priorityButtonHigh :
                        priority === 'medium' ? styles.priorityButtonMedium :
                        styles.priorityButtonLow
                      )
                    ]}
                    onPress={() => setEditedPriority(priority)}
                  >
                    <Text style={[
                      styles.priorityButtonText,
                      editedPriority === priority && (
                        priority === 'high' ? styles.priorityButtonTextHigh :
                        priority === 'medium' ? styles.priorityButtonTextMedium :
                        styles.priorityButtonTextLow
                      )
                    ]}>
                      {priority === 'high' ? '🔴 HIGH' : priority === 'medium' ? '🟡 MEDIUM' : '🟢 LOW'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Deadline</Text>
              <TextInput
                style={styles.formInput}
                value={editedDeadline}
                onChangeText={setEditedDeadline}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Status</Text>
              <View style={styles.priorityContainer}>
                {(['pending', 'in_progress', 'done'] as const).map(status => (
                  <Pressable
                    key={status}
                    style={[
                      styles.priorityButton,
                      editedStatus === status && (
                        status === 'done' ? styles.priorityButtonHigh :
                        status === 'in_progress' ? styles.priorityButtonMedium :
                        styles.priorityButtonLow
                      )
                    ]}
                    onPress={() => setEditedStatus(status)}
                  >
                    <Text style={[
                      styles.priorityButtonText,
                      editedStatus === status && (
                        status === 'done' ? styles.priorityButtonTextHigh :
                        status === 'in_progress' ? styles.priorityButtonTextMedium :
                        styles.priorityButtonTextLow
                      )
                    ]}>
                      {status === 'pending' ? '⏳ PENDING' : status === 'in_progress' ? '🔄 IN PROGRESS' : '✅ DONE'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete Task</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  content: {
    padding: width * 0.04,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: height * 0.02,
    fontSize: width * 0.04,
    color: Colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: width * 0.05,
    paddingVertical: height * 0.02,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLight,
  },
  backButton: {
    padding: width * 0.02,
  },
  backButtonText: {
    fontSize: width * 0.04,
    color: Colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: width * 0.06,
    fontWeight: '800',
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  section: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: width * 0.04,
    padding: width * 0.05,
    marginBottom: height * 0.02,
  },
  sectionTitle: {
    fontSize: width * 0.045,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: height * 0.02,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: height * 0.015,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailLabel: {
    fontSize: width * 0.04,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: width * 0.04,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: height * 0.03,
  },
  formLabel: {
    fontSize: width * 0.035,
    color: Colors.textSecondary,
    marginBottom: height * 0.01,
    fontWeight: '600',
  },
  formInput: {
    backgroundColor: Colors.bgLight,
    borderRadius: Radius.md,
    padding: width * 0.04,
    fontSize: width * 0.04,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  formTextarea: {
    height: height * 0.15,
    textAlignVertical: 'top',
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: width * 0.02,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: height * 0.015,
    borderRadius: width * 0.03,
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
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
    fontSize: width * 0.035,
    fontWeight: '700',
    color: Colors.textSecondary,
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
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: width * 0.04,
    paddingVertical: height * 0.02,
    alignItems: 'center',
    marginTop: height * 0.03,
    ...Shadows.button,
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: width * 0.04,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: Colors.error,
    borderRadius: width * 0.04,
    paddingVertical: height * 0.02,
    alignItems: 'center',
    marginTop: height * 0.03,
  },
  deleteButtonText: {
    color: Colors.white,
    fontSize: width * 0.04,
    fontWeight: '700',
  },
});
