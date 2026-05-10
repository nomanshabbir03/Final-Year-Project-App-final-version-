export type RootStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Signup: undefined;
  ConfirmCode: { email?: string };
  MainTabs: undefined;
  AddTask: undefined;
  AddHabit: undefined;
  AllHabits: undefined;
  HabitAnalytics: undefined;
  Calendar: undefined;
  Reports: undefined;
  TaskDetail: { taskId: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Habits: undefined;
  Weather: undefined;
  Profile: undefined;
};
