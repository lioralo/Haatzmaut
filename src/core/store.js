/* ============================================================
   STORE - core state persistence module
   ============================================================ */

import {
  STORAGE_KEY,
  STORAGE_VERSION,
  AUDIT_LOG_MAX,
  PERSIST_DEBOUNCE_MS
} from './constants.js';

import {
  makeId,
  triggerJsonDownload,
  showToast
} from './utils.js';

/* ============================================================
   SHARED STATE
   ============================================================ */

export const state = {
  // Core
  currentUser: null,
  auditLog: [],
  loginSecurity: { failures: [], lockUntil: 0 },
  activeTab: "dashboard",

  // Calendar (will be populated by calendar/state.js on init)
  schedule: [],
  rooms: [],
  defaultTemplate: [],
  weekTemplates: {},
  requests: [],
  selectedTags: new Set(),
  weekISO: "",
  activeDay: 0,

  // Staff (will be populated by staff/state.js on init)
  staff: [],
  users: [],
  passwordResets: [],

  // Resources (will be populated by resources/state.js on init)
  folders: [],
  files: [],

  // Meetings (will be populated by meetings/state.js on init)
  meetingGroups: [],
  meetings: [],

  // Issues (will be populated by issues/state.js on init)
  issues: [],
  waitlist: [],

  settings: { workHours: { 0: {start:"08:00",end:"20:00"}, 1: {start:"08:00",end:"20:00"}, 2: {start:"08:00",end:"20:00"}, 3: {start:"08:00",end:"20:00"}, 4: {start:"08:00",end:"20:00"} }, slotDuration: 30, clinicName: "מרפאה", clinicPhone: "", clinicAddress: "", cancelPolicyHours: 24, noteTemplates: [], teams: ["מבוגרים","ילדים","נוער","זוגות","אדמיניסטרציה"] },
  issueFilter: "all",

  // UI state
  displaySettings: {},
  modes: { staff: "view", meetings: "view", resources: "browse", issues: "board", requests: "view", calendar: "schedule" },
  searchQuery: "",
  sidebarCollapsed: false,

  // Patient fields
  noteTypes: ["therapy", "intake", "diagnosis", "discharge", "other"],
  
  // Filters
  staffFilter: null,
  hourRange: "all",
  
  // Transient
  drag: null,
  needsSetup: false,
  bootstrap: null,
  staffSearch: ""
};

/* ============================================================
   LOCALSTORAGE READ / WRITE
   ============================================================ */

export function loadStoredState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw) return null;
    return migrateState(raw);
  } catch { return null; }
}

export function migrateState(raw) {
  let data = raw;
  const ver = data._schemaVersion || 1;
  if (ver < 2) {
    if (Array.isArray(data.users)) {
      data.users = data.users.map(u => {
        if (u.password && !u.passwordHash) {
          return { ...u, password: u.password };
        }
        return u;
      });
    }
    data._schemaVersion = 2;
  }
  return data;
}

function serializedState() {
  return {
    _schemaVersion: STORAGE_VERSION,
    auditLog: state.auditLog,
    loginSecurity: state.loginSecurity,
    activeTab: state.activeTab,
    schedule: state.schedule,
    rooms: state.rooms,
    defaultTemplate: state.defaultTemplate,
    weekTemplates: state.weekTemplates,
    requests: state.requests,
    selectedTags: [...state.selectedTags],
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
  };
}

let _persistTimer = null;

export function persistState() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializedState()));
    } catch {}
  }, PERSIST_DEBOUNCE_MS);
}

export function persistStateImmediate() {
  clearTimeout(_persistTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializedState()));
  } catch {}
}

/* ============================================================
   SELECTORS
   ============================================================ */

export const isAdmin = () => state.currentUser?.role === "admin";
export const getStaffById = id => state.staff.find(s => s.id === id);

/* ============================================================
   AUDIT
   ============================================================ */

export function recordAudit(action, detail = "", severity = "info", shouldPersist = true) {
  state.auditLog.unshift({
    id: makeId("audit"),
    at: new Date().toLocaleString("he-IL"),
    user: state.currentUser?.username || "system",
    action,
    detail: String(detail || ""),
    severity: ["info", "warn", "critical"].includes(severity) ? severity : "info"
  });
  if (state.auditLog.length > AUDIT_LOG_MAX) {
    state.auditLog = state.auditLog.slice(0, AUDIT_LOG_MAX);
  }
  if (shouldPersist) persistState();
}

/* ============================================================
   BACKUP / RESTORE
   ============================================================ */

export function exportFullBackup() {
  const payload = {
    _schemaVersion: STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    app: "haatzmaut",
    data: {
      auditLog: state.auditLog,
      loginSecurity: state.loginSecurity,
      activeTab: state.activeTab,
      rooms: state.rooms,
      staff: state.staff,
      schedule: state.schedule,
      defaultTemplate: state.defaultTemplate,
      weekTemplates: state.weekTemplates,
      requests: state.requests,
      meetings: state.meetings,
      meetingGroups: state.meetingGroups,
      folders: state.folders,
      files: state.files,
      issues: state.issues,
      waitlist: state.waitlist,
      settings: state.settings,
      displaySettings: state.displaySettings,
      users: state.users,
      passwordResets: state.passwordResets,
      selectedTags: [...state.selectedTags],
      weekISO: state.weekISO,
      activeDay: state.activeDay
    }
  };
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  triggerJsonDownload(`haatzmaut_backup_${ts}.json`, payload);
}

async function deriveKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("haatzmaut-salt-v1"), iterations: 200000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function exportEncryptedBackup() {
  const password = prompt("הזן סיסמה להצפנת הגיבוי:");
  if (!password) return;
  try {
    const payload = {
      _schemaVersion: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      app: "haatzmaut",
      data: serializedState()
    };
    const json = JSON.stringify(payload);
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(json));
    const result = { enc: true, iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    triggerJsonDownload(`haatzmaut_encrypted_${ts}.json`, result);
    showToast("גיבוי מוצפן יוצא.", "info");
  } catch (err) { showToast("שגיאה בהצפנה: " + err.message, "error"); }
}

export async function importEncryptedBackup(file) {
  const password = prompt("הזן סיסמה לפענוח הגיבוי:");
  if (!password) return;
  try {
    const text = await file.text();
    const blob = JSON.parse(text);
    if (!blob.enc || !blob.data || !blob.iv) throw new Error("קובץ מוצפן לא תקין.");
    const key = await deriveKey(password);
    const iv = new Uint8Array(blob.iv);
    const ciphertext = new Uint8Array(blob.data);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const json = new TextDecoder().decode(decrypted);
    const payload = JSON.parse(json);
    applyImportedState(payload);
    showToast("גיבוי מוצפן שוחזר בהצלחה.", "info");
  } catch (err) { showToast("שגיאה בפענוח - ייתכן שהסיסמה שגויה.", "error"); }
}

const AUTOBACKUP_KEY = "haatzmaut_autobackup";
const AUTOBACKUP_INTERVAL_MS = 60 * 60 * 1000;
const AUTOBACKUP_MAX = 24;

let _autoBackupTimer = null;

export function autoBackup() {
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      data: serializedState()
    };
    let backups = [];
    try {
      backups = JSON.parse(localStorage.getItem(AUTOBACKUP_KEY) || "[]");
    } catch {}
    if (!Array.isArray(backups)) backups = [];
    backups.push(payload);
    if (backups.length > AUTOBACKUP_MAX) {
      backups = backups.slice(backups.length - AUTOBACKUP_MAX);
    }
    localStorage.setItem(AUTOBACKUP_KEY, JSON.stringify(backups));
    showToast("גיבוי אוטומטי נשמר.", "info");
  } catch {}
}

export function startAutoBackup() {
  if (_autoBackupTimer) return;
  autoBackup();
  _autoBackupTimer = setInterval(autoBackup, AUTOBACKUP_INTERVAL_MS);
}

export function applyImportedState(rawState) {
  if (!rawState || typeof rawState !== "object") throw new Error("קובץ גיבוי לא תקין.");
  const candidate = rawState.data && typeof rawState.data === "object" ? rawState.data : rawState;
  if (!Array.isArray(candidate.rooms) || !Array.isArray(candidate.schedule)) {
    throw new Error("גיבוי חסר שדות חובה (rooms/schedule).");
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
  persistStateImmediate();
  recordAudit("state.import", "בוצע ייבוא גיבוי — טוען מחדש.", "warn", false);
  window.location.reload();
}

/* ============================================================
   INTEGRITY
   ============================================================ */

export function buildIntegrityReport() {
  const report = [];
  const fixes = [];
  const roomIds = new Set(state.rooms.map(r => r.id));
  const staffIds = new Set(state.staff.map(s => s.id));
  const allTags = new Set(state.rooms.flatMap(r => r.tags));

  const brokenUsers = state.users.filter(u => u.staffId && !staffIds.has(u.staffId));
  if (brokenUsers.length) {
    report.push(`נמצאו ${brokenUsers.length} משתמשים עם שיוך צוות לא תקין.`);
    fixes.push(() => {
      state.users = state.users.map(u => (u.staffId && !staffIds.has(u.staffId)) ? { ...u, staffId: "" } : u);
    });
  }

  const brokenEntries = state.schedule.filter(e => !roomIds.has(e.roomId));
  if (brokenEntries.length) {
    report.push(`נמצאו ${brokenEntries.length} הזמנות עם חדר לא קיים.`);
    fixes.push(() => {
      state.schedule = state.schedule.filter(e => roomIds.has(e.roomId));
    });
  }

  const brokenRequests = state.requests.filter(r => r.roomId && !roomIds.has(r.roomId));
  if (brokenRequests.length) {
    report.push(`נמצאו ${brokenRequests.length} בקשות שינוי עם חדר לא קיים.`);
    fixes.push(() => {
      state.requests = state.requests.map(r => (r.roomId && !roomIds.has(r.roomId))
        ? { ...r, roomId: "", room: "" }
        : r);
    });
  }

  const staleSelectedTags = [...state.selectedTags].filter(tag => !allTags.has(tag));
  if (staleSelectedTags.length) {
    report.push(`נמצאו ${staleSelectedTags.length} תגיות סינון שכבר לא קיימות.`);
    fixes.push(() => {
      state.selectedTags = new Set([...state.selectedTags].filter(tag => allTags.has(tag)));
    });
  }

  return {
    hasIssues: report.length > 0,
    report,
    applyFixes: () => fixes.forEach(fn => fn())
  };
}

export function runIntegrityAssistant() {
  const integrity = buildIntegrityReport();
  if (!integrity.hasIssues) return;
  const summary = integrity.report.join("\n");
  const shouldFix = confirm(`זוהו אי-התאמות בנתונים:\n${summary}\n\nלהפעיל תיקון אוטומטי עכשיו?`);
  if (!shouldFix) {
    showToast("זוהו אי-התאמות. מומלץ לבצע שחזור/ניקוי מאדמין.", "warn");
    recordAudit("integrity.scan.warning", "זוהו אי-התאמות והמשתמש דחה תיקון אוטומטי.", "warn", true);
    return;
  }
  integrity.applyFixes();
  persistState();
  recordAudit("integrity.scan.repaired", integrity.report.join(" | "), "critical", true);
  showToast("תיקון הנתונים הושלם.", "info");
}

/* ============================================================
   MANAGED BACKUPS (localStorage)
   ============================================================ */

const MANAGED_BACKUPS_KEY = "haatzmaut_managed_backups";
const MAX_MANAGED = 50;

export function saveManagedBackup(label = "") {
  const payload = serializedState();
  const backup = {
    id: makeId("backup"),
    label: label || `גיבוי ${new Date().toLocaleString("he-IL")}`,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toLocaleString("he-IL"),
    size: JSON.stringify(payload).length,
    rooms: (state.rooms || []).length,
    entries: (state.schedule || []).length,
    meetings: (state.meetings || []).length,
    data: payload
  };
  let backups = [];
  try { backups = JSON.parse(localStorage.getItem(MANAGED_BACKUPS_KEY) || "[]"); } catch {}
  if (!Array.isArray(backups)) backups = [];
  backups.unshift(backup);
  if (backups.length > MAX_MANAGED) backups = backups.slice(0, MAX_MANAGED);
  localStorage.setItem(MANAGED_BACKUPS_KEY, JSON.stringify(backups));
  return backup;
}

export function getManagedBackups() {
  try { return JSON.parse(localStorage.getItem(MANAGED_BACKUPS_KEY) || "[]"); } catch {}
  return [];
}

export function restoreManagedBackup(backupId) {
  const backups = getManagedBackups();
  const backup = backups.find(b => b.id === backupId);
  if (!backup || !backup.data) throw new Error("גיבוי לא נמצא.");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(backup.data));
  persistStateImmediate();
  recordAudit("state.restore", `שוחזר גיבוי: ${backup.label}`, "critical", false);
}

export function deleteManagedBackup(backupId) {
  let backups = getManagedBackups();
  backups = backups.filter(b => b.id !== backupId);
  localStorage.setItem(MANAGED_BACKUPS_KEY, JSON.stringify(backups));
}
