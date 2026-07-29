/* ============================================================
   CLOUD SYNC — client-side encrypt/decrypt + API transport
   ============================================================ */

import { state, persistStateImmediate, recordAudit } from './store.js';
import { showToast, todayDayIdx, sundayISO } from './utils.js';
import { passwordForUser } from './utils.js';

const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'https://haatzmaut.lior-clinic.org/api'
  : '/api';

let _encryptionKey = null;

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

export function getCloudSyncClientState() {
  return {
    apiBase: API_BASE,
    hasEncryptionKey: Boolean(_encryptionKey),
    hasStoredKeyBits: Boolean(sessionStorage.getItem('clinic_cloud_key_bits')),
    hasToken: Boolean(getToken())
  };
}

async function ensureSyncUserForCloud() {
  const currentUsername = String(state.currentUser?.username || '').trim();
  if (!currentUsername) return null;

  let user = state.users?.find(u => u.username === currentUsername);
  if (user?.passwordHash) return user;

  if (currentUsername !== 'admin') return user || null;

  const { salt, passwordHash } = await passwordForUser('admin123');
  if (!user) {
    user = {
      id: `user-${Date.now()}`,
      username: currentUsername,
      role: state.currentUser.role || 'admin',
      staffId: state.currentUser.staffId || '',
      active: true
    };
    if (!Array.isArray(state.users)) state.users = [];
    state.users.push(user);
  }

  user.salt = salt;
  user.passwordHash = passwordHash;
  persistStateImmediate();
  return user;
}

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

export async function runCloudSelfTest() {
  const steps = [];
  try {
    if (!state.currentUser) {
      steps.push({ name: 'user', ok: false, detail: 'אין משתמש מחובר' });
      return { ok: false, steps };
    }
    steps.push({ name: 'user', ok: true, detail: state.currentUser.username });

    const user = await ensureSyncUserForCloud();
    if (!user?.passwordHash) {
      steps.push({ name: 'credentials', ok: false, detail: 'חסר passwordHash' });
      return { ok: false, steps };
    }
    steps.push({ name: 'credentials', ok: true, detail: 'hash זמין' });

    if (!_encryptionKey) {
      const restored = await restoreEncryptionKey();
      steps.push({ name: 'key', ok: restored, detail: restored ? 'מפתח שוחזר' : 'מפתח לא זמין' });
      if (!restored) return { ok: false, steps };
    } else {
      steps.push({ name: 'key', ok: true, detail: 'מפתח פעיל בזיכרון' });
    }

    const auth = await apiCall('POST', '/auth/verify', {
      username: user.username,
      passwordHash: user.passwordHash
    });
    setToken(auth.token);
    steps.push({ name: 'auth', ok: true, detail: 'auth תקין' });

    const info = await apiCall('GET', '/sync/info');
    steps.push({
      name: 'sync-info',
      ok: true,
      detail: info.exists ? `קיים גיבוי (${Math.round((info.sizeBytes || 0) / 1024)}KB)` : 'אין גיבוי שמור'
    });

    const health = await fetch(`${API_BASE}/healthz`).then(r => r.ok ? r.json().catch(() => ({})) : null).catch(() => null);
    steps.push({ name: 'health', ok: Boolean(health?.status === 'ok'), detail: health?.status || 'ללא תגובה' });

    return { ok: steps.every(step => step.ok), steps };
  } catch (err) {
    steps.push({ name: 'error', ok: false, detail: err.message || 'שגיאה לא ידועה' });
    return { ok: false, steps };
  }
}

/* --- Public API --- */
export async function saveToCloud(snapshotPayload = null, context = {}) {
  if (!state.currentUser) { showToast('יש להתחבר תחילה.', 'warn'); return false; }
  try {
    const user = await ensureSyncUserForCloud();
    if (!user?.passwordHash) { showToast('התחבר מחדש כדי לשמור.', 'warn'); return false; }
    if (!_encryptionKey) {
      const restored = await restoreEncryptionKey();
      if (!restored) { showToast('התחבר מחדש כדי לשמור.', 'warn'); return false; }
    }

    const auth = await apiCall('POST', '/auth/verify', { username: user.username, passwordHash: user.passwordHash });
    setToken(auth.token);

    const plain = snapshotPayload === null
      ? serializedStateForSync()
      : JSON.stringify(snapshotPayload);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
    const hashHex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

    const { iv, encryptedData } = await encryptPayload(_encryptionKey, plain);
    await apiCall('POST', '/sync/save', { encryptedData, iv, dataHash: hashHex });

    const payload = snapshotPayload && typeof snapshotPayload === 'object' ? snapshotPayload : state;
    const entryCount = Array.isArray(payload?.schedule) ? payload.schedule.length : (state.schedule || []).length;
    const staffCount = Array.isArray(payload?.staff) ? payload.staff.length : (state.staff || []).length;
    const action = context?.sourceType === 'library' ? 'cloud.save.snapshot' : 'cloud.save.success';
    const source = context?.sourceLabel ? ` (${context.sourceLabel})` : '';
    recordAudit(action, `נשמר לענן${source}: ${entryCount} הזמנות, ${staffCount} אנשי צוות.`, 'critical', true);
    persistStateImmediate();
    showToast('נשמר לענן בהצלחה.', 'info');
    return true;
  } catch (err) {
    recordAudit('cloud.save.failed', err.message || 'שמירה נכשלה.', 'critical', false);
    showToast('שמירה נכשלה: ' + (err.message || 'שגיאה'), 'error');
    return false;
  }
}

export async function loadFromCloud() {
  if (!state.currentUser) { showToast('יש להתחבר תחילה.', 'warn'); return null; }
  try {
    const user = await ensureSyncUserForCloud();
    if (user?.passwordHash) {
      const auth = await apiCall('POST', '/auth/verify', { username: user.username, passwordHash: user.passwordHash });
      setToken(auth.token);
    }
    const info = await apiCall('GET', '/sync/info');
    if (!info.exists) { showToast('לא נמצא מידע בענן.', 'info'); return null; }
    return info;
  } catch (err) {
    showToast('בדיקת ענן נכשלה: ' + (err.message || 'שגיאת רשת'), 'error');
    return null;
  }
}

export async function loadFromCloudAndApply() {
  if (!_encryptionKey) {
    const restored = await restoreEncryptionKey();
    if (!restored) { showToast('התחבר מחדש כדי לטעון.', 'warn'); return; }
  }
  try {
    const data = await apiCall('GET', '/sync/load');
    if (!data.encryptedData) { showToast('לא נמצא מידע בענן.', 'info'); return; }
    const plain = await decryptPayload(_encryptionKey, data.iv, data.encryptedData);
    const parsed = JSON.parse(plain);
    if (!parsed.rooms || !parsed.staff) throw new Error('מידע פגום');

    // Apply directly to state
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
    state.weekISO = sundayISO();
    state.activeDay = todayDayIdx();
    if (parsed.selectedTags) state.selectedTags = new Set(parsed.selectedTags);
    if (parsed.loginSecurity) state.loginSecurity = parsed.loginSecurity;

    persistStateImmediate();
    const entryCount = (parsed.schedule || []).length;
    recordAudit('cloud.load.success', `נטען מהענן: ${entryCount} הזמנות, ${(parsed.staff||[]).length} אנשי צוות.`, 'critical', true);
    showToast('נטען מהענן — מרענן תצוגה…', 'info');
    
    // Re-sync schedule window and expand recurring entries
    setTimeout(async () => {
      const main = await import('../main.js');
      const calState = await import('../calendar/state.js');
      calState.ensureSyncedScheduleWindow();
      calState.expandRecurringEntries(8);
      calState.cleanExpiredWaitlist();
      main.renderActiveTab();
    }, 300);
  } catch (err) {
    recordAudit('cloud.load.failed', err.message || 'טעינה נכשלה.', 'critical', false);
    showToast('טעינה נכשלה: ' + (err.message || 'שגיאה'), 'error');
  }
}
