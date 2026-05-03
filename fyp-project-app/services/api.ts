import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

function resolveBackendUrl() {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (envUrl) {
    return envUrl;
  }

  // In Expo Go/dev, infer LAN IP from Expo host and use backend port 8000.
  // This is required for physical devices (e.g., iPhone) to reach your computer.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoClient?.hostUri;

  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : null;
  if (host) {
    return `http://${host}:8000`;
  }

  // Android emulator needs 10.0.2.2 for host machine loopback.
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  // iOS simulator can reach the host machine via localhost.
  if (Platform.OS === 'ios') {
    return 'http://127.0.0.1:8000';
  }

  return 'http://127.0.0.1:8000';
}

export const api = axios.create({
  baseURL: resolveBackendUrl(),
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let authToken: string | null = null;
let requestUserId: string | null = process.env.EXPO_PUBLIC_USER_ID?.trim() || null;

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

export function setApiRequestUserId(userId: string | null) {
  requestUserId = userId?.trim() || null;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Token ${authToken}`;
  }

  if (requestUserId) {
    config.headers = config.headers ?? {};
    config.headers['X-User-Id'] = requestUserId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || !error.config) {
      return Promise.reject(error);
    }

    const method = error.config.method?.toLowerCase();
    const isTimeout = error.code === 'ECONNABORTED';
    const isSafeMethod = method === 'get';
    const hasRetried = Boolean((error.config as any).__retryOnce);

    if (isTimeout && isSafeMethod && !hasRetried) {
      (error.config as any).__retryOnce = true;
      return api.request(error.config);
    }

    return Promise.reject(error);
  }
);

export function parseJsonData<T>(data: unknown): T {
  if (typeof data === 'string') {
    return JSON.parse(data) as T;
  }

  return data as T;
}

export function toApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    const data = error.response?.data;
    if (data && typeof data === 'object') {
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim()) {
          return value;
        }

        if (Array.isArray(value) && value.length > 0) {
          const first = value[0];
          if (typeof first === 'string' && first.trim()) {
            return first;
          }
        }
      }
    }

    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }

    if (!error.response) {
      return 'Cannot reach backend API. Check your network and backend URL.';
    }

    return `${fallback} (HTTP ${error.response.status})`;
  }

  return fallback;
}
