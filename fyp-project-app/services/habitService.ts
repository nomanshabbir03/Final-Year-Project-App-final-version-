import { api, parseJsonData } from './api';

export type HabitFrequency = 'Daily' | 'Weekly';

export type HabitDto = {
  id: string;
  name: string;
  frequency: HabitFrequency;
  streakCount: number;
  lastCompletedDate: string | null;
};

type HabitApiDto = {
  id?: number | string;
  name?: string;
  frequency?: HabitFrequency;
  streak_count?: number;
  last_completed_date?: string | null;
};

function normalizeFrequency(value: unknown): HabitFrequency {
  if (value === 'Weekly') {
    return 'Weekly';
  }
  return 'Daily';
}

function normalizeHabit(habit: HabitApiDto): HabitDto {
  return {
    id: String(habit.id ?? Date.now()),
    name: habit.name ?? 'Untitled Habit',
    frequency: normalizeFrequency(habit.frequency),
    streakCount: Number(habit.streak_count ?? 0),
    lastCompletedDate: habit.last_completed_date ?? null,
  };
}

export async function getHabits(): Promise<HabitDto[]> {
  const response = await api.get('/habits/');
  const data = parseJsonData<unknown>(response.data);
  const raw = Array.isArray(data) ? data : [];
  return raw.map((item) => normalizeHabit(item as HabitApiDto));
}

export async function createHabit(payload: {
  name: string;
  frequency: HabitFrequency;
}): Promise<HabitDto> {
  const response = await api.post('/habits/', payload);
  const data = parseJsonData<HabitApiDto>(response.data);
  return normalizeHabit(data);
}

export async function completeHabit(id: string): Promise<HabitDto> {
  const response = await api.patch(`/habits/${id}/complete/`);
  const data = parseJsonData<HabitApiDto>(response.data);
  return normalizeHabit(data);
}
