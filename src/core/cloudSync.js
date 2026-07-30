/* ============================================================
   CLOUD SYNC — auto-sync engine with offline queue + version history
   ============================================================ */

import { state, onPersist, persistStateImmediate, recordAudit, serializedState } from './store.js';
import { showToast } from './utils.js';

const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'https://haatzmaut.lior-clinic.org/api'
  : '/api';

const SYNC_STATUS_KEY = 'haatzmaut_cloud_sync_status';
const PENDING_HASH_KEY = 'haatzmaut_cloud_pending_hash';

let _encryptionKey = null;
let _lastSavedHash = null;
let _syncState = 'idle';
let _pendingSaveTimer = null;
let _initDone = false;

const REQUIRED_FIELDS = ['rooms', 'schedule', 'staff', 'users', 'auditLog', 'loginSecurity'];

/* --- Sync status --- */

function getSyncStatus() {
  try { return JSON.parse(localStorage.getItem(SYNC_STATUS_KEY) || 'null'); } catch { return null; }
}

function setSyncStatus(status) {
  _syncState = status.state;
  localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify({
    state: status.state,
    lastSync: status.lastSync || null,
    lastError: status.lastError || null
  }));
}

export function getCloudSyncState() {
  const s = getSyncStatus() || { state: 'idle' };
  return {
    state: _syncState || s.state,
    lastSync: s.lastSync,
    lastError: s.lastError,
    hasPending: Boolean(localStorage.getItem(PENDING_HASH_KEY)),
    hasKey: Boolean(_encryptionKey || sessionStorage.getItem('clinic_cloud_key_bits')),
    apiBase: API_BASE
  };
}

/* --- Serialization --- */

export function serializedStateForSync() {
  return JSON.stringify(serializedState());
}

/* --- Encryption with random salt --- */

function generateRandomSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return arr;
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, keyMaterial, 256);
  const cloudKey = await crypto.subtle.importKey('raw', derivedBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('aes-gcm-sync'), info: enc.encode('aes-gcm-key') },
    cloudKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function setEncryptionPassword(password) {
  const salt = generateRandomSalt();
  _encryptionKey = await deriveKey(password, salt);
  sessionStorage.setItem('clinic_cloud_key_bits', btoa(String.fromCharCode(...new Uint8Array(salt))));
}

export async function restoreEncryptionKey() {
  const stored = sessionStorage.getItem('clinic_cloud_key_bits');
  if (!stored) return false;
  try {
    const salt = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const user = state.users?.find(u => u.username === state.currentUser?.username);
    if (!user?.passwordHash) return false;
    _encryptionKey = await deriveKey(state.currentUser._rawPassword || user.passwordHash, salt);
    return true;
  } catch { return false; }
}

async function encryptPayload(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { iv: toBase64(iv), encryptedData: toBase64(new Uint8Array(ciphertext)) };
}

async function decryptPayload(key, ivB64, encryptedB64) {
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

function toBase64(bytes) {
  const len = bytes.byteLength || bytes.length;
  let result = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.slice ? bytes.slice(i, i + chunkSize) : bytes.subarray(i, i + chunkSize);
    result += String.fromCharCode.apply(null, new Uint8Array(chunk));
  }
  return btoa(result);
}

/* --- API --- */

function getToken() { return sessionStorage.getItem('clinic_cloud_token'); }
function setToken(t) { sessionStorage.setItem('clinic_cloud_token', t); }

async function apiCall(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('הבקשה נכשלה — זמן תגובה ארוך מדי');
    throw e;
  }
}

/* --- Auth helper --- */

async function ensureAuth() {
  if (!state.currentUser) throw new Error('יש להתחבר תחילה.');
  const user = state.users?.find(u => u.username === state.currentUser.username);
  if (!user?.passwordHash) throw new Error('התחבר מחדש כדי לשמור.');
  const auth = await apiCall('POST', '/auth/verify', { username: user.username, passwordHash: user.passwordHash });
  setToken(auth.token);
  return user;
}

/* --- Validation --- */

function validateStateData(parsed) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in parsed)) throw new Error(`מידע פגום — חסר שדה: ${field}`);
  }
  if (!Array.isArray(parsed.rooms) || !Array.isArray(parsed.schedule) || !Array.isArray(parsed.staff)) {
    throw new Error('מידע פגום — שדות חובה חסרים.');
  }
}

function applyStateData(parsed) {
  state.rooms = parsed.rooms || [];
  state.staff = parsed.staff || [];
  state.schedule = parsed.schedule || [];
  state.users = Array.isArray(parsed.users) ? parsed.users : [];
  state.settings = parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : state.settings;
  state.displaySettings = parsed.displaySettings && typeof parsed.displaySettings === 'object' ? parsed.displaySettings : {};
  state.defaultTemplate = Array.isArray(parsed.defaultTemplate) ? parsed.defaultTemplate : [];
  state.weekTemplates = parsed.weekTemplates && typeof parsed.weekTemplates === 'object' ? parsed.weekTemplates : {};
  state.requests = Array.isArray(parsed.requests) ? parsed.requests : [];
  state.meetings = Array.isArray(parsed.meetings) ? parsed.meetings : [];
  state.meetingGroups = Array.isArray(parsed.meetingGroups) ? parsed.meetingGroups : [];
  state.issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  state.waitlist = Array.isArray(parsed.waitlist) ? parsed.waitlist : [];
  state.folders = Array.isArray(parsed.folders) ? parsed.folders : [];
  state.files = Array.isArray(parsed.files) ? parsed.files : [];
  state.auditLog = Array.isArray(parsed.auditLog) ? parsed.auditLog : [];
  state.passwordResets = Array.isArray(parsed.passwordResets) ? parsed.passwordResets : [];
  state.weekISO = typeof parsed.weekISO === 'string' ? parsed.weekISO : '';
  state.activeDay = typeof parsed.activeDay === 'number' ? parsed.activeDay : 0;
  state.selectedTags = parsed.selectedTags ? new Set(parsed.selectedTags) : new Set();
  state.loginSecurity = parsed.loginSecurity && typeof parsed.loginSecurity === 'object' ? parsed.loginSecurity : { failures: [], lockUntil: 0 };
  state.activeTab = typeof parsed.activeTab === 'string' && parsed.activeTab ? parsed.activeTab : 'dashboardTab';
}

/* --- Public API --- */

export async function saveToCloud() {
  setSyncStatus({ state: 'syncing' });
  try {
    await ensureAuth();
    if (!_encryptionKey) {
      const restored = await restoreEncryptionKey();
      if (!restored) throw new Error('התחבר מחדש כדי לשמור.');
    }
    const plain = serializedStateForSync();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
    const hashHex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (hashHex === _lastSavedHash) {
      setSyncStatus({ state: 'synced', lastSync: new Date().toISOString() });
      return { ok: true, skipped: true };
    }
    const { iv, encryptedData } = await encryptPayload(_encryptionKey, plain);
    await apiCall('POST', '/sync/save', { encryptedData, iv, dataHash: hashHex });
    _lastSavedHash = hashHex;
    localStorage.removeItem(PENDING_HASH_KEY);
    recordAudit('cloud.save', `נשמר לענן: ${(state.schedule||[]).length} הזמנות.`, 'info', true);
    setSyncStatus({ state: 'synced', lastSync: new Date().toISOString() });
    return { ok: true, skipped: false };
  } catch (err) {
    const isNetwork = err.message?.includes('רשת') || err.message?.includes('Abort');
    if (isNetwork) {
      localStorage.setItem(PENDING_HASH_KEY, 'pending');
      setSyncStatus({ state: 'pending', lastError: err.message });
    } else {
      setSyncStatus({ state: 'error', lastError: err.message });
    }
    recordAudit('cloud.save.failed', err.message || 'שמירה נכשלה.', 'warn', false);
    return { ok: false, error: err.message };
  }
}

export async function loadFromCloud() {
  try {
    await ensureAuth();
    const info = await apiCall('GET', '/sync/info');
    if (!info.exists) return null;
    return info;
  } catch (err) {
    showToast('בדיקת ענן נכשלה: ' + (err.message || 'שגיאת רשת'), 'error');
    return null;
  }
}

export async function loadFromCloudAndApply() {
  setSyncStatus({ state: 'syncing' });
  try {
    await ensureAuth();
    if (!_encryptionKey) {
      const restored = await restoreEncryptionKey();
      if (!restored) throw new Error('התחבר מחדש כדי לטעון.');
    }
    const data = await apiCall('GET', '/sync/load');
    if (!data.encryptedData) throw new Error('לא נמצא מידע בענן.');
    const plain = await decryptPayload(_encryptionKey, data.iv, data.encryptedData);
    const parsed = JSON.parse(plain);
    validateStateData(parsed);
    applyStateData(parsed);
    _lastSavedHash = data.dataHash || null;
    recordAudit('cloud.load', `נטען מהענן: ${(parsed.schedule||[]).length} הזמנות.`, 'info', true);
    persistStateImmediate();
    setSyncStatus({ state: 'synced', lastSync: new Date().toISOString() });
    return { ok: true };
  } catch (err) {
    setSyncStatus({ state: 'error', lastError: err.message });
    recordAudit('cloud.load.failed', err.message || 'טעינה נכשלה.', 'critical', false);
    throw err;
  }
}

export async function listVersions() {
  try {
    await ensureAuth();
    const data = await apiCall('GET', '/sync/versions');
    return data.versions || [];
  } catch {
    showToast('טעינת היסטוריית גיבויים נכשלה.', 'error');
    return [];
  }
}

export async function restoreVersion(versionId) {
  setSyncStatus({ state: 'syncing' });
  try {
    await ensureAuth();
    if (!_encryptionKey) {
      const restored = await restoreEncryptionKey();
      if (!restored) throw new Error('התחבר מחדש כדי לשחזר.');
    }
    await apiCall('POST', '/sync/restore', { versionId });
    const data = await apiCall('GET', '/sync/load');
    const plain = await decryptPayload(_encryptionKey, data.iv, data.encryptedData);
    const parsed = JSON.parse(plain);
    validateStateData(parsed);
    applyStateData(parsed);
    recordAudit('cloud.restore', `שוחזרה גרסה ${versionId} מהענן.`, 'critical', true);
    persistStateImmediate();
    setSyncStatus({ state: 'synced', lastSync: new Date().toISOString() });
    return { ok: true };
  } catch (err) {
    setSyncStatus({ state: 'error', lastError: err.message });
    throw err;
  }
}

/* --- Auto-sync engine --- */

function schedulePendingSave() {
  clearTimeout(_pendingSaveTimer);
  _pendingSaveTimer = setTimeout(() => {
    if (navigator.onLine && state.currentUser && _encryptionKey) {
      saveToCloud().catch(() => {});
    }
  }, 2000);
}

export function initCloudSync() {
  if (_initDone) return;
  _initDone = true;

  const stored = getSyncStatus();
  if (stored) _syncState = stored.state;

  onPersist(() => {
    if (state.currentUser && _encryptionKey) {
      schedulePendingSave();
    }
  });

  window.addEventListener('online', () => {
    if (localStorage.getItem(PENDING_HASH_KEY)) {
      saveToCloud().catch(() => {});
    }
  });
}
