import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  completeHabit as completeHabitRequest,
  createHabit as createHabitRequest,
  deleteHabit as deleteHabitRequest,
  getHabits as getHabitsRequest,
  updateHabit as updateHabitRequest,
  type HabitFrequency,
  type HabitCategory,
} from '../services/habitService';
import { toApiErrorMessage } from '../services/api';
import {
  createTask as createTaskRequest,
  deleteTask as deleteTaskRequest,
  getTasks as getTasksRequest,
  getTask as getTaskRequest,
  updateTask as updateTaskRequest,
  logTime as logTimeRequest,
  sendReminderEmail as sendReminderEmailRequest,
  getTaskReport as getTaskReportRequest,
  searchTasks as searchTasksRequest,
  getTasksByPriority as getTasksByPriorityRequest,
  getTasksByStatus as getTasksByStatusRequest,
  getTasksByCategory as getTasksByCategoryRequest,
} from '../services/taskService';

export type Task = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'done';
  deadline?: string | null;
  reminder_time?: string | null;
  time_slot_start?: string | null;
  time_slot_end?: string | null;
  links: string[];
  time_spent_seconds: number;
  progress_percentage: number;
  email_reminder_enabled: boolean;
  attachments: any[];
  created_at: string;
  updated_at: string;
};

export type Habit = {
  id: string;
  name: string;
  frequency: HabitFrequency;
  category: HabitCategory;
  streakCount: number;
  bestStreak: number;
  lastCompletedDate: string | null;
  reminderTime: string | null;
};

type WeatherSnapshot = {
  city: string;
  temperatureC: number;
  condition: string;
  updatedAt: string;
};

type AppContextValue = {
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string | null;
  habits: Habit[];
  habitsLoading: boolean;
  habitsError: string | null;
  weather: WeatherSnapshot | null;
  fetchTasks: (force?: boolean) => Promise<void>;
  fetchHabits: (force?: boolean) => Promise<void>;
  preloadDashboardData: () => Promise<void>;
  addTask: (input: {
    title: string;
    description: string;
    priority: Task['priority'];
    deadline: string;
  }) => Promise<boolean>;
  addHabit: (input: { name: string; frequency: HabitFrequency; category: HabitCategory }) => Promise<boolean>;
  updateHabit: (id: string, name: string, frequency: HabitFrequency, reminderTime?: string) => Promise<boolean>;
  deleteHabit: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string) => void;
  completeHabit: (id: string) => Promise<void>;
  setWeather: (value: WeatherSnapshot) => void;
  // New task functions
  getTask: (id: string) => Promise<Task>;
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  logTime: (taskId: string, seconds: number) => Promise<any>;
  sendReminderEmail: (taskId: string) => Promise<any>;
  getTaskReport: (period: 'daily' | 'weekly' | 'monthly') => Promise<any>;
  searchTasks: (query: string, filters?: any) => Promise<Task[]>;
  getTasksByPriority: (priority: string) => Promise<Task[]>;
  getTasksByStatus: (status: string) => Promise<Task[]>;
  getTasksByCategory: (category: string) => Promise<Task[]>;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(false);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const tasksRef = useRef<Task[]>([]);
  const habitsRef = useRef<Habit[]>([]);
  const tasksLastFetchedAtRef = useRef<number>(0);
  const habitsLastFetchedAtRef = useRef<number>(0);
  const tasksFetchInFlightRef = useRef<Promise<void> | null>(null);
  const habitsFetchInFlightRef = useRef<Promise<void> | null>(null);

  const fetchTasks = useCallback(async (force = false) => {
    if (!force && tasksRef.current.length > 0 && Date.now() - tasksLastFetchedAtRef.current < 15000) {
      return;
    }

    if (tasksFetchInFlightRef.current) {
      return tasksFetchInFlightRef.current;
    }

    const runner = (async () => {
      setTasksLoading(true);
      setTasksError(null);

      try {
        const remoteTasks = await getTasksRequest();
        setTasks(remoteTasks as Task[]);
        tasksRef.current = remoteTasks as Task[];
        tasksLastFetchedAtRef.current = Date.now();
      } catch (error) {
        console.warn('Failed to fetch tasks from backend', error);
        setTasksError(toApiErrorMessage(error, 'Could not load tasks from server.'));
      } finally {
        setTasksLoading(false);
        tasksFetchInFlightRef.current = null;
      }
    })();

    tasksFetchInFlightRef.current = runner;
    return runner;
  }, []);

  const fetchHabits = useCallback(async (force = false) => {
    if (!force && habitsRef.current.length > 0 && Date.now() - habitsLastFetchedAtRef.current < 15000) {
      return;
    }

    if (habitsFetchInFlightRef.current) {
      return habitsFetchInFlightRef.current;
    }

    const runner = (async () => {
      setHabitsLoading(true);
      setHabitsError(null);

      try {
        const remoteHabits = await getHabitsRequest();
        setHabits(remoteHabits);
        habitsRef.current = remoteHabits;
        habitsLastFetchedAtRef.current = Date.now();
      } catch (error) {
        console.warn('Failed to fetch habits from backend', error);
        setHabitsError(toApiErrorMessage(error, 'Could not load habits from server.'));
      } finally {
        setHabitsLoading(false);
        habitsFetchInFlightRef.current = null;
      }
    })();

    habitsFetchInFlightRef.current = runner;
    return runner;
  }, []);

  const preloadDashboardData = useCallback(async () => {
    await Promise.all([fetchTasks(true), fetchHabits(true)]);
  }, [fetchHabits, fetchTasks]);

  const addTask = useCallback(async (input: {
    title: string;
    description: string;
    priority: Task['priority'];
    deadline: string | null;
  }) => {
    const clean = input.title.trim();
    if (!clean) {
      setTasksError('Title is required.');
      return false;
    }

    setTasksLoading(true);
    setTasksError(null);

    try {
      const created = await createTaskRequest({
        title: clean,
        description: input.description.trim(),
        priority: input.priority,
        deadline: input.deadline,
      });
      setTasks((prev) => [created as Task, ...prev]);
      return true;
    } catch (error) {
      console.warn('Failed to create task in backend', error);
      setTasksError(toApiErrorMessage(error, 'Could not create task. Please try again.'));
      return false;
    } finally {
      setTasksLoading(false);
    }
  }, [fetchTasks]);

  const addHabit = useCallback(async (input: { name: string; frequency: HabitFrequency; category: HabitCategory }) => {
    const clean = input.name.trim();
    if (!clean) {
      setHabitsError('Habit name is required.');
      return false;
    }

    setHabitsLoading(true);
    setHabitsError(null);

    try {
      const created = await createHabitRequest({
        name: clean,
        frequency: input.frequency,
        category: input.category,
      });
      setHabits((prev) => [created, ...prev]);
      await fetchHabits(true);
      return true;
    } catch (error) {
      console.warn('Failed to create habit in backend', error);
      setHabitsError(toApiErrorMessage(error, 'Could not create habit. Please try again.'));
      return false;
    } finally {
      setHabitsLoading(false);
    }
  }, [fetchHabits]);

  const deleteTask = useCallback(async (id: string) => {
    setTasksLoading(true);
    setTasksError(null);

    try {
      await deleteTaskRequest(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch (error) {
      console.warn('Failed to delete task in backend', error);
      setTasksError(toApiErrorMessage(error, 'Could not delete task. Please try again.'));
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, done: !task.done } : task))
    );
  }, []);

  const completeHabit = useCallback(async (id: string) => {
    setHabitsLoading(true);
    setHabitsError(null);

    try {
      const updated = await completeHabitRequest(id);
      setHabits((prev) => prev.map((habit) => (habit.id === id ? updated : habit)));
    } catch (error) {
      console.warn('Failed to complete habit in backend', error);
      setHabitsError(toApiErrorMessage(error, 'Could not update habit streak. Please try again.'));
    } finally {
      setHabitsLoading(false);
    }
  }, []);

const updateHabit = useCallback(async (id: string, name: string, frequency: HabitFrequency, reminderTime?: string) => {
    setHabitsLoading(true);
    setHabitsError(null);

    try {
      const updated = await updateHabitRequest(id, name, frequency, reminderTime);
      setHabits((prev) => prev.map((habit) => (habit.id === id ? updated : habit)));
      return true;
    } catch (error) {
      console.warn('Failed to update habit in backend', error);
      setHabitsError(toApiErrorMessage(error, 'Could not update habit. Please try again.'));
      return false;
    } finally {
      setHabitsLoading(false);
    }
  }, []);

  const deleteHabit = useCallback(async (id: string) => {
    setHabitsLoading(true);
    setHabitsError(null);

    try {
      await deleteHabitRequest(id);
      setHabits((prev) => prev.filter((habit) => habit.id !== id));
    } catch (error) {
      console.warn('Failed to delete habit in backend', error);
      setHabitsError(toApiErrorMessage(error, 'Could not delete habit. Please try again.'));
    } finally {
      setHabitsLoading(false);
    }
  }, []);

  // New task functions
  const getTask = useCallback(async (id: string) => {
    try {
      const task = await getTaskRequest(id);
      return task;
    } catch (error) {
      console.warn('Failed to get task from backend', error);
      throw error;
    }
  }, []);

  const updateTask = useCallback(async (id: string, data: Partial<Task>) => {
    setTasksLoading(true);
    setTasksError(null);

    try {
      const updated = await updateTaskRequest(id, data);
      setTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
      return updated;
    } catch (error) {
      console.warn('Failed to update task in backend', error);
      setTasksError(toApiErrorMessage(error, 'Could not update task. Please try again.'));
      throw error;
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const logTime = useCallback(async (taskId: string, seconds: number) => {
    try {
      const result = await logTimeRequest(taskId, seconds);
      // Refresh tasks to get updated time
      await fetchTasks(true);
      return result;
    } catch (error) {
      console.warn('Failed to log time in backend', error);
      setTasksError(toApiErrorMessage(error, 'Could not log time. Please try again.'));
      throw error;
    }
  }, [fetchTasks]);

  const sendReminderEmail = useCallback(async (taskId: string) => {
    try {
      const result = await sendReminderEmailRequest(taskId);
      return result;
    } catch (error) {
      console.warn('Failed to send reminder email from backend', error);
      setTasksError(toApiErrorMessage(error, 'Could not send reminder email. Please try again.'));
      throw error;
    }
  }, []);

  const getTaskReport = useCallback(async (period: 'daily' | 'weekly' | 'monthly') => {
    try {
      const report = await getTaskReportRequest(period);
      return report;
    } catch (error) {
      console.warn('Failed to get task report from backend', error);
      throw error;
    }
  }, []);

  const searchTasks = useCallback(async (query: string, filters = {}) => {
    try {
      const tasks = await searchTasksRequest(query, filters);
      return tasks;
    } catch (error) {
      console.warn('Failed to search tasks in backend', error);
      throw error;
    }
  }, []);

  const getTasksByPriority = useCallback(async (priority: string) => {
    try {
      const tasks = await getTasksByPriorityRequest(priority);
      return tasks;
    } catch (error) {
      console.warn('Failed to get tasks by priority from backend', error);
      throw error;
    }
  }, []);

  const getTasksByStatus = useCallback(async (status: string) => {
    try {
      const tasks = await getTasksByStatusRequest(status);
      return tasks;
    } catch (error) {
      console.warn('Failed to get tasks by status from backend', error);
      throw error;
    }
  }, []);

  const getTasksByCategory = useCallback(async (category: string) => {
    try {
      const tasks = await getTasksByCategoryRequest(category);
      return tasks;
    } catch (error) {
      console.warn('Failed to get tasks by category from backend', error);
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      tasksLoading,
      tasksError,
      habits,
      habitsLoading,
      habitsError,
      weather,
      fetchTasks,
      fetchHabits,
      preloadDashboardData,
      addTask,
      addHabit,
      updateHabit,
      deleteHabit,
      deleteTask,
      toggleTask,
      completeHabit,
      setWeather,
      // New task functions
      getTask,
      updateTask,
      logTime,
      sendReminderEmail,
      getTaskReport,
      searchTasks,
      getTasksByPriority,
      getTasksByStatus,
      getTasksByCategory,
    }),
    [
      tasks,
      tasksLoading,
      tasksError,
      habits,
      habitsLoading,
      habitsError,
      weather,
      fetchTasks,
      fetchHabits,
      preloadDashboardData,
      addTask,
      addHabit,
      updateHabit,
      deleteHabit,
      deleteTask,
      toggleTask,
      completeHabit,
      // New task functions
      getTask,
      updateTask,
      logTime,
      sendReminderEmail,
      getTaskReport,
      searchTasks,
      getTasksByPriority,
      getTasksByStatus,
      getTasksByCategory,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used inside AppProvider');
  }

  return context;
}
