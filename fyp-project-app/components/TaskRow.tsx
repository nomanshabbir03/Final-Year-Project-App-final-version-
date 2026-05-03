import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Task } from '../context/AppContext';

type Props = {
  task: Task;
  onPress: () => void;
  onDelete?: () => void;
};

export function TaskRow({ task, onPress, onDelete }: Props) {
  const priorityColor =
    task.priority === 'High' ? '#dc2626' : task.priority === 'Medium' ? '#d97706' : '#16a34a';

  return (
    <Pressable style={[styles.row, task.done && styles.rowDone]} onPress={onPress}>
      <View style={styles.headerRow}>
        <Text style={[styles.text, task.done && styles.textDone]}>{task.title}</Text>
        <Text style={[styles.priority, { color: priorityColor }]}>{task.priority}</Text>
      </View>
      <Text style={styles.deadline}>Deadline: {task.deadline}</Text>
      {onDelete ? (
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  rowDone: {
    backgroundColor: '#ecfeff',
    borderColor: '#a5f3fc',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
    flex: 1,
  },
  textDone: {
    textDecorationLine: 'line-through',
    color: '#64748b',
  },
  priority: {
    fontSize: 12,
    fontWeight: '700',
  },
  deadline: {
    fontSize: 13,
    color: '#475569',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  deleteText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
  },
});
