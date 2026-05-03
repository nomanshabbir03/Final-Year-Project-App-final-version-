import React, { useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';

import { TaskRow } from '../components/TaskRow';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

type SpeechResultEvent = {
  results?: Array<{ transcript?: string }>;
};

type SpeechErrorEvent = {
  message?: string;
};

type SpeechModule = {
  start: (options: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;
  }) => void;
  stop: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  addListener: (eventName: string, listener: (event: any) => void) => { remove: () => void };
};

let speechModule: SpeechModule | null = null;

try {
  const speechPackage = require('expo-speech-recognition');
  speechModule = speechPackage.ExpoSpeechRecognitionModule as SpeechModule;
} catch {
  speechModule = null;
}

export function TasksScreen() {
  const { tasks, tasksLoading, tasksError, fetchTasks, deleteTask, toggleTask, addTask } =
    useAppContext();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSuccess, setVoiceSuccess] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const voiceHint = useMemo(
    () => 'Example: Add task Buy milk tomorrow',
    []
  );

  useEffect(() => {
    if (!speechModule) {
      return;
    }

    const startSub = speechModule.addListener('start', () => {
      setIsListening(true);
    });

    const endSub = speechModule.addListener('end', () => {
      setIsListening(false);
    });

    const errorSub = speechModule.addListener('error', (event: SpeechErrorEvent) => {
      setIsListening(false);
      setVoiceError(event.message || 'Speech recognition failed.');
    });

    const resultSub = speechModule.addListener('result', (event: SpeechResultEvent) => {
      const transcript = event.results?.[0]?.transcript?.trim();
      if (transcript) {
        setVoiceText(transcript);
        setVoiceError(null);
      }
    });

    return () => {
      startSub.remove();
      endSub.remove();
      errorSub.remove();
      resultSub.remove();
    };
  }, []);

  const parseVoiceCommand = (input: string) => {
    const normalized = input.trim();
    const match = normalized.match(/^add\s+task\s+(.+?)(?:\s+(today|tomorrow|\d{4}-\d{2}-\d{2}))?$/i);

    if (!match) {
      return null;
    }

    const title = match[1].trim();
    const rawDate = match[2]?.toLowerCase();
    if (!title) {
      return null;
    }

    const today = new Date();
    const date = new Date(today);

    if (rawDate === 'tomorrow') {
      date.setDate(today.getDate() + 1);
    } else if (rawDate === 'today' || !rawDate) {
      // Keep today's date as default.
    } else {
      const parsed = new Date(`${rawDate}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return { title, deadline: rawDate };
    }

    const deadline = date.toISOString().split('T')[0];
    return { title, deadline };
  };

  const handleRunVoiceCommand = async () => {
    setVoiceError(null);
    setVoiceSuccess(null);

    const parsed = parseVoiceCommand(voiceText);
    if (!parsed) {
      setVoiceError('Invalid command format. Use: Add task <title> <today|tomorrow|YYYY-MM-DD>');
      return;
    }

    const created = await addTask({
      title: parsed.title,
      description: 'Created from voice command',
      priority: 'Medium',
      deadline: parsed.deadline,
    });

    if (!created) {
      setVoiceError('Task could not be created.');
      return;
    }

    setVoiceSuccess(`Added: ${parsed.title} (${parsed.deadline})`);
    setVoiceText('');
  };

  const handleMicrophonePress = async () => {
    setVoiceError(null);
    setVoiceSuccess(null);

    if (!speechModule) {
      setVoiceError('Voice recognition requires a development build (not Expo Go).');
      return;
    }

    if (isListening) {
      speechModule.stop();
      return;
    }

    const permission = await speechModule.requestPermissionsAsync();
    if (!permission.granted) {
      setVoiceError('Microphone and speech permissions are required.');
      return;
    }

    speechModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <Text style={styles.subtitle}>Tap a task to mark complete</Text>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={tasksLoading} onRefresh={fetchTasks} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <>
            <View style={styles.voiceHeaderRow}>
              <Text style={styles.voiceTitle}>Voice Command</Text>
              <Pressable
                onPress={() => {
                  setShowVoiceInput((prev) => !prev);
                  setVoiceError(null);
                  setVoiceSuccess(null);
                }}
                style={styles.micButton}>
                <Text style={styles.micButtonText}>Microphone</Text>
              </Pressable>
            </View>

            {showVoiceInput ? (
              <View style={styles.voiceCard}>
                <Text style={styles.voiceHint}>{voiceHint}</Text>
                <TextInput
                  value={voiceText}
                  onChangeText={setVoiceText}
                  placeholder="Add task Buy milk tomorrow"
                  style={styles.voiceInput}
                />
                {!speechModule ? (
                  <Text style={styles.voiceHintWarning}>
                    Native voice input is unavailable in Expo Go. Use a development build for microphone recognition.
                  </Text>
                ) : null}
                <Pressable
                  style={[styles.voiceActionButton, isListening && styles.voiceActionButtonStop]}
                  onPress={handleMicrophonePress}>
                  <Text style={styles.voiceActionText}>
                    {isListening ? 'Stop Listening' : 'Start Listening'}
                  </Text>
                </Pressable>
                <Pressable style={styles.voiceActionButton} onPress={handleRunVoiceCommand}>
                  <Text style={styles.voiceActionText}>Run Command</Text>
                </Pressable>
                {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}
                {voiceSuccess ? <Text style={styles.voiceSuccess}>{voiceSuccess}</Text> : null}
              </View>
            ) : null}

            {tasksError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{tasksError}</Text>
                <Pressable onPress={() => fetchTasks(true)} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={<Text style={styles.empty}>No tasks yet. Add your first task.</Text>}
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            onPress={() => toggleTask(item.id)}
            onDelete={() => deleteTask(item.id)}
          />
        )}
      />

      {tasksLoading && tasks.length > 0 ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#1d4ed8" />
        </View>
      ) : null}

      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddTask')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
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
  },
  listContent: {
    padding: 16,
    paddingBottom: 96,
  },
  empty: {
    textAlign: 'center',
    marginTop: 18,
    color: '#64748b',
  },
  voiceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  voiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  micButton: {
    backgroundColor: '#e0e7ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  micButtonText: {
    color: '#3730a3',
    fontWeight: '700',
    fontSize: 12,
  },
  voiceCard: {
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#eef2ff',
    marginBottom: 12,
    gap: 8,
  },
  voiceHint: {
    fontSize: 12,
    color: '#475569',
  },
  voiceHintWarning: {
    fontSize: 12,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  voiceInput: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    height: 42,
    paddingHorizontal: 10,
  },
  voiceActionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  voiceActionButtonStop: {
    backgroundColor: '#b91c1c',
  },
  voiceActionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  voiceError: {
    color: '#b91c1c',
    fontWeight: '600',
    fontSize: 12,
  },
  voiceSuccess: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 12,
  },
  errorBox: {
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fecaca',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryText: {
    color: '#7f1d1d',
    fontWeight: '700',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 18,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 26,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '600',
  },
});
