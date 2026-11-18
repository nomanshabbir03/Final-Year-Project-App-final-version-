/**
 * Offline support for the whole API client.
 *
 *  - Every successful GET is copied to local storage. With no connection the last copy is served.
 *  - Create / edit / delete requests made with no connection are queued on the phone, applied to
 *    the local copies straight away (so screens update), and replayed in order once the server
 *    can be reached again.
 *  - Items created offline get a temporary "local-..." id; after upload it is swapped for the
 *    real id in the queued requests that follow.
 *
 * Limits: file uploads, sign-in/profile, the AI assistant and community posts need a connection.
 * "Action" calls (toggle, complete, log ...) update the local copy only for toggle; others show
 * their effect after the next sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { AppState } from 'react-native';

const CACHE_PREFIX = 'offline.cache:';
const QUEUE_KEY = 'offline.queue';
const IDMAP_KEY = 'offline.idmap';
const RETRY_MS = 30_000;

// Never queued while offline (they need the server's answer).
const NO_QUEUE = [/^\/auth\//, /\/assistant\//, /\/community/, /send-reminder/, /\/attachments\//];
const NO_CACHE = [/\/assistant\//];
// POST segments that act on an item rather than create something.
const ACTIONS = new Set(['toggle', 'complete', 'uncomplete', 'log', 'log-time', 'pay', 'like', 'join', 'respond', 'leave']);

type QueueEntry = {
  id: string;
  userId: string;
  method: 'post' | 'put' | 'patch' | 'delete';
  url: string;
  data?: unknown;
  tempId?: string;
};

type Cached = { data: unknown };

let pending = 0;
let syncing: Promise<void> | null = null;
const syncListeners = new Set<() => void>();
const statusListeners = new Set<(pendingCount: number) => void>();

/** Called after queued changes were uploaded, so screens can reload fresh server data. */
export function onOfflineSynced(listener: () => void) {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

/** Called whenever the number of changes waiting to upload changes. */
export function onPendingChange(listener: (pendingCount: number) => void) {
  statusListeners.add(listener);
  listener(pending);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getPendingCount() {
  return pending;
}

function setPending(next: number) {
  pending = next;
  statusListeners.forEach((l) => l(next));
}

const normPath = (url: string) => '/' + (url.split('?')[0] ?? '').split('/').filter(Boolean).join('/') + '/';
const isId = (seg: string) => /^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || seg.startsWith('local-');
const stableParams = (params: unknown) => {
  if (!params || typeof params !== 'object') return '';
  const entries = Object.entries(params as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
};
const cacheKey = (uid: string, path: string, params?: unknown) => `${CACHE_PREFIX}${uid}:${path}?${stableParams(params)}`;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const loadQueue = async () => (await readJson<QueueEntry[]>(QUEUE_KEY)) ?? [];
const saveQueue = async (queue: QueueEntry[]) => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)).catch(() => {});
  setPending(queue.length);
};

/** Drop every locally saved copy of server data (used on sign-out). Queued changes are kept. */
export async function clearOfflineCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(CACHE_PREFIX)));
  } catch {
    // best effort
  }
}

async function keysFor(uid: string, path: string) {
  const keys = await AsyncStorage.getAllKeys();
  const prefix = `${CACHE_PREFIX}${uid}:${path}?`;
  return keys.filter((k) => k.startsWith(prefix));
}

/** Apply `fn` to every cached list (array or {results: []}) saved for this collection path. */
async function mutateLists(uid: string, path: string, fn: (items: any[]) => any[]) {
  for (const key of await keysFor(uid, path)) {
    const cached = await readJson<Cached>(key);
    const d: any = cached?.data;
    let next: unknown = null;
    if (Array.isArray(d)) next = fn(d);
    else if (d && Array.isArray(d.results)) next = { ...d, results: fn(d.results) };
    if (next !== null) await AsyncStorage.setItem(key, JSON.stringify({ data: next })).catch(() => {});
  }
}

async function findInLists(uid: string, path: string, id: string) {
  for (const key of await keysFor(uid, path)) {
    const d: any = (await readJson<Cached>(key))?.data;
    const items: any[] = Array.isArray(d) ? d : Array.isArray(d?.results) ? d.results : [];
    const hit = items.find((i) => String(i?.id) === id);
    if (hit) return hit;
  }
  return undefined;
}

async function mergeDetail(uid: string, path: string, patch: Record<string, unknown>) {
  let merged: any;
  for (const key of await keysFor(uid, path)) {
    const cached = await readJson<Cached>(key);
    if (cached && cached.data && typeof cached.data === 'object' && !Array.isArray(cached.data)) {
      merged = { ...(cached.data as object), ...patch };
      await AsyncStorage.setItem(key, JSON.stringify({ data: merged })).catch(() => {});
    }
  }
  return merged;
}

const tempId = () => `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Updates the local copies as if the server had applied the change; returns the response body. */
async function applyOptimistic(uid: string, entry: QueueEntry): Promise<{ status: number; data: unknown }> {
  const path = normPath(entry.url);
  const segs = path.split('/').filter(Boolean);
  const last = segs[segs.length - 1] ?? '';
  const body = (entry.data && typeof entry.data === 'object' ? entry.data : {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const parentPath = '/' + segs.slice(0, -1).join('/') + '/';

  if (entry.method === 'delete') {
    await mutateLists(uid, parentPath, (items) => items.filter((i) => String(i?.id) !== last));
    for (const key of await keysFor(uid, path)) await AsyncStorage.removeItem(key).catch(() => {});
    return { status: 204, data: '' };
  }

  if (entry.method === 'patch' || entry.method === 'put') {
    if (!isId(last)) {
      return { status: 200, data: (await mergeDetail(uid, path, body)) ?? body };
    }
    let merged: any = { id: last, ...body };
    await mutateLists(uid, parentPath, (items) =>
      items.map((i) => {
        if (String(i?.id) !== last) return i;
        merged = { ...i, ...body, updated_at: now };
        return merged;
      })
    );
    await mergeDetail(uid, path, body);
    return { status: 200, data: merged };
  }

  // POST on an item: toggle / complete / log ... (needs the server for the real result)
  if (segs.length >= 2 && isId(segs[segs.length - 2]) && ACTIONS.has(last)) {
    const itemId = segs[segs.length - 2];
    const itemPath = '/' + segs.slice(0, -2).join('/') + '/';
    let item: any = (await findInLists(uid, itemPath, itemId)) ?? {};
    if (last === 'toggle' && item.id !== undefined) {
      const done = item.status === 'done';
      item = { ...item, status: done ? 'pending' : 'done', done: !done, completed_at: done ? null : now };
      await mutateLists(uid, itemPath, (items) => items.map((i) => (String(i?.id) === itemId ? item : i)));
    }
    return { status: 200, data: item };
  }

  // POST to a collection: create
  const item = { ...body, id: entry.tempId, created_at: now, updated_at: now };
  await mutateLists(uid, path, (items) => [item, ...items]);
  return { status: 201, data: item };
}

function fakeResponse(config: any, status: number, data: unknown): AxiosResponse {
  return { data, status, statusText: 'Saved offline', headers: {}, config, request: {}, offline: true } as any;
}

function resolveTempIds(text: string, idMap: Record<string, string>) {
  let out = text;
  for (const [temp, real] of Object.entries(idMap)) out = out.split(temp).join(real);
  return out;
}

function processQueue(api: AxiosInstance, getUserId: () => string | null): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    const uid = getUserId();
    if (!uid) return;
    let uploaded = 0;
    let idMap = (await readJson<Record<string, string>>(IDMAP_KEY)) ?? {};
    for (;;) {
      const queue = await loadQueue();
      const entry = queue.find((e) => e.userId === uid);
      if (!entry) break;
      const drop = async () => saveQueue(queue.filter((e) => e.id !== entry.id));
      const url = resolveTempIds(entry.url, idMap);
      if (/local-[0-9a-z]+/.test(url)) {
        // Refers to something that never reached the server: nothing to apply it to.
        await drop();
        continue;
      }
      const data = entry.data === undefined ? undefined : JSON.parse(resolveTempIds(JSON.stringify(entry.data), idMap));
      try {
        const res = await api.request({ method: entry.method, url, data, __offline: true } as any);
        const realId = (res.data as any)?.id;
        if (entry.tempId && realId !== undefined && realId !== null) {
          idMap = { ...idMap, [entry.tempId]: String(realId) };
          await AsyncStorage.setItem(IDMAP_KEY, JSON.stringify(idMap)).catch(() => {});
        }
        await drop();
        uploaded += 1;
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status && status >= 400 && status < 500 && ![401, 403, 408, 429].includes(status)) {
          await drop(); // the server rejected it for good; retrying would loop forever
          continue;
        }
        break; // still offline or the server is struggling: try again later
      }
    }
    if ((await loadQueue()).length === 0) await AsyncStorage.removeItem(IDMAP_KEY).catch(() => {});
    if (uploaded > 0) syncListeners.forEach((l) => l());
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

export function installOffline(api: AxiosInstance, getUserId: () => string | null) {
  loadQueue().then((q) => setPending(q.length));

  const trigger = () => {
    if (pending > 0) void processQueue(api, getUserId);
  };
  AppState.addEventListener('change', (state) => state === 'active' && trigger());
  setInterval(trigger, RETRY_MS);

  // Keep write order: finish uploading older offline changes before sending a new one.
  api.interceptors.request.use(async (config) => {
    const method = (config.method ?? 'get').toLowerCase();
    if (!(config as any).__offline && method !== 'get' && pending > 0) {
      await processQueue(api, getUserId);
    }
    return config;
  });

  api.interceptors.response.use(
    (response) => {
      const config = response.config as any;
      if (config.__offline) return response;
      const method = (config.method ?? 'get').toLowerCase();
      const path = normPath(config.url ?? '');
      if (method === 'get' && !NO_CACHE.some((r) => r.test(path))) {
        let data: unknown = response.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            data = undefined;
          }
        }
        if (data !== undefined) {
          AsyncStorage.setItem(cacheKey(getUserId() ?? 'anon', path, config.params), JSON.stringify({ data })).catch(() => {});
        }
      }
      trigger(); // a successful call means we are online
      return response;
    },
    async (error) => {
      if (!axios.isAxiosError(error) || !error.config || (error.config as any).__offline) throw error;
      const config = error.config as any;
      const method = (config.method ?? 'get').toLowerCase();
      const path = normPath(config.url ?? '');
      const uid = getUserId() ?? 'anon';

      if (method === 'get' && !error.response) {
        const cached = await readJson<Cached>(cacheKey(uid, path, config.params));
        if (cached) return fakeResponse(config, 200, cached.data);
        throw error;
      }

      const queueable =
        ['post', 'put', 'patch', 'delete'].includes(method) &&
        error.code === 'ERR_NETWORK' &&
        uid !== 'anon' &&
        !NO_QUEUE.some((r) => r.test(path)) &&
        !(typeof FormData !== 'undefined' && config.data instanceof FormData);
      if (!queueable) throw error;

      let data: unknown;
      if (typeof config.data === 'string' && config.data) {
        try {
          data = JSON.parse(config.data);
        } catch {
          throw error;
        }
      } else if (config.data && typeof config.data === 'object') {
        data = config.data;
      }

      const segs = path.split('/').filter(Boolean);
      const isCreate =
        method === 'post' && !(segs.length >= 2 && isId(segs[segs.length - 2]) && ACTIONS.has(segs[segs.length - 1]));
      const entry: QueueEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: uid,
        method: method as QueueEntry['method'],
        url: path,
        data,
        tempId: isCreate ? tempId() : undefined,
      };
      const result = await applyOptimistic(uid, entry);
      await saveQueue([...(await loadQueue()), entry]);
      return fakeResponse(config, result.status, result.data);
    }
  );
}
