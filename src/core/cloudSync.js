/* ============================================================
   CLOUD SYNC — client-side encrypt/decrypt + API transport
   ============================================================ */

import { state } from './store.js';
import { showToast } from './utils.js';

const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'https://haatzmaut.lior-clinic.org/api'
  : '/api';

let _encryptionKey = null;
let _lastSavedHash = null;

/* --- Serialize state safely (strip circular refs, functions, Sets) --- */
function safeSerialize(val) {
  const seen = new WeakSet();
  return JSON.stringify(val, (key, value) => {
    if (typeof value === 'function') return undefined;
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return undefined;
      seen.add(value);
      if (value instanceof Set) return [...value];
      if (value instanceof Map) return Object.fromEntries(value);
      if (value instanceof Date) return value.toISOString();
    }
    return value;
  });
}

function serializedStateForSync() {
  return safeSerialize({
    _schemaVersion: 2,
    auditLog: state.auditLog || [],
    loginSecurity: state.loginSecurity || { failures: [], lockUntil: 0 },
    activeTab: state.activeTab || 'dashboardTab',
    schedule: state.schedule || [],
    rooms: state.rooms || [],
    defaultTemplate: state.defaultTemplate || [],
    weekTemplates: state.weekTemplates || {},
    requests: state.requests || [],
    selectedTags: [...(state.selectedTags || [])],
    weekISO: state.weekISO || '',
    activeDay: state.activeDay || 0,
    staff: state.staff || [],
    users: state.users || [],
    passwordResets: state.passwordResets || [],
    folders: state.folders || [],
    files: state.files || [],
    meetingGroups: state.meetingGroups || [],
    meetings: state.meetings || [],
    issues: state.issues || [],
    waitlist: state.waitlist || [],
    settings: state.settings || {},
    displaySettings: state.displaySettings || {}
  });
}

/* --- Encryption --- */
export async function setEncryptionPassword(password) {
  const enc = new TextEncoder();
  const salt = enc.encode('haatzmaut-sync-fixed-salt-v1');
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, keyMaterial, 256);
  sessionStorage.setItem('clinic_cloud_key_bits', btoa(String.fromCharCode(...new Uint8Array(derivedBits))));
  const cloudKey = await crypto.subtle.importKey('raw', derivedBits, 'HKDF', false, ['deriveKey']);
  _encryptionKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('aes-gcm-sync'), info: enc.encode('aes-gcm-key') },
    cloudKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function restoreEncryptionKey() {
  const stored = sessionStorage.getItem('clinic_cloud_key_bits');
  if (!stored) return false;
  try {
    const bits = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const enc = new TextEncoder();
    const cloudKey = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    _encryptionKey = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('aes-gcm-sync'), info: enc.encode('aes-gcm-key') },
      cloudKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    return true;
  } catch { return false; }
}

async function encryptPayload(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return {
    iv: btoa(String.fromCharCode(...iv)),
    encryptedData: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
}

async function decryptPayload(key, ivB64, encryptedB64) {
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
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
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* --- Public API --- */
export async function saveToCloud() {
  if (!state.currentUser) return false;
  try {
    const user = state.users?.find(u => u.username === state.currentUser.username);
    if (!user?.passwordHash) { showToast('התחבר מחדש.', 'warn'); return false; }
    if (!_encryptionKey) { showToast('התחבר מחדש.', 'warn'); return false; }

    const auth = await apiCall('POST', '/auth/verify', { username: user.username, passwordHash: user.passwordHash });
    setToken(auth.token);

    const plain = serializedStateForSync();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
    const hashHex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (hashHex === _lastSavedHash) return false;

    const { iv, encryptedData } = await encryptPayload(_encryptionKey, plain);
    await apiCall('POST', '/sync/save', { encryptedData, iv, dataHash: hashHex });
    _lastSavedHash = hashHex;
    showToast('נשמר לענן בהצלחה.', 'info');
    return true;
  } catch (err) {
    showToast('שמירה נכשלה: ' + err.message, 'error');
    return false;
  }
}

export async function loadFromCloud() {
  if (!state.currentUser) return null;
  try {
    const user = state.users?.find(u => u.username === state.currentUser.username);
    if (user?.passwordHash) {
      const auth = await apiCall('POST', '/auth/verify', { username: user.username, passwordHash: user.passwordHash });
      setToken(auth.token);
    }
    const info = await apiCall('GET', '/sync/info');
    if (!info.exists) { showToast('לא נמצא מידע בענן.', 'info'); return null; }
    return info;
  } catch (err) {
    showToast('בדיקה נכשלה: ' + err.message, 'error');
    return null;
  }
}

export async function loadFromCloudAndApply() {
  if (!_encryptionKey) { showToast('התחבר מחדש.', 'warn'); return; }
  try {
    const data = await apiCall('GET', '/sync/load');
    if (!data.encryptedData) { showToast('לא נמצא מידע בענן.', 'info'); return; }
    const plain = await decryptPayload(_encryptionKey, data.iv, data.encryptedData);
    const parsed = JSON.parse(plain);
    if (!parsed.rooms || !parsed.staff) throw new Error('מידע פגום');
    localStorage.setItem('haatzmaut_v6', JSON.stringify(parsed));
    showToast('נטען — מרענן…', 'info');
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    showToast('טעינה נכשלה: ' + err.message, 'error');
  }
}
