import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { toApiErrorMessage, setApiAuthToken, setApiRequestUserId } from '../services/api';
import {
  me as meRequest,
  updateProfile as updateProfileRequest,
  type AuthPayload,
} from '../services/authService';
import { supabase } from '../services/supabase';

type AuthUser = {
  email: string;
  userId: string;
  token: string;
  fullName: string;
  avatarUrl: string;
  bio: string;
  selectedCity: string;
};

type AuthResult = { ok: boolean; error?: string; needsVerification?: boolean };

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (email: string, password: string, fullName?: string) => Promise<AuthResult>;
  verifyEmail: (email: string, code: string) => Promise<AuthResult>;
  resendVerification: (email: string) => Promise<AuthResult>;
  updateProfile: (input: {
    fullName?: string;
    avatarUrl?: string;
    avatarImageUri?: string;
    bio?: string;
    selectedCity?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toAuthUser(payload: AuthPayload, token: string): AuthUser {
  return {
    email: payload.email,
    token,
    userId: payload.user_id,
    fullName: payload.full_name ?? '',
    avatarUrl: payload.avatar_url ?? '',
    bio: payload.bio ?? '',
    selectedCity: payload.selected_city ?? '',
  };
}

function isValidEmail(email: string) {
  return Boolean(email) && email.includes('@');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = () => {
    setApiAuthToken(null);
    setApiRequestUserId(null);
    setUser(null);
  };

  // Points the API client at the Supabase access token and loads the backend profile for it.
  const hydrate = async (session: Session) => {
    setApiAuthToken(session.access_token);
    const payload = await meRequest();
    setApiRequestUserId(payload.user_id);
    const nextUser = toAuthUser(payload, session.access_token);
    setUser(nextUser);
    return nextUser;
  };

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          try {
            await hydrate(data.session);
          } catch (error) {
            console.warn('Stored session is invalid, clearing it', error);
            await supabase.auth.signOut();
            clearSession();
          }
        }
      } catch (error) {
        console.warn('Failed to restore auth session', error);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();

    // Keep the API client on a fresh token (supabase-js refreshes access tokens automatically).
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearSession();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setApiAuthToken(session.access_token);
        setUser((current) => (current ? { ...current, token: session.access_token } : current));
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<AuthResult> => {
    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }

    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) {
      if (error.code === 'email_not_confirmed') {
        await supabase.auth.resend({ type: 'signup', email: cleanEmail });
        return { ok: false, needsVerification: true, error: 'Please verify your email first. We sent you a new code.' };
      }
      return { ok: false, error: error.message };
    }

    try {
      await hydrate(data.session);
      return { ok: true };
    } catch (err) {
      await supabase.auth.signOut();
      return { ok: false, error: toApiErrorMessage(err, 'Login failed. Please try again.') };
    }
  };

  const signup = async (email: string, password: string, fullName?: string): Promise<AuthResult> => {
    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }

    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: fullName?.trim() ?? '' } },
    });
    if (error) {
      return { ok: false, error: error.message };
    }

    // With "Confirm email" enabled in Supabase no session is issued until the code is verified.
    if (!data.session) {
      return { ok: true, needsVerification: true };
    }

    try {
      await hydrate(data.session);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toApiErrorMessage(err, 'Signup failed. Please try again.') };
    }
  };

  const verifyEmail = async (email: string, code: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'signup',
    });
    if (error || !data.session) {
      return { ok: false, error: error?.message ?? 'Invalid or expired code.' };
    }

    try {
      await hydrate(data.session);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toApiErrorMessage(err, 'Could not finish signing in.') };
    }
  };

  const resendVerification = async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
    return error ? { ok: false, error: error.message } : { ok: true };
  };

  const updateProfile = async (input: {
    fullName?: string;
    avatarUrl?: string;
    avatarImageUri?: string;
    bio?: string;
    selectedCity?: string;
  }) => {
    if (!user) {
      return { ok: false, error: 'Not authenticated.' };
    }

    try {
      const payload = await updateProfileRequest({
        full_name: input.fullName,
        avatar_url: input.avatarUrl,
        avatar_image_uri: input.avatarImageUri,
        bio: input.bio,
        selected_city: input.selectedCity,
      });

      setUser({
        ...user,
        fullName: payload.full_name ?? '',
        avatarUrl: payload.avatar_url ?? '',
        bio: payload.bio ?? '',
        selectedCity: payload.selected_city ?? '',
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: toApiErrorMessage(error, 'Could not update profile.'),
      };
    }
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('Supabase sign out failed, clearing local session anyway', error);
    }
    clearSession();
  };

  const value = useMemo(
    () => ({
      isLoading,
      isAuthenticated: Boolean(user),
      user,
      login,
      signup,
      verifyEmail,
      resendVerification,
      updateProfile,
      logout,
    }),
    [isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
