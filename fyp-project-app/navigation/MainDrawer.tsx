import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import type { MainTabParamList, RootStackParamList } from './types';
import { HomeScreen } from '../screens/HomeScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { HabitsScreen } from '../screens/HabitsScreen';
import { WeatherScreen } from '../screens/WeatherScreen';

const Drawer = createDrawerNavigator<MainTabParamList>();

type Icon = keyof typeof Ionicons.glyphMap;
type ModuleScreen = 'Medication' | 'PrayerTime' | 'Qibla' | 'Fitness' | 'Budget' | 'Reports' | 'Community' | 'Assistant' | 'Profile';
// Drawer screens switch in place; the other modules open on top of the drawer (with a back button).
type Item =
  | { label: string; icon: Icon; drawer: keyof MainTabParamList }
  | { label: string; icon: Icon; screen: ModuleScreen };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'My day',
    items: [
      { label: 'Dashboard', icon: 'home', drawer: 'Dashboard' },
      { label: 'Tasks', icon: 'checkbox', drawer: 'Tasks' },
      { label: 'Habits', icon: 'flame', drawer: 'Habits' },
      { label: 'Medication', icon: 'medkit', screen: 'Medication' },
    ],
  },
  {
    title: 'Faith & weather',
    items: [
      { label: 'Prayer Times', icon: 'moon', screen: 'PrayerTime' },
      { label: 'Qibla', icon: 'compass', screen: 'Qibla' },
      { label: 'Weather', icon: 'partly-sunny', drawer: 'Weather' },
    ],
  },
  {
    title: 'Health & money',
    items: [
      { label: 'Fitness', icon: 'barbell', screen: 'Fitness' },
      { label: 'Budget', icon: 'wallet', screen: 'Budget' },
      { label: 'Reports', icon: 'bar-chart', screen: 'Reports' },
    ],
  },
  {
    title: 'More',
    items: [
      { label: 'Community', icon: 'people', screen: 'Community' },
      { label: 'AI Assistant', icon: 'chatbubble-ellipses', screen: 'Assistant' },
      { label: 'Profile & settings', icon: 'person-circle', screen: 'Profile' },
    ],
  },
];

function DrawerContent({ navigation, state }: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;
  const name = user?.fullName?.trim() || user?.email?.split('@')[0] || 'Welcome';
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const open = (item: Item) => {
    navigation.closeDrawer();
    if ('drawer' in item) navigation.navigate(item.drawer);
    else navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate(item.screen);
  };

  const signOut = () =>
    Alert.alert('Sign out', 'Do you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.getParent()?.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }));
        },
      },
    ]);

  return (
    <View style={styles.drawer}>
      <DrawerContentScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 12 }}>
        <Pressable
          style={styles.profile}
          onPress={() => open({ label: 'Profile', icon: 'person-circle', screen: 'Profile' })}
        >
          <View style={styles.avatar}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {user?.email ? <Text style={styles.email} numberOfLines={1}>{user.email}</Text> : null}
          </View>
        </Pressable>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
            {section.items.map((item) => {
              const active = 'drawer' in item && item.drawer === activeRoute;
              return (
                <Pressable
                  key={item.label}
                  onPress={() => open(item)}
                  style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && !active && styles.itemPressed]}
                >
                  <View style={[styles.itemIcon, active && styles.itemIconActive]}>
                    <Ionicons
                      name={(active ? item.icon : `${item.icon}-outline`) as Icon}
                      size={20}
                      color={active ? Colors.white : Colors.textSecondary}
                    />
                  </View>
                  <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </DrawerContentScrollView>

      <Pressable
        style={({ pressed }) => [styles.signOut, { marginBottom: insets.bottom + 12 }, pressed && styles.itemPressed]}
        onPress={signOut}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

export function MainDrawer() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={{ flex: 1 }}>
      <Drawer.Navigator
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: 'front',
          swipeEdgeWidth: 40,
          overlayColor: 'rgba(15,23,42,0.45)',
          drawerStyle: { width: 300, backgroundColor: Colors.surfaceLight },
          sceneStyle: { backgroundColor: Colors.bgLight },
        }}
      >
        <Drawer.Screen name="Dashboard" component={HomeScreen} />
        <Drawer.Screen name="Tasks" component={TasksScreen} />
        <Drawer.Screen name="Habits" component={HabitsScreen} />
        <Drawer.Screen name="Weather" component={WeatherScreen} />
      </Drawer.Navigator>
      <Pressable
        accessibilityLabel="Open assistant"
        onPress={() => navigation.navigate('Assistant')}
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
      >
        <Ionicons name="happy" size={28} color={Colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: Colors.surfaceLight },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primarySurface,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: Font.extrabold, fontSize: 17, color: Colors.white },
  name: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.textPrimary },
  email: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  section: { marginTop: 14, paddingHorizontal: 12 },
  sectionTitle: {
    fontFamily: Font.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: Colors.textHint,
    marginLeft: 12,
    marginBottom: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
  },
  itemActive: { backgroundColor: Colors.primarySurface },
  itemPressed: { backgroundColor: Colors.tintSlate },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tintSlate,
  },
  itemIconActive: { backgroundColor: Colors.primary },
  itemLabel: { fontFamily: Font.semibold, fontSize: 15, color: Colors.textPrimary },
  itemLabelActive: { fontFamily: Font.bold, color: Colors.primary },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  signOutText: { fontFamily: Font.bold, fontSize: 15, color: Colors.error },

  fab: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
});
