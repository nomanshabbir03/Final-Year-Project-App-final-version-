export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Confirm: { email?: string } | undefined;
  MainTabs: undefined;
  AddTask: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Habits: undefined;
  Weather: undefined;
  Profile: undefined;
};
