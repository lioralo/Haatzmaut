/* ============================================================
   CONSTANTS
   ============================================================ */

export const STORAGE_KEY    = "haatzmaut_v6";
export const STORAGE_VERSION = 2;
export const MAX_UPLOAD_SIZE = 1024 * 1024; // 1MB
export const LOGIN_WINDOW_MS  = 10 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS  = 15 * 60 * 1000;
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const AUDIT_LOG_MAX = 200;
export const PERSIST_DEBOUNCE_MS = 400;

export const DEV_LOGIN_ENABLED = (() => {
  /* Build-time: esbuild define replaces __PROD__ with true/false */
  if (typeof __PROD__ !== "undefined" && __PROD__) return false;
  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const q = new URLSearchParams(window.location.search);
  return isLocalHost && q.get("devAuth") === "1";
})();

export const DAY_DEFS = [
  { key: 0, label: "ראשון",  short: "א׳" },
  { key: 1, label: "שני",    short: "ב׳" },
  { key: 2, label: "שלישי", short: "ג׳" },
  { key: 3, label: "רביעי", short: "ד׳" },
  { key: 4, label: "חמישי", short: "ה׳" }
];

export const WORK_START = 8 * 60;
export const WORK_END   = 20 * 60;
export const SLOT_MIN   = 30;
export const SLOT_COUNT = (WORK_END - WORK_START) / SLOT_MIN;  // 24

export const TEAMS = ["מבוגרים", "ילדים", "נוער", "זוגות", "אדמיניסטרציה"];

export const DEFAULT_ROOMS = [
  { id: "r1",  name: "חדר 1",  tags: ["טיפול ילדים", "ציוד אבחוני"] },
  { id: "r2",  name: "חדר 2",  tags: ["טיפול קבוצתי"] },
  { id: "r3",  name: "חדר 3",  tags: ["טיפול מבוגרים", "ציוד אבחוני"] },
  { id: "r4",  name: "חדר 4",  tags: ["חדר משחק"] },
  { id: "r5",  name: "חדר 5",  tags: ["טיפול זוגות"] },
  { id: "r6",  name: "חדר 6",  tags: ["טיפול נוער"] },
  { id: "r7",  name: "חדר 7",  tags: ["ישיבות", "הדרכה"] },
  { id: "r8",  name: "חדר 8",  tags: ["טיפול ילדים"] },
  { id: "r9",  name: "חדר 9",  tags: ["ציוד אבחוני", "הדרכה"] },
  { id: "r10", name: "חדר 10", tags: ["טיפול מבוגרים"] },
  { id: "r11", name: "חדר 11", tags: ["טיפול קבוצתי", "ישיבות"] },
  { id: "r12", name: "חדר 12", tags: ["אדמיניסטרציה"] }
];

export const DEFAULT_STAFF = [
  { id: "s1", fullName: "מנהל מערכת",  phone: "0500000000", email: "admin@clinic.org",  role: "מנהל",              team: "אדמיניסטרציה" },
  { id: "s2", fullName: 'ד"ר לוי',      phone: "0500000001", email: "levy@clinic.org",   role: "פסיכולוג",           team: "מבוגרים"      },
  { id: "s3", fullName: "נועה כהן",     phone: "0500000002", email: "noa@clinic.org",    role: "מטפלת",              team: "ילדים"         },
  { id: "s4", fullName: "יואב בר",      phone: "0500000003", email: "yoav@clinic.org",   role: "פסיכולוג",           team: "מבוגרים"      },
  { id: "s5", fullName: "מאיה לוי",     phone: "0500000004", email: "maya@clinic.org",   role: "מטפלת",              team: "מבוגרים"      },
  { id: "s6", fullName: "עדי רוזן",     phone: "0500000005", email: "adi@clinic.org",    role: "עובדת סוציאלית",     team: "ילדים"         },
  { id: "s7", fullName: "שרון מזרחי",   phone: "0500000006", email: "sharon@clinic.org", role: "פסיכולוגית",         team: "נוער"          },
  { id: "s8", fullName: "רן כהן",       phone: "0500000007", email: "ran@clinic.org",    role: "מטפל זוגות",         team: "זוגות"         }
];

/* First-run bootstrap: returns raw default data.
   Template building (templateFromEntries, buildDefaultSchedule, sundayISO)
   is done by the caller (state.js) after all modules are imported. */
export function buildBootstrapState() {
  return {
    needsSetup: true,
    defaultRooms: DEFAULT_ROOMS.map(r => ({ ...r })),
    defaultStaff: DEFAULT_STAFF.map(s => ({ ...s }))
  };
}
