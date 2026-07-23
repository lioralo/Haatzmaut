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
/* --- Serialize state safely --- */
function copyArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return [];
  return JSON.parse(JSON.stringify(arr));
}

function serializedStateForSync() {
  const data = {
    _schemaVersion: 2,
    auditLog: copyArray(state.auditLog),
    loginSecurity: { failures: Array.isArray(state.loginSecurity?.failures) ? [...state.loginSecurity.failures] : [], lockUntil: state.loginSecurity?.lockUntil || 0 },
    activeTab: state.activeTab || 'dashboardTab',
    schedule: copyArray(state.schedule),
    rooms: copyArray(state.rooms),
    defaultTemplate: copyArray(state.defaultTemplate),
    weekTemplates: typeof state.weekTemplates === 'object' ? Object.assign({}, state.weekTemplates) : {},
    requests: copyArray(state.requests),
    selectedTags: state.selectedTags instanceof Set ? [...state.selectedTags] : [],
    weekISO: state.weekISO || '',
    activeDay: state.activeDay || 0,
    staff: copyArray(state.staff),
    users: copyArray(state.users),
    passwordResets: copyArray(state.passwordResets),
    folders: copyArray(state.folders),
    files: copyArray(state.files),
    meetingGroups: copyArray(state.meetingGroups),
    meetings: copyArray(state.meetings),
    issues: copyArray(state.issues),
    waitlist: copyArray(state.waitlist),
    settings: state.settings && typeof state.settings === 'object' ? JSON.parse(JSON.stringify(state.settings)) : {},
    displaySettings: state.displaySettings && typeof state.displaySettings === 'object' ? JSON.parse(JSON.stringify(state.displaySettings)) : {}
  };
  return JSON.stringify(data);
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
    iv: toBase64(iv),
    encryptedData: toBase64(new Uint8Array(ciphertext))
  };
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

    // Apply directly to state — no reload needed
    state.rooms = parsed.rooms || [];
    state.staff = parsed.staff || [];
    state.schedule = parsed.schedule || [];
    state.users = parsed.users || [];
    state.settings = parsed.settings || state.settings;
    state.displaySettings = parsed.displaySettings || {};
    state.defaultTemplate = parsed.defaultTemplate || [];
    state.weekTemplates = parsed.weekTemplates || {};
    state.requests = parsed.requests || [];
    state.meetings = parsed.meetings || [];
    state.meetingGroups = parsed.meetingGroups || [];
    state.issues = parsed.issues || [];
    state.waitlist = parsed.waitlist || [];
    state.folders = parsed.folders || [];
    state.files = parsed.files || [];
    state.auditLog = parsed.auditLog || [];
    state.passwordResets = parsed.passwordResets || [];
    // Reset to current week, not the exported one
    state.weekISO = '';
    state.activeDay = (new Date()).getDay();
    if (state.activeDay > 4) state.activeDay = 0;
    if (parsed.selectedTags) state.selectedTags = new Set(parsed.selectedTags);
    if (parsed.loginSecurity) state.loginSecurity = parsed.loginSecurity;

    localStorage.setItem('haatzmaut_v6', JSON.stringify(parsed));
    showToast('נטען מהענן — מרענן תצוגה…', 'info');
    
    // Re-render UI without reloading
    setTimeout(() => {
      import('../main.js').then(m => { m.renderActiveTab(); });
    }, 300);
  } catch (err) {
    showToast('טעינה נכשלה: ' + err.message, 'error');
  }
}
