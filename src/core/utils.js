import {
  WORK_START,
  WORK_END,
  SLOT_MIN,
  SLOT_COUNT,
  TEAMS,
  DAY_DEFS,
  MAX_UPLOAD_SIZE,
  AUDIT_LOG_MAX,
  DEFAULT_ROOMS,
  DEV_LOGIN_ENABLED
} from './constants.js';

export const byId = id => document.getElementById(id);

export function pad2(n) { return String(n).padStart(2, "0"); }

export function localISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function minToTime(m) {
  const n = ((m % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(n / 60))}:${pad2(n % 60)}`;
}

export function timeToMin(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

export function slotOf(t)        { return Math.floor((timeToMin(t) - WORK_START) / SLOT_MIN); }
export function slotStart(i)     { return WORK_START + i * SLOT_MIN; }
export function slotsFor(dur)    { return Math.max(1, Math.ceil(dur / SLOT_MIN)); }

export function makeId(prefix = "id") {
  if (window.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function sundayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return localISO(d);
}

export function isoDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

export function shiftWeek(isoStr, weeks) {
  const d = isoDate(isoStr);
  d.setDate(d.getDate() + weeks * 7);
  return localISO(d);
}

export function fmtDate(date) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function fmtShort(date) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" }).format(date);
}

export function todayDayIdx() { const d = new Date().getDay(); return d <= 4 ? d : 0; }

export function clampDay(day) {
  const n = Number(day);
  return Number.isFinite(n) ? Math.min(4, Math.max(0, n)) : 0;
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function sanitizeUrl(url) {
  const s = String(url ?? "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (/^(https?:|mailto:|tel:)\/\//i.test(s)) return s;
  if (lower.startsWith("https://") || lower.startsWith("http://")) return s;
  return "";
}

export function stripHtml(str) {
  return String(str ?? "").replace(/<[^>]*>/g, "");
}

export function safeRender(fn, name = "") {
  try { fn(); } catch (err) {
    console.error(`[render error] ${name}:`, err);
  }
}

export function safeFileDisplayName(name) {
  return String(name || "").replace(/[^a-zA-Z0-9\u0590-\u05FF ._\-]/g, "_");
}

export function generatePassword(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let pwd = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  arr.forEach(b => pwd += chars[b % chars.length]);
  return pwd;
}

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 210000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password, hash, salt) {
  const computed = await hashPassword(password, salt);
  return computed === hash;
}

export async function passwordForUser(rawPassword) {
  const salt = generateSalt();
  const hash = await hashPassword(rawPassword, salt);
  return { salt, passwordHash: hash };
}

export async function migrateUserPassword(user, rawPassword) {
  if (user.passwordHash) return user;
  const { salt, passwordHash } = await passwordForUser(rawPassword);
  user.passwordHash = passwordHash;
  user.salt = salt;
  delete user.password;
  return user;
}

export function normalizeUser(u) {
  return {
    id:        u.id       || makeId("user"),
    username:  String(u.username || "").trim().toLowerCase(),
    passwordHash: String(u.passwordHash || ""),
    salt:        String(u.salt || ""),
    role:      ["admin","staff"].includes(u.role) ? u.role : "staff",
    staffId:   String(u.staffId || ""),
    fullName:  String(u.fullName || "").trim(),
    email:     String(u.email || "").trim(),
    phone:     String(u.phone || "").trim(),
    active:    u.active !== false,
    createdAt: u.createdAt || new Date().toLocaleString("he-IL")
  };
}

export function enforceMaxLength(fieldLabel, value, maxLen) {
  const v = String(value ?? "");
  if (v.length > maxLen) {
    throw new Error(`${fieldLabel} ארוך מדי (מקסימום ${maxLen} תווים).`);
  }
  return v;
}

export function normalizeUsernameInput(raw) {
  const username = String(raw || "").trim().toLowerCase();
  if (!username) throw new Error("יש להזין שם משתמש.");
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    throw new Error("שם משתמש חייב להיות באנגלית באורך 3-50 תווים ויכול לכלול נקודה/קו תחתון/מינוס.");
  }
  return username;
}

export function ensureUploadAllowed(file, label = "קובץ", allowedExt = ["csv", "json"]) {
  if (!file) return false;
  const ext = String(file.name || "").toLowerCase().split(".").pop();
  if (!allowedExt.includes(ext)) {
    showToast(`${label} חייב להיות מסוג ${allowedExt.join("/")}.`, "error");
    return false;
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    showToast(`${label} גדול מדי. מקסימום ${Math.round(MAX_UPLOAD_SIZE / 1024)}KB.`, "error");
    return false;
  }
  const validTypes = {
    csv: ["text/csv", "text/plain", "application/vnd.ms-excel", "application/csv"],
    json: ["application/json", "text/plain"]
  };
  const allowedTypes = allowedExt.flatMap(e => validTypes[e] || []);
  if (allowedTypes.length && file.type && !allowedTypes.includes(file.type) && file.type !== "") {
    showToast(`${label}: סוג קובץ לא מורשה (${file.type}).`, "error");
    return false;
  }
  return true;
}

export function confirmImportPreview(label, totalRows, validRows, extra = "") {
  const invalidRows = Math.max(0, totalRows - validRows);
  const message = [
    `תצוגה מקדימה לייבוא ${label}:`,
    `סה"כ רשומות: ${totalRows}`,
    `רשומות תקינות: ${validRows}`,
    `רשומות שיידחו: ${invalidRows}`,
    extra,
    "להמשיך לייבוא בפועל?"
  ].filter(Boolean).join("\n");
  return confirm(message);
}

export function triggerJsonDownload(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function normalizeDisplayMessage(message) {
  return {
    id: message.id || makeId("displaymsg"),
    text: String(message.text || "").trim(),
    createdAt: String(message.createdAt || new Date().toLocaleString("he-IL")),
    expiresAt: message.expiresAt ? String(message.expiresAt) : "",
    durationMinutes: message.durationMinutes === "unlimited" ? "unlimited" : Math.max(5, Number(message.durationMinutes || 5))
  };
}

export function activeDisplayMessages(settings) {
  const now = Date.now();
  return (settings?.messages || []).filter(message => !message.expiresAt || Date.parse(message.expiresAt) > now);
}

export function normalizeDisplaySettings(settings) {
  const base = {
    switchSeconds: Math.max(5, Number(settings?.switchSeconds || 30)),
    hoursBefore: Math.max(0, Number(settings?.hoursBefore ?? 1)),
    hoursAfter: Math.max(1, Number(settings?.hoursAfter ?? 3)),
    roomsPerPage: Math.max(1, Number(settings?.roomsPerPage || 10)),
  };
  if (settings && typeof settings === "object") {
    base.messages = Array.isArray(settings.messages) ? settings.messages : [];
    base.messagesLog = Array.isArray(settings.messagesLog) ? settings.messagesLog : [];
  }
  return base;
}

export function parseCsvRows(text) {
  let raw = String(text || "").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const parseLine = line => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const cols = parseLine(lines[0]).map(c => c.trim());
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] !== undefined ? vals[i] : ""]));
  });
}

export function csvEscapeField(val) {
  const s = String(val == null ? "" : val);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCsv(headers, rows) {
  const head = headers.map(csvEscapeField).join(",");
  const body = rows.map(row => headers.map(h => csvEscapeField(row[h])).join(",")).join("\r\n");
  return head + "\r\n" + body;
}

export function triggerCsvDownload(filename, csvText) {
  const blob = new Blob(["\uFEFF" + csvText], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function meetingAudienceLabel(v) {
  const m = {
    all: "כלל המרפאה",
    children: "ילדים",
    adults: "מבוגרים"
  };
  return m[v] || v || "";
}

export function dayLabel(key) { return DAY_DEFS.find(d => d.key === Number(key))?.label || ""; }

export function roomColorClass(roomId) {
  const idx = Math.abs(String(roomId || "").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 6;
  return ["rb-1", "rb-2", "rb-3", "rb-4", "rb-5", "rb-6"][idx];
}

export function teamColorClass(team) {
  const map = {
    "ילדים":         "tc-green",
    "מבוגרים":       "tc-blue",
    "נוער":          "tc-purple",
    "זוגות":         "tc-amber",
    "אדמיניסטרציה":  "tc-gray"
  };
  return map[team] || "tc-default";
}

export function validatePhoneIL(raw) {
  const stripped = String(raw || "").replace(/[\s\-().]/g, "");
  if (!stripped) return { valid: false, formatted: "", localized: "", type: "", error: "ריק" };
  if (/^\+972/.test(stripped)) {
    const local = "0" + stripped.slice(4);
    return validatePhoneIL(local);
  }
  const mobileRegex = /^0(5[0-689]\d{7})$/;
  if (mobileRegex.test(stripped)) {
    const num = stripped;
    return { valid: true, formatted: `${num.slice(0,3)}-${num.slice(3)}`, localized: num, type: "mobile", error: "" };
  }
  const landlineRegex = /^0([23489]\d{7})$/;
  if (landlineRegex.test(stripped)) {
    const num = stripped;
    return { valid: true, formatted: `${num.slice(0,2)}-${num.slice(2)}`, localized: num, type: "landline", error: "" };
  }
  const nongeoRegex = /^0(7[2-9]\d{7})$/;
  if (nongeoRegex.test(stripped)) {
    const num = stripped;
    return { valid: true, formatted: `${num.slice(0,3)}-${num.slice(3)}`, localized: num, type: "nongeo", error: "" };
  }
  const tollfreeRegex = /^1-?800\d{6}$/;
  if (tollfreeRegex.test(stripped.replace("-", ""))) {
    return { valid: true, formatted: stripped, localized: stripped, type: "tollfree", error: "" };
  }
  return { valid: false, formatted: stripped, localized: stripped, type: "", error: "מספר לא תקין" };
}

export function formatPhoneForDisplay(raw) {
  const r = validatePhoneIL(raw);
  return r.valid ? r.formatted : String(raw || "");
}

export function toE164(raw) {
  const r = validatePhoneIL(raw);
  if (!r.valid || r.type === "tollfree") return null;
  return "+972" + r.localized.slice(1);
}

export function parseHebrewDate(dateStr) {
  if (!dateStr) return NaN;
  const match = String(dateStr).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})[,\s]+\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, day, month, year, hour, min, sec] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec)).getTime();
  }
  return new Date(dateStr).getTime();
}

export function showToast(text, type = "info") {
  const toast = byId("toast");
  if (!toast) return;
  toast.textContent  = text;
  toast.className    = `toast toast-${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 3200);
  const live = byId("ariaLive");
  if (live && (type === "error" || type === "warn")) {
    live.textContent = text;
    setTimeout(() => { if (live.textContent === text) live.textContent = ""; }, 4000);
  }
}
