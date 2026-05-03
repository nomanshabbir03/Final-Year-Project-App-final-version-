import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';

import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

export function AddTaskScreen() {
  const { addTask, tasksLoading, tasksError } = useAppContext();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [localError, setLocalError] = useState<string | null>(null);


  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [deadlineDate, setDeadlineDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const deadline = useMemo(() => deadlineDate.toISOString().split('T')[0], [deadlineDate]);

  const handleSave = async () => {
    setLocalError(null);
    const ok = await addTask({ title, description, priority, deadline });
    if (ok) {
      navigation.goBack();
      return;
    }

    setLocalError('Unable to save task. Please try again.');
  };

  return (
    <ScreenContainer title="Add Task" subtitle="Fill in details and save your task.">
      <View style={styles.group}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Task title"
          style={styles.input}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Task description"
          multiline
          style={[styles.input, styles.textarea]}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Priority</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={priority} onValueChange={(v) => setPriority(v)}>
            <Picker.Item label="Low" value="Low" />
            <Picker.Item label="Medium" value="Medium" />
            <Picker.Item label="High" value="High" />
          </Picker>
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Deadline</Text>
        <Pressable style={styles.deadlineButton} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.deadlineText}>{deadline}</Text>
        </Pressable>
      </View>

      {showDatePicker ? (
        <DateTimePicker
          value={deadlineDate}
          mode="date"
          display="default"
          onChange={(_, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setDeadlineDate(selectedDate);
            }
          }}
        />
      ) : null}

      {localError || tasksError ? <Text style={styles.errorText}>{localError ?? tasksError}</Text> : null}

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={tasksLoading}>
        <Text style={styles.saveText}>{tasksLoading ? 'Saving...' : 'Save Task'}</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  input: {
    height: 44,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  textarea: {
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  deadlineButton: {
    height: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  deadlineText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '600',
    marginTop: 4,
  },
});
