/* ============================================================
   CLOUD SYNC — client-side encrypt/decrypt + API transport
   ============================================================ */

import { state, persistStateImmediate } from './store.js';
import { showToast } from './utils.js';

const API_BASE = '/api';
let _saveTimer = null;
let _lastSavedHash = null;

/* ----------------------------------------------------------
   Encryption helpers
   ---------------------------------------------------------- */

let _encryptionKey = null;
const KEY_STORAGE = 'clinic_cloud_key_bits';

export async function setEncryptionPassword(password) {
  const enc = new TextEncoder();
  const salt = enc.encode('haatzmaut-sync-fixed-salt-v1');
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  // Persist derived bits to sessionStorage so key survives page reload
  sessionStorage.setItem(KEY_STORAGE, btoa(String.fromCharCode(...new Uint8Array(derivedBits))));
  await buildKeyFromBits(derivedBits);
}

export async function restoreEncryptionKey() {
  const stored = sessionStorage.getItem(KEY_STORAGE);
  if (!stored) return false;
  try {
    const bits = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    await buildKeyFromBits(bits);
    return true;
  } catch { return false; }
}

async function buildKeyFromBits(derivedBits) {
  const enc = new TextEncoder();
  const cloudKey = await crypto.subtle.importKey(
    'raw', derivedBits, 'HKDF', false, ['deriveKey']
  );
  _encryptionKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('aes-gcm-sync'), info: enc.encode('aes-gcm-key') },
    cloudKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

function clearEncryptionKey() {
  _encryptionKey = null;
  sessionStorage.removeItem(KEY_STORAGE);
}

async function getEncryptionKey() {
  if (!_encryptionKey) throw new Error('No encryption key set — login first');
  return _encryptionKey;
}

async function encryptPayload(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    encryptedData: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
}

async function decryptPayload(key, ivB64, encryptedB64) {
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, encrypted
  );
  return new TextDecoder().decode(decrypted);
}

/* ----------------------------------------------------------
   Serialize current state (same shape as localStorage backup)
   ---------------------------------------------------------- */

function serializedStateForSync() {
  return JSON.stringify({
    _schemaVersion: 2,
    auditLog: state.auditLog,
    loginSecurity: state.loginSecurity,
    activeTab: state.activeTab,
    schedule: state.schedule,
    rooms: state.rooms,
    defaultTemplate: state.defaultTemplate,
    weekTemplates: state.weekTemplates,
    requests: state.requests,
    selectedTags: [...(state.selectedTags || [])],
    weekISO: state.weekISO,
    activeDay: state.activeDay,
    staff: state.staff,
    users: state.users,
    passwordResets: state.passwordResets,
    folders: state.folders,
    files: state.files,
    meetingGroups: state.meetingGroups,
    meetings: state.meetings,
    issues: state.issues,
    waitlist: state.waitlist,
    settings: state.settings,
    displaySettings: state.displaySettings
  });
}

/* ----------------------------------------------------------
   API helpers
   ---------------------------------------------------------- */

function getToken() {
  return sessionStorage.getItem('clinic_cloud_token');
}

function setToken(t) {
  sessionStorage.setItem('clinic_cloud_token', t);
}

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

/* ----------------------------------------------------------
   Auth (verify credentials, get token)
   ---------------------------------------------------------- */

export async function cloudAuth(username, passwordHash) {
  const data = await apiCall('POST', '/auth/verify', { username, passwordHash });
  setToken(data.token);
  return data;
}

/* ----------------------------------------------------------
   Save to cloud
   ---------------------------------------------------------- */

export async function saveToCloud() {
  if (!state.currentUser) return;
  const user = state.users?.find(u => u.username === state.currentUser.username);
  if (!user?.passwordHash && !_encryptionKey) {
    showToast('אין מפתח הצפנה — התחבר מחדש.', 'warn');
    return false;
  }

  try {
    const key = await getEncryptionKey();
    const plain = serializedStateForSync();

    const dataHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
    const hashHex = Array.from(new Uint8Array(dataHash)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (hashHex === _lastSavedHash) return false;

    const { iv, encryptedData } = await encryptPayload(key, plain);
    await apiCall('POST', '/sync/save', { encryptedData, iv, dataHash: hashHex });
    _lastSavedHash = hashHex;
    return true;
  } catch (err) {
    console.error('[cloud-sync] save failed:', err);
    showToast(`שמירה בענן נכשלה: ${err.message}`, 'error');
    return false;
  }
}

/* ----------------------------------------------------------
   Load from cloud
   ---------------------------------------------------------- */

export async function loadFromCloud() {
  if (!state.currentUser) return;

  try {
    const info = await apiCall('GET', '/sync/info');
    if (!info.exists) {
      showToast('לא נמצא מידע שמור בענן.', 'info');
      return null;
    }
    return info;
  } catch (err) {
    showToast(`בדיקת ענן נכשלה: ${err.message}`, 'error');
    return null;
  }
}

export async function loadFromCloudAndApply() {
  if (!_encryptionKey) {
    showToast('אין מפתח הצפנה — התחבר מחדש.', 'warn');
    return;
  }

  try {
    const key = await getEncryptionKey();
    const data = await apiCall('GET', '/sync/load');
    if (!data.encryptedData) {
      showToast('לא נמצא מידע שמור בענן.', 'info');
      return;
    }

    const plain = await decryptPayload(key, data.iv, data.encryptedData);
    const parsed = JSON.parse(plain);

    if (!parsed.rooms || !parsed.staff) {
      throw new Error('מידע הענן פגום או לא שלם.');
    }

    localStorage.setItem('haatzmaut_v6', JSON.stringify(parsed));
    showToast('המידע נטען מהענן — טוען מחדש…', 'info');
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    console.error('[cloud-sync] load failed:', err);
    showToast(`טעינה מהענן נכשלה: ${err.message}`, 'error');
  }
}

/* ----------------------------------------------------------
   Auto-save (debounced, triggered after data changes)
   ---------------------------------------------------------- */

export function scheduleAutoSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    const ok = await saveToCloud();
    if (ok) console.log('[cloud-sync] auto-saved');
  }, 5000);
}

export function saveToCloudNow() {
  clearTimeout(_saveTimer);
  return saveToCloud();
}

/* ----------------------------------------------------------
   Session auth (call on login success)
   ---------------------------------------------------------- */

export async function authenticateCloudSession() {
  if (!state.currentUser) return false;
  const user = state.users?.find(u => u.username === state.currentUser.username);
  if (!user?.passwordHash) return false;

  try {
    await cloudAuth(user.username, user.passwordHash);
    return true;
  } catch {
    return false;
  }
}
