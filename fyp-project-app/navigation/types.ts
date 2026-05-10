export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  MainTabs: undefined;
  AddTask: undefined;
  AddHabit: undefined;
  AllHabits: undefined;
  HabitAnalytics: undefined;
  Calendar: undefined;
  Reports: undefined;
  TaskDetail: { taskId: string };
  ConfirmCode: { email?: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Habits: undefined;
  Weather: undefined;
  Profile: undefined;
};
