import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAppContext } from '../context/AppContext';
import { Colors } from '../constants/theme';
import type { RootStackParamList } from '../navigation/types';

type AddTaskScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type TaskPriority = 'low' | 'medium' | 'high';

export function AddTaskScreen() {
  const { addTask } = useAppContext();
  const navigation = useNavigation<AddTaskScreenNavigationProp>();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [deadline, setDeadline] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Handle Android hardware back button
  useEffect(() => {
    const backAction = () => {
      navigation.goBack();
      return true; // Prevent default back behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove(); // Cleanup on unmount
  }, []);

  const handleAddTask = async () => {
    setLocalError(null);
    setIsSaving(true);
    
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    
    // Validation
    if (!trimmedTitle) {
      setLocalError('Task title is required.');
      setIsSaving(false);
      return;
    }
    
    if (!deadline) {
      setLocalError('Assign day is required.');
      setIsSaving(false);
      return;
    }

    const payload = {
      title: trimmedTitle,
      description: trimmedDescription,
      priority,
      deadline: deadline
    };
    
    console.log('Sending payload to backend:', payload);

    try {
      const ok = await addTask(payload);
      
      if (!ok) {
        setLocalError('Unable to add task. Please try again.');
        setIsSaving(false);
        return;
      }

      // Navigate back to TasksScreen on success
      navigation.goBack();
    } catch (error) {
      console.error('Error adding task:', error);
      setLocalError('Failed to add task. Please check your connection and try again.');
      setIsSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    
    if (event.type === 'set' && selectedDate) {
      setSelectedDate(selectedDate);
      const dateStr = selectedDate.toISOString().split('T')[0];
      setDeadline(dateStr);
    }
  };

  const showDatepicker = () => {
    setShowDatePicker(true);
  };

  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return 'Select a date';
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.modalHeader}>
        <Pressable onPress={handleGoBack}>
          <Text style={styles.backButton}>← Back</Text>
        </Pressable>
        <Text style={styles.modalTitle}>Add New Task</Text>
        <View style={styles.placeholder} />
      </View>
      
      <View style={styles.formCard}>
        {/* Title */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Title</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. Buy groceries"
            placeholderTextColor="#9CA3AF"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Description */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Description</Text>
          <TextInput
            style={[styles.formInput, styles.formTextarea]}
            placeholder="e.g. From the nearby store"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Priority */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Priority</Text>
          <View style={styles.priorityContainer}>
            {(['low', 'medium', 'high'] as const).map(priorityOption => (
              <Pressable
                key={priorityOption}
                style={[
                  styles.priorityButton,
                  priority === priorityOption && styles.priorityButtonActive
                ]}
                onPress={() => setPriority(priorityOption)}
              >
                <Text style={[
                  styles.priorityButtonText,
                  priority === priorityOption && styles.priorityButtonTextActive
                ]}>
                  {priorityOption === 'high' ? 'High' : priorityOption === 'medium' ? 'Medium' : 'Low'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Assign Day */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Assign Day</Text>
          <Pressable style={styles.datePickerButton} onPress={showDatepicker}>
            <Text style={[styles.datePickerText, deadline ? { color: Colors.textPrimary } : {}]}>
              {formatDateDisplay(deadline)}
            </Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}

        {/* Add Task Button */}
        <Pressable 
          style={[styles.addTaskButton, isSaving && styles.addTaskButtonDisabled]} 
          onPress={handleAddTask} 
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.addTaskButtonText}>Add Task</Text>
          )}
        </Pressable>

        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
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
  priorityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    height: 42,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priorityButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priorityButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  priorityButtonTextActive: {
    color: Colors.white,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    height: 42,
    justifyContent: 'center',
  },
  datePickerButton: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    backgroundColor: Colors.white,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  datePickerText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#9CA3AF',
  },
  addTaskButton: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  addTaskButtonDisabled: {
    backgroundColor: Colors.primaryLight,
  },
  addTaskButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  errorText: {
    color: Colors.error,
    fontWeight: '600',
    marginTop: 4,
  },
});
