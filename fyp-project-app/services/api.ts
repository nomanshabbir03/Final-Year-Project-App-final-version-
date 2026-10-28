import axios, { type AxiosResponse } from 'axios';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const BACKEND_PORT = 8080;

// NOTE: the Django routes are NOT all under /api (auth/, medications/, habits/ ... are at the
// root while budget and fitness live under /api/...), and the screens already include the
// full path in each call, so the base URL must be host:port with no /api suffix.
function resolveBackendUrl() {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, '');
  if (envUrl) {
    return { url: envUrl, source: 'EXPO_PUBLIC_BACKEND_URL' };
  }

  // LAN mode: the backend runs on the same PC that serves the Expo bundle.
  // Tunnel hosts (exp.direct / ngrok) point at Metro, not at the backend, so skip them.
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost && !/\.(exp\.direct|ngrok[\w-]*\.\w+)$/i.test(devHost)) {
    return { url: `http://${devHost}:${BACKEND_PORT}`, source: 'Expo dev host (hostUri)' };
  }

  // Android emulator reaches the host PC via 10.0.2.2
  if (Platform.OS === 'android' && !Device.isDevice) {
    return { url: `http://10.0.2.2:${BACKEND_PORT}`, source: 'Android emulator default' };
  }

  console.warn(
    'Backend URL could not be determined. Create fyp-project-app/.env.local with ' +
      'EXPO_PUBLIC_BACKEND_URL=http://<PC-LAN-IP>:8080 (see .env.example) and restart with `npx expo start -c`.'
  );
  return { url: `http://localhost:${BACKEND_PORT}`, source: 'unresolved (last-resort localhost)' };
}

const resolvedBackend = resolveBackendUrl();
console.log(`Backend base URL: ${resolvedBackend.url} (from ${resolvedBackend.source})`);

export const api = axios.create({
  baseURL: resolvedBackend.url,
  // Long enough (with the one retry below) to ride out a free Render instance waking up.
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Short-lived cache for GET requests: going back to a screen, or several screens asking for the
// same data, reuses a response from the last few seconds instead of another trip to the server,
// and identical GETs already on their way share one request. Any change (POST/PUT/PATCH/DELETE)
// and signing in or out clears it, so the app never shows old data after an edit.
const GET_CACHE_MS = 15000;
const getCache = new Map<string, { at: number; response: AxiosResponse }>();
const pendingGets = new Map<string, Promise<AxiosResponse>>();
let cacheGeneration = 0;

export function clearApiCache() {
  cacheGeneration += 1;
  getCache.clear();
  pendingGets.clear();
}

const networkAdapter = axios.getAdapter(axios.defaults.adapter);

api.defaults.adapter = (config) => {
  if (config.method?.toLowerCase() !== 'get') {
    clearApiCache();
    return networkAdapter(config);
  }

  const key = api.getUri(config);
  const cached = getCache.get(key);
  if (cached && Date.now() - cached.at < GET_CACHE_MS) {
    // A copy each time: axios replaces `data` with the parsed body on the object it gets back.
    return Promise.resolve({ ...cached.response, config });
  }

  let pending = pendingGets.get(key);
  if (!pending) {
    const generation = cacheGeneration;
    pending = networkAdapter(config).then((response) => {
      // Skip responses that started before a change was saved; they may already be out of date.
      if (generation === cacheGeneration) {
        getCache.set(key, { at: Date.now(), response });
      }
      return response;
    });
    pendingGets.set(key, pending);
    const done = pending;
    done.finally(() => pendingGets.get(key) === done && pendingGets.delete(key)).catch(() => {});
  }
  return pending.then((response) => ({ ...response, config }));
};

let authToken: string | null = null;
let requestUserId: string | null = process.env.EXPO_PUBLIC_USER_ID?.trim() || null;

export function setApiAuthToken(token: string | null) {
  if (token !== authToken) {
    clearApiCache();
  }
  authToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

export function setApiRequestUserId(userId: string | null) {
  const next = userId?.trim() || null;
  if (next !== requestUserId) {
    clearApiCache();
  }
  requestUserId = next;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
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
      return `Cannot reach backend API at ${error.config?.baseURL ?? api.defaults.baseURL}. Check your network and backend URL.`;
    }

    return `${fallback} (HTTP ${error.response.status})`;
  }

  return fallback;
}
