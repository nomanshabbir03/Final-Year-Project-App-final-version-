import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { BottomTabs } from './BottomTabs';
import type { RootStackParamList } from './types';
import { AddTaskScreen } from '../screens/AddTaskScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { ConfirmCodeScreen } from '../screens/ConfirmCodeScreen';
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

  useEffect(() => {
    if (isAuthenticated) {
      preloadDashboardData();
    }
  }, [isAuthenticated, preloadDashboardData]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={appTheme}>
      <Stack.Navigator>
        {isAuthenticated ? (
          <>
            <Stack.Screen
              name="MainTabs"
              component={BottomTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="AddTask" component={AddTaskScreen} options={{ title: 'Add Task' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Create Account' }} />
            <Stack.Screen name="Confirm" component={ConfirmCodeScreen} options={{ title: 'Confirm' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
