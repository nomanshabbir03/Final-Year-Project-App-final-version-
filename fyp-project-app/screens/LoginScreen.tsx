import React, { useState } from 'react';
import { 
  Pressable, 
  StyleSheet, 
  Text, 
  TextInput, 
  View, 
  ScrollView, 
  SafeAreaView,
  Alert 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';

export function LoginScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await login(email, password);
      if (!result.ok) {
        Alert.alert('Login Failed', result.error ?? 'Unable to login.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert('Forgot Password', 'Password reset functionality coming soon!');
  };

  const handleGoogleSignIn = () => {
    console.log('Google Sign In pressed');
    Alert.alert('Google Sign In', 'Google OAuth integration coming soon!');
  };

  const handleAppleSignIn = () => {
    console.log('Apple Sign In pressed');
    Alert.alert('Apple Sign In', 'Apple OAuth integration coming soon!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* SECTION 1 — APP LOGO */}
        <View style={styles.logoSection}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name="leaf" size={22} color={Colors.white} />
          </View>
          <Text style={styles.appName}>Personal Companion App</Text>
          <Text style={styles.tagline}>Your daily life, simplified</Text>
        </View>

        {/* SECTION 2 — INPUT FIELDS */}
        <View style={styles.formSection}>
          {/* Email Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={15} color={Colors.textHint} style={{ marginLeft: 2 }} />
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="you@example.com"
                placeholderTextColor={Colors.textHint}
                textAlign="left"
                textAlignVertical="center"
              />
            </View>
          </View>

          {/* Password Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={15} color={Colors.textHint} style={{ marginLeft: 2 }} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textHint}
                textAlign="left"
                textAlignVertical="center"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={{ marginRight: 2 }}>
                <Ionicons 
                  name={showPassword ? "eye-off-outline" : "eye-outline"} 
                  size={15} 
                  color={Colors.borderLight} 
                />
              </Pressable>
            </View>
          </View>

          {/* Forgot Password */}
          <Pressable style={styles.forgotPasswordContainer} onPress={handleForgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </Pressable>

          {/* SECTION 3 — SIGN IN BUTTON */}
          <Pressable 
            style={[styles.signInButton, loading && styles.signInButtonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.signInButtonText}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Text>
          </Pressable>

          {/* SECTION 4 — SOCIAL LOGIN DIVIDER */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* SECTION 5 — SOCIAL BUTTONS */}
          <View style={styles.socialButtonsContainer}>
            <Pressable style={styles.socialButton} onPress={handleGoogleSignIn}>
              <MaterialCommunityIcons name="google" size={14} color={Colors.textSecondary} />
              <Text style={styles.socialButtonText}>Google</Text>
            </Pressable>
            <Pressable style={styles.socialButton} onPress={handleAppleSignIn}>
              <MaterialCommunityIcons name="apple" size={14} color={Colors.textSecondary} />
              <Text style={styles.socialButtonText}>Apple</Text>
            </Pressable>
          </View>

          {/* SECTION 6 — SIGNUP LINK */}
          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <Pressable onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLink}>Sign up</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  
  // Logo Section
  logoSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  appName: {
    fontSize: 22,
    fontWeight: '500',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textHint,
  },

  // Form Section
  formSection: {
    gap: 12,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    padding: 10,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  textInput: {
    fontSize: 15,
    color: '#000000',
    flex: 1,
    padding: 0,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },

  // Forgot Password
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: Colors.primary,
  },

  // Sign In Button
  signInButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  signInButtonDisabled: {
    opacity: 0.7,
  },
  signInButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.white,
  },

  // Social Divider
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: Colors.borderLight,
  },
  dividerText: {
    fontSize: 13,
    color: Colors.textHint,
    marginHorizontal: 8,
  },

  // Social Buttons
  socialButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    height: 38,
    gap: 6,
  },
  socialButtonText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },

  // Signup Link
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    fontSize: 13,
    color: Colors.textHint,
  },
  signupLink: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
});
