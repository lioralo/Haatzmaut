/* ============================================================
   MEETINGS STATE — data normalization, CRUD, import/export
   ============================================================ */

import { state, persistState, recordAudit } from '../core/store.js';
import { DAY_DEFS, TEAMS } from '../core/constants.js';
import {
  makeId, localISO, showToast,
  parseCsvRows, ensureUploadAllowed, confirmImportPreview,
  triggerCsvDownload, buildCsv
} from '../core/utils.js';

/* ============================================================
   DEFAULT GROUPS
   ============================================================ */

const DEFAULT_GROUPS = [
  { id: "g1", name: "צוות מבוגרים", color: "#0072BC", weeklyDay: 0, defaultTime: "12:30" },
  { id: "g2", name: "צוות ילדים",   color: "#F47B20", weeklyDay: 0, defaultTime: "12:30" }
];

export function ensureDefaultGroups() {
  if (!state.meetingGroups.length) {
    state.meetingGroups = DEFAULT_GROUPS.map(g => ({ ...g }));
  }
  ensureDefaultSundayMeetings();
}

export function ensureDefaultSundayMeetings() {
  const now = new Date();
  const thisYear = now.getFullYear();
  const augStart = new Date(thisYear, 7, 1); // August 1
  const augEnd = new Date(thisYear, 8, 0);   // August 31

  const augustSundays = [];
  const d = new Date(augStart);
  while (d.getDay() !== 0) { d.setDate(d.getDate() + 1); }
  while (d <= augEnd) {
    augustSundays.push(localISO(d));
    d.setDate(d.getDate() + 7);
  }

  const teams = ["מבוגרים", "ילדים"];

  const isFreshInstall = state.meetings.length === 0;
  if (!isFreshInstall) return;

  let created = 0;
  augustSundays.forEach(sundayISO => {
    teams.forEach(team => {
      const exists = state.meetings.find(m =>
        m.date === sundayISO && m.time === "12:30" &&
        (m.title || "").includes(team)
      );
      if (!exists) {
        state.meetings.push(normalizeMeeting({
          speaker: "",
          title: `ישיבת ${team}`,
          groupIds: [],
          date: sundayISO,
          time: "12:30",
          duration: 90,
          recurringRule: null,
          agenda: `ישיבת צוות ${team} — אוגוסט`
        }));
        created++;
      }
    });
  });

  if (created) {
    persistState();
    recordAudit("meeting.defaults", `נוצרו ${created} ישיבות אוגוסט.`, "info", false);
  }
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

export function normalizeMeeting(m) {
  return {
    id:            m.id || makeId("meet"),
    title:         String(m.title || "").trim() || String(m.speaker || "").trim() || "ישיבה ללא שם",
    speaker:       String(m.speaker || m.presenter || "").trim(),
    groupIds:      Array.isArray(m.groupIds)
      ? m.groupIds.filter(id => typeof id === "string" && id)
      : String(m.groupIds || "").split(";").map(v => v.trim()).filter(Boolean),
    date:          String(m.date || localISO(new Date())).trim(),
    time:          String(m.time || "09:00").trim(),
    duration:      Math.max(30, Number(m.duration || 60)),
    agenda:        String(m.agenda || m.specification || "").trim(),
    link:          String(m.link || m.url || "").trim(),
    files:         Array.isArray(m.files) ? m.files.map(String) : String(m.files || "").split(";").map(v => v.trim()).filter(Boolean),
    recurringRule: ["weekly", "biweekly", "monthly-first", "monthly-nth"].includes(m.recurringRule) ? m.recurringRule : null,
    staffIds:      Array.isArray(m.staffIds) ? m.staffIds : String(m.staffIds || "").split(",").map(s => s.trim()).filter(Boolean),
    createdAt:     m.createdAt || new Date().toLocaleString("he-IL")
  };
}

export function normalizeGroup(g) {
  return {
    id:          g.id || makeId("group"),
    name:        String(g.name || "").trim() || "קבוצה ללא שם",
    color:       String(g.color || "#0072BC").trim(),
    weeklyDay:   Number.isFinite(Number(g.weeklyDay)) ? Math.min(4, Math.max(0, Number(g.weeklyDay))) : 0,
    defaultTime: String(g.defaultTime || "09:00").trim()
  };
}

/* ============================================================
   GROUPS CRUD
   ============================================================ */

export function createGroup(formData) {
  const group = normalizeGroup({
    id: makeId("group"),
    name: formData.name,
    color: formData.color,
    weeklyDay: Number(formData.weeklyDay),
    defaultTime: formData.defaultTime
  });
  state.meetingGroups.push(group);
  persistState();
  recordAudit("meeting.group.create", `${group.name}`, "info", false);
  return group;
}

export function updateGroup(id, formData) {
  const idx = state.meetingGroups.findIndex(g => g.id === id);
  if (idx < 0) return null;
  const updated = normalizeGroup({ ...state.meetingGroups[idx], ...formData, id });
  state.meetingGroups[idx] = updated;
  persistState();
  recordAudit("meeting.group.update", `${updated.name}`, "info", false);
  return updated;
}

export function deleteGroup(id) {
  const idx = state.meetingGroups.findIndex(g => g.id === id);
  if (idx < 0) return false;
  const group = state.meetingGroups[idx];
  state.meetingGroups.splice(idx, 1);
  state.meetings = state.meetings.map(m => ({
    ...m,
    groupIds: (m.groupIds || []).filter(gid => gid !== id)
  }));
  persistState();
  recordAudit("meeting.group.delete", `${group.name}`, "warn", false);
  return true;
}

/* ============================================================
   MEETINGS CRUD
   ============================================================ */

export function createMeeting(formData) {
  const meeting = normalizeMeeting({
    speaker: formData.speaker,
    title: formData.title,
    groupIds: formData.groupIds,
    staffIds: formData.staffIds,
    date: formData.date,
    time: formData.time,
    duration: formData.duration,
    agenda: formData.agenda,
    link: formData.link,
    files: formData.files,
    recurringRule: formData.recurringRule
  });
  state.meetings.unshift(meeting);
  persistState();
  recordAudit("meeting.create", `${meeting.title || meeting.speaker}`, "info", false);
  return meeting;
}

export function updateMeeting(id, formData) {
  const idx = state.meetings.findIndex(m => m.id === id);
  if (idx < 0) return null;
  const updated = normalizeMeeting({ ...state.meetings[idx], ...formData, id });
  state.meetings[idx] = updated;
  persistState();
  recordAudit("meeting.update", `${updated.title || updated.speaker}`, "info", false);
  return updated;
}

export function deleteMeeting(id) {
  const idx = state.meetings.findIndex(m => m.id === id);
  if (idx < 0) return false;
  const deleted = state.meetings.splice(idx, 1)[0];
  persistState();
  recordAudit("meeting.delete", `${deleted.title || deleted.speaker}`, "warn", false);
  return true;
}

/* ============================================================
   QUERIES
   ============================================================ */

export function getMeetingsForGroup(groupId) {
  return state.meetings.filter(m => (m.groupIds || []).includes(groupId));
}

export function getUpcomingMeetings() {
  const now = new Date();
  return state.meetings
    .filter(m => new Date(`${m.date}T${m.time || "00:00"}`) >= now)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function getPastMeetings() {
  const now = new Date();
  return state.meetings
    .filter(m => new Date(`${m.date}T${m.time || "00:00"}`) < now)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

export function getJointMeetings() {
  return state.meetings.filter(m => (m.groupIds || []).length > 1);
}

export function getGroupById(id) {
  return state.meetingGroups.find(g => g.id === id);
}

export function getGroupName(id) {
  return getGroupById(id)?.name || id;
}

export function getGroupColor(id) {
  return getGroupById(id)?.color || "#999";
}

export function dayLabel(key) {
  return DAY_DEFS.find(d => d.key === Number(key))?.label || "";
}

export function recurringRuleLabel(rule) {
  const map = {
    "weekly": "שבועית",
    "biweekly": "דו-שבועית",
    "monthly-first": 'חודשית (ראשונה)',
    "monthly-nth": "חודשית"
  };
  return map[rule] || "";
}

/* ============================================================
   CSV IMPORT / EXPORT
   ============================================================ */

export function isValidMeetingRecord(rec) {
  if (!rec || typeof rec !== "object") return false;
  const date = String(rec.date || "").trim();
  const time = String(rec.time || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
}

export function exportMeetingsCSV() {
  const headers = ["title", "speaker", "groupIds", "date", "time", "duration", "agenda", "link", "files", "recurringRule"];
  const rows = state.meetings.map(m => ({
    title:         m.title || "",
    speaker:       m.speaker || "",
    groupIds:      Array.isArray(m.groupIds) ? m.groupIds.join(";") : (m.groupIds || ""),
    date:          m.date,
    time:          m.time,
    duration:      String(m.duration || 60),
    agenda:        m.agenda || "",
    link:          m.link || "",
    files:         Array.isArray(m.files) ? m.files.join(";") : (m.files || ""),
    recurringRule: m.recurringRule || ""
  }));
  triggerCsvDownload("meetings_current.csv", buildCsv(headers, rows));
}

export function importMeetingsFromFile(file) {
  if (!ensureUploadAllowed(file, "קובץ ישיבות")) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "").trim();
      const records = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseCsvRows(text);
      const rows = Array.isArray(records) ? records : [];
      const validRows = rows.filter(isValidMeetingRecord);
      const meetings = validRows.map(normalizeMeeting);
      if (!meetings.length) throw new Error("לא נמצאו רשומות ישיבות תקינות בקובץ");
      const approved = confirmImportPreview("ישיבות", rows.length, meetings.length);
      if (!approved) {
        showToast("ייבוא ישיבות בוטל אחרי תצוגה מקדימה.", "info");
        return;
      }
      state.meetings.unshift(...meetings);
      recordAudit("meeting.import", `יובאו ${meetings.length} ישיבות.`, "warn", false);
      persistState();
      showToast(`יובאו ${meetings.length} ישיבות מתוך ${rows.length} רשומות.`, "info");
    } catch (err) {
      showToast(`שגיאה בייבוא ישיבות: ${err.message}`, "error");
    }
  };
  reader.readAsText(file);
}

/* ----------------------------------------------------------
   RECURRENCE EXPANSION
   ---------------------------------------------------------- */
export function expandRecurringMeetings(weeksAhead = 12) {
  const now = new Date();
  const parents = state.meetings.filter(m => m.recurringRule);
  parents.forEach(parent => {
    const baseDate = new Date(parent.date);
    let currentDate = new Date(baseDate);
    let generated = 0;
    while (generated < weeksAhead && currentDate.getFullYear() - baseDate.getFullYear() < 1) {
      if (parent.recurringRule === "weekly") {
        currentDate = new Date(currentDate.getTime() + 7 * 86400000);
      } else if (parent.recurringRule === "biweekly") {
        currentDate = new Date(currentDate.getTime() + 14 * 86400000);
      } else if (parent.recurringRule === "monthly-first") {
        currentDate = new Date(currentDate);
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(1);
        while (currentDate.getDay() !== parent.date ? new Date(parent.date).getDay() : 0) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        break;
      }
      if (currentDate <= now) continue;
      const iso = localISO(currentDate);
      const exists = state.meetings.some(m =>
        m.recurringRule === "__instance__" && m.date === iso && m.time === parent.time && m.speaker === parent.speaker
      );
      if (!exists) {
        state.meetings.push({
          ...parent,
          id: makeId("meet"),
          date: iso,
          recurringRule: "__instance__",
          createdAt: new Date().toLocaleString("he-IL")
        });
        generated++;
      }
    }
  });
}

export function cleanupOldMeetingInstances() {
  const yesterday = localISO(new Date(Date.now() - 86400000));
  state.meetings = state.meetings.filter(m =>
    m.recurringRule !== "__instance__" || m.date >= yesterday
  );
}

export function autoMaintainMeetingWindow() {
  cleanupOldMeetingInstances();
  expandRecurringMeetings(12);
}

export function getStaffNamesByIds(ids) {
  return (ids || []).map(id => {
    const s = state.staff.find(st => st.id === id);
    return s ? s.fullName : id;
  }).filter(Boolean);
}
