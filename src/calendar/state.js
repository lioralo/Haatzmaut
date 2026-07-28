/* ============================================================
   CALENDAR STATE - schedule / rooms / requests / templates
   ============================================================ */

import { state, persistState, recordAudit, getStaffById, isAdmin } from '../core/store.js';
import {
  DAY_DEFS,
  WORK_START,
  WORK_END,
  SLOT_MIN,
  SLOT_COUNT,
  TEAMS,
  DEFAULT_ROOMS
} from '../core/constants.js';
import {
  makeId,
  sundayISO,
  localISO,
  minToTime,
  timeToMin,
  slotOf,
  slotStart,
  slotsFor,
  clampDay,
  fmtDate,
  fmtShort,
  isoDate,
  addDays,
  shiftWeek,
  todayDayIdx,
  esc,
  dayLabel,
  roomColorClass,
  teamColorClass,
  showToast,
  parseHebrewDate,
  csvEscapeField,
  buildCsv,
  parseCsvRows,
  triggerJsonDownload,
  triggerCsvDownload,
  ensureUploadAllowed,
  confirmImportPreview,
  enforceMaxLength,
  generatePassword,
  passwordForUser,
  normalizeUser
} from '../core/utils.js';

/* ============================================================
   NORMALIZATION
   ============================================================ */

export function normalizeRoom(r) {
  return {
    id:   r.id   || makeId("room"),
    name: String(r.name || "").trim() || "חדר ללא שם",
    tags: Array.isArray(r.tags)
      ? r.tags.map(t => String(t).trim()).filter(Boolean)
      : String(r.tags || "").split(",").map(t => t.trim()).filter(Boolean)
  };
}

export function normalizeStaff(s) {
  return {
    id:       s.id       || makeId("staff"),
    fullName: String(s.fullName || "").trim(),
    phone:    String(s.phone    || "").trim(),
    email:    String(s.email    || "").trim(),
    role:     String(s.role     || "").trim(),
    team:     String(s.team     || TEAMS[0])
  };
}

export function normalizeEntry(e, weekISO, roomsList) {
  const week = e.weekISO || e.weekStartISO || e.weekStart || weekISO || sundayISO();
  const rooms = roomsList || DEFAULT_ROOMS;
  let roomId = String(e.roomId || e.room || "");
  if (!rooms.find(r => r.id === roomId)) {
    const byName = rooms.find(r => r.name === roomId);
    roomId = byName?.id || rooms[0]?.id || "";
  }
  return {
    id:       e.id       || makeId("entry"),
    weekISO:  week,
    day:      clampDay(e.day ?? 0),
    roomId,
    start:    e.start    || e.startTime || e.hour || "08:00",
    duration: Math.max(30, Number(e.duration || 60)),
    staff:    String(e.staff  || "").trim(),
    clientName: String(e.clientName || "").trim(),
    team:     String(e.team   || TEAMS[0]),
    oneTime:  Boolean(e.oneTime),
    note:     String(e.note   || e.notes || "").trim(),
    noteType: String(e.noteType || "therapy"),
    sessionStatus: e.sessionStatus || "scheduled",
    source:   String(e.source || "manual"),
    recurringRule: e.recurringRule || e.recurring || null,
    recurringEndDate: e.recurringEndDate || e.recurringEnd || "",
    parentRecurringId: e.parentRecurringId || "",
    cancelReason: e.cancelReason || "",
    cancelledAt: e.cancelledAt || ""
  };
}

export function normalizeRequest(req) {
  return {
    id: req.id || makeId("req"),
    team: String(req.team || TEAMS[0]),
    room: String(req.room || req.roomId || ""),
    roomId: String(req.roomId || req.room || ""),
    day: clampDay(req.day ?? 0),
    startTime: String(req.startTime || req.start || "08:00"),
    start: String(req.start || req.startTime || "08:00"),
    staff: String(req.staff || "").trim(),
    duration: Math.max(30, Number(req.duration || 60)),
    oneTime: Boolean(req.oneTime),
    reason: String(req.reason || "").trim(),
    targetEntryId: String(req.targetEntryId || ""),
    status: req.status || "pending",
    createdAt: req.createdAt || new Date().toLocaleString("he-IL"),
    decidedAt: req.decidedAt || "",
    decidedBy: req.decidedBy || ""
  };
}

/* ============================================================
   TEMPLATES
   ============================================================ */

export function normalizeTemplateEntry(e, roomsList) {
  const n = normalizeEntry(e, sundayISO(), roomsList);
  return {
    day: n.day,
    roomId: n.roomId,
    start: n.start,
    duration: n.duration,
    staff: n.staff,
    team: n.team,
    oneTime: n.oneTime,
    note: n.note,
    noteType: n.noteType || "therapy",
    recurringRule: n.recurringRule || "",
    recurringEndDate: n.recurringEndDate || "",
    clientName: String(e.clientName || "").trim(),
    sessionStatus: n.sessionStatus || "scheduled",
    source: n.source || "template"
  };
}

export function templateFromEntries(entries, roomsList) {
  return (entries || []).map(e => normalizeTemplateEntry(e, roomsList));
}

export function instantiateTemplateWeek(template, weekISO, roomsList) {
  return (template || []).map(t => normalizeEntry({ ...t, weekISO }, weekISO, roomsList));
}

export function getWeekTemplate(weekISO) {
  return state.weekTemplates[weekISO] || state.defaultTemplate;
}

export function replaceWeekSchedule(weekISO, template) {
  state.schedule = state.schedule.filter(e => e.weekISO !== weekISO);
  state.schedule.push(...instantiateTemplateWeek(template, weekISO, state.rooms));
}

export function ensureSyncedScheduleWindow() {
  const weekList = [0, 1, 2].map(w => shiftWeek(state.weekISO, w));
  weekList.forEach(iso => {
    const hasWeek = state.schedule.some(e => e.weekISO === iso);
    if (!hasWeek) replaceWeekSchedule(iso, getWeekTemplate(iso));
  });
}

export function applyTemplateScope(template, scope) {
  const weeks = [];
  if (scope === "current") weeks.push(state.weekISO);
  if (scope === "upcoming") weeks.push(shiftWeek(state.weekISO, 1), shiftWeek(state.weekISO, 2));
  if (scope === "current-upcoming") weeks.push(state.weekISO, shiftWeek(state.weekISO, 1), shiftWeek(state.weekISO, 2));

  weeks.forEach(iso => {
    state.weekTemplates[iso] = template;
    replaceWeekSchedule(iso, template);
    const nextISO = shiftWeek(iso, 1);
    if (!state.weekTemplates[nextISO]) {
      state.weekTemplates[nextISO] = state.defaultTemplate;
      if (!state.schedule.some(e => e.weekISO === nextISO)) {
        replaceWeekSchedule(nextISO, state.defaultTemplate);
      }
    }
  });
  ensureSyncedScheduleWindow();
}

/* ============================================================
   VALIDATION & STAFF MERGE
   ============================================================ */

export function isValidScheduleTemplateRecord(rec) {
  if (!rec || typeof rec !== "object") return false;
  const day = Number(rec.day);
  const start = String(rec.start || "").trim();
  const duration = Number(rec.duration || 0);
  const hasRoom = String(rec.roomId || rec.room || "").trim();
  return Number.isFinite(day) && day >= 0 && day <= 4 && /^\d{2}:\d{2}$/.test(start) && duration > 0 && Boolean(hasRoom);
}

export function isValidStaffRecord(rec) {
  if (!rec || typeof rec !== "object") return false;
  return Boolean(String(rec.fullName || rec.name || "").trim());
}

export function staffKey(rec) {
  const fullName = String(rec.fullName || rec.name || "").trim().toLowerCase();
  const email = String(rec.email || "").trim().toLowerCase();
  const phone = String(rec.phone || "").trim();
  return fullName || email || phone || String(rec.id || makeId("staffkey"));
}

export function mergeStaffWithLinkedPriority(existingStaff, incomingRecords, users) {
  const linkedIds = new Set((users || []).map(u => String(u.staffId || "")).filter(Boolean));
  const groups = new Map();

  const addToGroup = (rec, origin) => {
    const normalized = normalizeStaff(rec);
    const key = staffKey(normalized);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ origin, rec: normalized });
  };

  (existingStaff || []).forEach(s => addToGroup(s, "existing"));
  (incomingRecords || []).forEach(s => addToGroup(s, "incoming"));

  const merged = [];
  const remap = new Map();

  groups.forEach(items => {
    const existing = items.filter(i => i.origin === "existing").map(i => i.rec);
    const incoming = items.filter(i => i.origin === "incoming").map(i => i.rec);

    const linkedExisting = existing.find(e => linkedIds.has(e.id));
    let keeper = linkedExisting || existing[0] || incoming[incoming.length - 1];
    if (!keeper) return;

    if (incoming.length) {
      const latestIncoming = incoming[incoming.length - 1];
      if (!linkedExisting) {
        keeper = normalizeStaff({ ...keeper, ...latestIncoming, id: keeper.id || latestIncoming.id });
      } else {
        keeper = normalizeStaff({
          ...latestIncoming,
          ...keeper,
          phone: keeper.phone || latestIncoming.phone,
          email: keeper.email || latestIncoming.email,
          role: keeper.role || latestIncoming.role,
          team: keeper.team || latestIncoming.team,
          id: keeper.id
        });
      }
    }

    existing.forEach(s => {
      if (s.id !== keeper.id) remap.set(s.id, keeper.id);
    });
    merged.push(keeper);
  });

  const updatedUsers = (users || []).map(u => {
    const mapped = remap.get(String(u.staffId || ""));
    return mapped ? { ...u, staffId: mapped } : u;
  });

  return { staff: merged, users: updatedUsers };
}

export async function resolveUnmatchedStaffUsers(staffRecords, existingUsers) {
  const unmatched = staffRecords.filter(s => {
    return !(existingUsers || []).some(u => u.staffId === s.id && u.active);
  });

  if (!unmatched.length) return [];

  const unlinkedUsers = (existingUsers || []).filter(u => !u.staffId || !(state.staff || []).some(st => st.id === u.staffId));
  const userOptions = unlinkedUsers.map(u => `<option value="${u.id}">${u.username} (${u.role})</option>`).join("");

  return new Promise(async (resolve) => {
    const results = [];
    let applyToRemaining = null;

    for (let i = 0; i < unmatched.length; i++) {
      const s = unmatched[i];

      if (applyToRemaining) {
        if (applyToRemaining.choice === "create") {
          const username = s.fullName.replace(/\s+/g, ".").replace(/[^a-zA-Z0-9._-]/g, "").substring(0, 50).toLowerCase() || `user${makeId("u")}`;
          const rawPwd = generatePassword();
          const { salt, passwordHash } = await passwordForUser(rawPwd);
          results.push({ user: normalizeUser({ username, passwordHash, salt, role: "staff", staffId: s.id, active: true }), rawPassword: rawPwd, staffName: s.fullName });
        } else if (applyToRemaining.existingUserId) {
          results.push({ existingUserId: applyToRemaining.existingUserId, staffId: s.id, staffName: s.fullName });
        }
        continue;
      }

      const remaining = unmatched.length - i;
      const progress = remaining > 1 ? ` (${i + 1} מתוך ${unmatched.length})` : "";
      const dialog = document.createElement("dialog");
      dialog.style.cssText = "padding:20px;border-radius:12px;border:1px solid var(--line);max-width:540px;width:90vw;background:var(--surface-2);box-shadow:0 16px 48px rgba(0,0,0,0.2)";

      const html = `
        <h3 style="margin:0 0 8px">משתמש לא מזוהה${progress}</h3>
        <p class="muted small" style="margin:0 0 12px" dir="rtl">איש הצוות <strong>${esc(s.fullName)}</strong> יובא אך לא מקושר למשתמש מערכת. מה לעשות?</p>
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <strong style="min-width:80px">${esc(s.fullName)}</strong>
          <select data-unmatched-action id="unmatchedAction_${i}" style="width:auto;flex:1;min-width:140px">
            <option value="create">צור משתמש חדש</option>
            ${unlinkedUsers.length ? `<optgroup label="שייך למשתמש קיים">${userOptions}</optgroup>` : ''}
            <option value="none">השאר ללא משתמש</option>
          </select>
        </div>
        ${remaining > 1 ? `<label style="display:flex;align-items:center;gap:.35rem;margin-bottom:6px;font-size:.85rem;cursor:pointer"><input type="checkbox" id="unmatchedApplyAll_${i}" /><span>החל פעולה זו על כל שאר ${remaining - 1} אנשי הצוות</span></label>` : ''}
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" id="unmatchedCancel_${i}" class="btn-sm secondary">בטל הכל</button>
          <button type="button" id="unmatchedConfirm_${i}" class="btn-sm">אישור</button>
        </div>`;

      dialog.innerHTML = html;
      document.body.appendChild(dialog);
      const doClose = () => { dialog.close(); dialog.remove(); };

      const choice = await new Promise((res) => {
        dialog.showModal();
        dialog.querySelector(`#unmatchedConfirm_${i}`).onclick = () => {
          const actionEl = dialog.querySelector(`#unmatchedAction_${i}`);
          const applyAllEl = dialog.querySelector(`#unmatchedApplyAll_${i}`);
          res({ action: actionEl ? actionEl.value : "none", applyAll: applyAllEl ? applyAllEl.checked : false });
        };
        dialog.querySelector(`#unmatchedCancel_${i}`).onclick = () => { res({ action: "cancel", applyAll: false }); };
      });

      if (choice.action === "cancel") { doClose(); resolve(null); return; }

      if (choice.applyAll && remaining > 1) {
        applyToRemaining = { choice: choice.action };
        if (choice.action !== "create" && choice.action !== "none") applyToRemaining.existingUserId = choice.action;
      }

      if (choice.action === "create") {
        const username = s.fullName.replace(/\s+/g, ".").replace(/[^a-zA-Z0-9._-]/g, "").substring(0, 50).toLowerCase() || `user${makeId("u")}`;
        const rawPwd = generatePassword();
        const { salt, passwordHash } = await passwordForUser(rawPwd);
        results.push({ user: normalizeUser({ username, passwordHash, salt, role: "staff", staffId: s.id, active: true }), rawPassword: rawPwd, staffName: s.fullName });
      } else if (choice.action && choice.action !== "none") {
        results.push({ existingUserId: choice.action, staffId: s.id, staffName: s.fullName });
      }
      doClose();
    }
    resolve(results);
  });
}

/* ============================================================
   WEEK / DAY QUERIES
   ============================================================ */

export function activeDayDate() { return addDays(isoDate(state.weekISO), state.activeDay); }

export function activeDayEntries() {
  const scheduleEntries = state.schedule
    .filter(e => e.weekISO === state.weekISO && e.day === state.activeDay)
    .sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

  const activeDate = localISO(activeDayDate());
  const meetingRoom = state.rooms.find(r => (r.tags || []).some(t => t.includes("ישיבות"))) || state.rooms[0];

  const meetingEntries = (state.meetings || [])
    .filter(m => m.date === activeDate)
    .map(m => ({
      id: m.id,
      weekISO: state.weekISO,
      day: state.activeDay,
      roomId: meetingRoom?.id || (state.rooms[0]?.id || ""),
      start: m.time || "12:30",
      duration: m.duration || 60,
      staff: m.speaker || "",
      team: "אדמיניסטרציה",
      note: m.title || "",
      oneTime: false,
      source: "meeting",
      _isMeeting: true,
      _meetingData: m
    }));

  const all = [...scheduleEntries, ...meetingEntries];
  all.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
  return all;
}

export function getDayEntryCount(dayIdx) {
  const dateObj = addDays(isoDate(state.weekISO), dayIdx);
  const dateStr = localISO(dateObj);
  const visibleRoomIds = new Set(filteredRooms().map(r => r.id));
  const scheduleCount = state.schedule.filter(e =>
    e.weekISO === state.weekISO && e.day === dayIdx && visibleRoomIds.has(e.roomId)
  ).length;
  const meetingRoom = state.rooms.find(r => (r.tags || []).some(t => t.includes("ישיבות"))) || state.rooms[0];
  const meetingRoomId = meetingRoom?.id || (state.rooms[0]?.id || "");
  const meetingCount = visibleRoomIds.has(meetingRoomId)
    ? (state.meetings || []).filter(m => m.date === dateStr).length
    : 0;
  return scheduleCount + meetingCount;
}

export function filteredRooms() {
  if (!state.selectedTags.size) return state.rooms;
  return state.rooms.filter(r => [...state.selectedTags].every(t => r.tags.includes(t)));
}

export function weekRange() {
  const s = isoDate(state.weekISO);
  return `${fmtDate(s)} – ${fmtDate(addDays(s, 4))}`;
}

/* ============================================================
   SELECTORS
   ============================================================ */

export const getRoomById = id => state.rooms.find(r => r.id === id);
export const getRoomName = id => getRoomById(id)?.name || id;
export const getEntryById = id => {
  const scheduleEntry = state.schedule.find(e => e.id === id);
  if (scheduleEntry) return scheduleEntry;
  const meeting = (state.meetings || []).find(m => m.id === id);
  if (!meeting) return null;
  const meetingRoom = state.rooms.find(r => (r.tags || []).some(t => t.includes("ישיבות"))) || state.rooms[0];
  return {
    id: meeting.id,
    weekISO: state.weekISO,
    day: state.activeDay,
    roomId: meetingRoom?.id || (state.rooms[0]?.id || ""),
    start: meeting.time || "12:30",
    duration: meeting.duration || 60,
    staff: meeting.speaker || "",
    team: "אדמיניסטרציה",
    note: meeting.title || "",
    oneTime: false,
    source: "meeting",
    _isMeeting: true,
    _meetingData: meeting
  };
};

/* ============================================================
   BUILD DEFAULT
   ============================================================ */

export function buildDefaultSchedule(weekISO, rooms) {
  const samples = [
    { day: 0, roomId: rooms[0]?.id, start: "08:30", duration: 60,  staff: "נועה כהן",   team: "ילדים",         note: "קבלת בוקר"   },
    { day: 0, roomId: rooms[2]?.id, start: "10:00", duration: 90,  staff: 'ד"ר לוי',     team: "מבוגרים",       note: "אבחון"        },
    { day: 0, roomId: rooms[1]?.id, start: "13:00", duration: 60,  staff: "מאיה לוי",   team: "מבוגרים",       note: ""             },
    { day: 1, roomId: rooms[4]?.id, start: "09:00", duration: 60,  staff: "שרון מזרחי", team: "נוער",          note: ""             },
    { day: 1, roomId: rooms[1]?.id, start: "11:00", duration: 120, staff: "יואב בר",    team: "טיפול קבוצתי",  note: "קבוצה שבועית" },
    { day: 2, roomId: rooms[3]?.id, start: "08:00", duration: 120, staff: "עדי רוזן",   team: "ילדים",         note: "קבוצת ילדים"  },
    { day: 2, roomId: rooms[6]?.id, start: "14:00", duration: 60,  staff: "מנהל מערכת", team: "אדמיניסטרציה",  note: "ישיבת צוות"   },
    { day: 3, roomId: rooms[5]?.id, start: "10:30", duration: 90,  staff: "רן כהן",     team: "זוגות",         note: ""             },
    { day: 4, roomId: rooms[0]?.id, start: "09:00", duration: 60,  staff: 'ד"ר לוי',    team: "מבוגרים",       note: "הדרכה"        },
    { day: 4, roomId: rooms[8]?.id, start: "15:00", duration: 60,  staff: "נועה כהן",   team: "ילדים",         note: ""             }
  ].filter(s => s.roomId);
  return samples.map(s => normalizeEntry(s, weekISO, rooms));
}

/* ============================================================
   IMPORT / EXPORT
   ============================================================ */

export function importScheduleFromFile(file, scope = "current-upcoming") {
  if (!file) return Promise.reject(new Error("לא נבחר קובץ."));
  if (!ensureUploadAllowed(file, "קובץ לו\"ז")) return Promise.reject(new Error("סוג קובץ לא מורשה."));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "").trim();
        let records;
        if (file.name.toLowerCase().endsWith(".json")) {
          records = JSON.parse(text);
        } else {
          records = parseCsvRows(text);
        }
        const rows = Array.isArray(records) ? records : [];
        const validRows = rows.filter(isValidScheduleTemplateRecord);
        const template = templateFromEntries(validRows, state.rooms);
        if (!template.length) throw new Error("הקובץ לא מכיל רשומות תקינות");
        const approved = confirmImportPreview("לו\"ז", rows.length, template.length, `טווח החלפה: ${scope}`);
        if (!approved) {
          resolve({ imported: false, message: "ייבוא לו\"ז בוטל אחרי תצוגה מקדימה." });
          return;
        }
        state.defaultTemplate = template;
        applyTemplateScope(template, scope);
        recordAudit("schedule.import", `נטענו ${template.length} רשומות (${scope}).`, "warn", false);
        persistState();
        resolve({ imported: true, count: template.length, total: rows.length });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("שגיאה בקריאת הקובץ."));
    reader.readAsText(file);
  });
}

export function exportBookingsCSV() {
  const headers = ["weekISO", "day", "roomId", "roomName", "start", "duration", "staff", "team", "note", "oneTime"];
  const rows = state.schedule.map(e => ({
    weekISO:  e.weekISO,
    day:      e.day,
    roomId:   e.roomId,
    roomName: getRoomName(e.roomId),
    start:    e.start,
    duration: e.duration,
    staff:    e.staff,
    team:     e.team,
    note:     e.note || "",
    oneTime:  e.oneTime ? "TRUE" : "FALSE"
  }));
  triggerCsvDownload("bookings_current.csv", buildCsv(headers, rows));
}

export function exportStaffCSV() {
  const headers = ["id", "fullName", "phone", "email", "role", "team"];
  triggerCsvDownload("staff_current.csv", buildCsv(headers, state.staff));
}

export function exportRoomsCSV() {
  const headers = ["id", "name", "tags"];
  const rows = state.rooms.map(r => ({
    id:   r.id,
    name: r.name,
    tags: Array.isArray(r.tags) ? r.tags.join(", ") : (r.tags || "")
  }));
  triggerCsvDownload("rooms_current.csv", buildCsv(headers, rows));
}

/* ----------------------------------------------------------
   RECURRING APPOINTMENTS
   ---------------------------------------------------------- */
export function expandRecurringEntries(weeksAhead = 8) {
  const parents = state.schedule.filter(e => e.recurringRule && !e.parentRecurringId);
  parents.forEach(parent => {
    const baseDate = isoDate(parent.weekISO);
    const baseDay = parent.day;
    const endDate = parent.recurringEndDate ? isoDate(parent.recurringEndDate) : null;
    let currentDate = addDays(baseDate, 0);
    let generated = 0;
    let cycles = 0;
    while (generated < weeksAhead && cycles < 52) {
      cycles++;
      if (parent.recurringRule === "weekly") {
        currentDate = addDays(currentDate, 7);
      } else if (parent.recurringRule === "biweekly") {
        currentDate = addDays(currentDate, 14);
      } else if (parent.recurringRule === "monthly") {
        currentDate = new Date(currentDate);
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      if (endDate && currentDate > endDate) break;
      const iso = localISO(currentDate);
      const exists = state.schedule.some(e =>
        e.parentRecurringId === parent.id && e.weekISO === iso && e.day === baseDay
      );
      if (!exists && currentDate.getDay() === baseDay) {
        state.schedule.push({
          ...parent,
          id: makeId("entry"),
          weekISO: iso,
          day: baseDay,
          oneTime: false,
          parentRecurringId: parent.id,
          recurringRule: null,
          recurringEndDate: "",
          source: "recurring",
          sessionStatus: "scheduled"
        });
        generated++;
      }
    }
  });
}

export function deleteRecurringSeries(parentId) {
  state.schedule = state.schedule.filter(e => e.parentRecurringId !== parentId && e.id !== parentId);
}

export function updateRecurringInstance(instanceId, updates) {
  const entry = state.schedule.find(e => e.id === instanceId);
  if (!entry) return null;
  Object.assign(entry, updates, { parentRecurringId: "", recurringRule: null, recurringEndDate: "" });
  return entry;
}

/* ----------------------------------------------------------
   WAITING LIST
   ---------------------------------------------------------- */
export function addToWaitlist(day, roomId, start, clientName, clientPhone) {
  state.waitlist = state.waitlist || [];
  state.waitlist.push({
    id: makeId("wl"),
    day, roomId, start, clientName, clientPhone,
    createdAt: new Date().toLocaleString("he-IL")
  });
}

export function removeFromWaitlist(id) {
  state.waitlist = state.waitlist || [];
  state.waitlist = state.waitlist.filter(w => w.id !== id);
}

export function getWaitlistForSlot(day, roomId, start) {
  const list = state.waitlist || [];
  return list.filter(w => w.day === day && w.roomId === roomId && w.start === start);
}

export function cleanExpiredWaitlist() {
  state.waitlist = state.waitlist || [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  state.waitlist = state.waitlist.filter(w => {
    const created = parseHebrewDate(w.createdAt);
    return created > cutoff;
  });
}

/* ----------------------------------------------------------
   STATISTICS
   ---------------------------------------------------------- */
export function getWorkHours(day) {
  const cfg = state.settings?.workHours?.[day];
  return cfg || { start: "08:00", end: "20:00" };
}

export function getWeeklyOccupancy(weekISO) {
  const entries = state.schedule.filter(e => e.weekISO === weekISO);
  let totalSlots = 0, filledSlots = 0;
  state.rooms.forEach(room => {
    for (let d = 0; d <= 4; d++) {
      const wh = getWorkHours(d);
      const slots = (timeToMin(wh.end) - timeToMin(wh.start)) / (state.settings?.slotDuration || 30);
      totalSlots += slots;
    }
  });
  filledSlots = entries.length;
  return totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
}

export function getTherapistStats(weekISO) {
  const entries = state.schedule.filter(e => e.weekISO === weekISO);
  const map = {};
  entries.forEach(e => {
    const key = e.staff || "ללא";
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).sort((a,b) => b[1] - a[1]).slice(0, 5);
}

export function getNoShowRate(weekISO) {
  const entries = state.schedule.filter(e => e.weekISO === weekISO && e.sessionStatus);
  const total = entries.length;
  const noshows = entries.filter(e => e.sessionStatus === "no-show").length;
  return total > 0 ? Math.round((noshows / total) * 100) : 0;
}

export function getResolutionTimeAvg() {
  const resolved = (state.issues || []).filter(i => i.status === "resolved" || i.status === "closed");
  if (!resolved.length) return 0;
  const total = resolved.reduce((sum, i) => {
    const created = parseHebrewDate(i.createdAt);
    const updated = parseHebrewDate(i.updatedAt);
    return sum + Math.max(0, updated - created);
  }, 0);
  return Math.round(total / resolved.length / 86400000);
}

export function getSettings() {
  return state.settings || {};
}

export function resolveUnknownStaff(unknownNames) {
  return new Promise((resolve) => {
    const names = [...new Set(unknownNames.map(n => String(n).trim()).filter(Boolean))];
    if (!names.length) { resolve({}); return; }
    
    const existingNames = new Set((state.staff || []).map(s => s.fullName));
    const trulyUnknown = names.filter(n => !existingNames.has(n));
    if (!trulyUnknown.length) { resolve({}); return; }

    const dialog = document.createElement("dialog");
    dialog.style.cssText = "padding:20px;border-radius:12px;border:1px solid var(--line);max-width:520px;width:90vw;background:var(--surface-2);box-shadow:0 16px 48px rgba(0,0,0,0.2)";
    let html = '<h3 style="margin:0 0 8px">אנשי צוות לא מוכרים</h3><p class="muted small" style="margin:0 0 12px">השמות הבאים לא נמצאו ברשימת הצוות. בחר פעולה לכל אחד:</p>';
    
    const staffOptions = (state.staff || []).map(s => `<option value="${s.id}">${s.fullName}</option>`).join("");
    
    trulyUnknown.forEach((name, i) => {
      html += `
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <strong style="min-width:80px">${name}</strong>
          <select data-unknown-staff="${i}" data-name="${name}" style="width:auto;flex:1;min-width:140px">
            <option value="create">הוסף לצוות</option>
            <option value="text">השאר כטקסט חופשי</option>
            ${state.staff.length ? `<optgroup label="שייך לאיש צוות קיים">${staffOptions}</optgroup>` : ''}
          </select>
        </div>`;
    });

    html += `
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button id="unknownStaffCancel" class="btn-sm secondary">בטל</button>
        <button id="unknownStaffConfirm" class="btn-sm">אישור</button>
      </div>`;
    
    dialog.innerHTML = html;
    document.body.appendChild(dialog);
    dialog.showModal();

    dialog.querySelector("#unknownStaffConfirm").onclick = () => {
      const result = {};
      dialog.querySelectorAll("[data-unknown-staff]").forEach(sel => {
        const name = sel.dataset.name;
        const val = sel.value;
        if (val === "create") {
          const id = makeId("staff");
          const newStaff = { id, fullName: name, team: "מבוגרים", role: "", phone: "", email: "" };
          state.staff.push(newStaff);
          persistState();
          recordAudit("staff.create.auto", `נוסף "${name}" במהלך ייבוא.`, "info");
          result[name] = name;
        } else if (val === "text") {
          result[name] = name;
        } else {
          const s = (state.staff || []).find(st => st.id === val);
          result[name] = s ? s.fullName : name;
        }
      });
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector("#unknownStaffCancel").onclick = () => {
      dialog.close();
      dialog.remove();
      resolve(null);
    };
  });
}
