import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { BottomTabs } from './BottomTabs';
import type { RootStackParamList } from './types';
import { AddTaskScreen } from '../screens/AddTaskScreen';
import { AddHabitScreen } from '../screens/AddHabitScreen';
import { AllHabitsScreen } from '../screens/AllHabitsScreen';
import { HabitAnalyticsScreen } from '../screens/HabitAnalyticsScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { ConfirmCodeScreen } from '../screens/ConfirmCodeScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

const appTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#f8fafc',
  },
};

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { preloadDashboardData } = useAppContext();
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      preloadDashboardData();
    }
  }, [isAuthenticated, preloadDashboardData]);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const onboardingStatus = await AsyncStorage.getItem('onboarding_complete');
      setIsOnboardingComplete(onboardingStatus === 'true');
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
      setIsOnboardingComplete(false);
    }
  };

  const handleOnboardingComplete = () => {
    setIsOnboardingComplete(true);
  };

  if (isLoading || isOnboardingComplete === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={appTheme}>
      <Stack.Navigator>
        {!isOnboardingComplete ? (
          <Stack.Screen 
            name="Onboarding" 
            options={{ headerShown: false }}
          >
            {() => <OnboardingScreen onOnboardingComplete={handleOnboardingComplete} />}
          </Stack.Screen>
        ) : isAuthenticated ? (
          <>
            <Stack.Screen
              name="MainTabs"
              component={BottomTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="AddTask" component={AddTaskScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddHabit" component={AddHabitScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AllHabits" component={AllHabitsScreen} options={{ title: 'All Habits' }} />
            <Stack.Screen name="HabitAnalytics" component={HabitAnalyticsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar' }} />
            <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task Details' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Create Account' }} />
            <Stack.Screen name="ConfirmCode" component={ConfirmCodeScreen} options={{ title: 'Confirm' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
