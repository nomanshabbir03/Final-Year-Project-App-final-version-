import React from 'react';
import { ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  safeAreaStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  hideHeader?: boolean;
};

export function ScreenContainer({
  title,
  subtitle,
  children,
  safeAreaStyle,
  contentContainerStyle,
  hideHeader,
}: Props) {
  return (
    <SafeAreaView style={[styles.safeArea, safeAreaStyle]}>
      <ScrollView contentContainerStyle={[styles.contentContainer, contentContainerStyle]}>
        {hideHeader ? null : (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  contentContainer: {
    padding: 16,
    gap: 14,
  },
  header: {
    gap: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
