const STORAGE_KEY = "haatzmaut_v5";
const WORK_START = 8 * 60;
const WORK_END = 20 * 60;
const SLOT_MIN = 30;
const ROOMS_PER_PAGE = 10;
const ROTATE_MS = 30000;

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

let roomPageIndex = 0;
let nextRotationAt = Date.now() + ROTATE_MS;

function byId(id) {
  return document.getElementById(id);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function localISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function sundayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return localISO(d);
}

function timeToMin(t) {
  const [h, m] = String(t || "00:00").split(":").map(Number);
  return (h * 60) + (m || 0);
}

function minToTime(m) {
  const n = ((m % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(n / 60))}:${pad2(n % 60)}`;
}

function floorToSlot(min) {
  return Math.floor(min / SLOT_MIN) * SLOT_MIN;
}

function ceilToSlot(min) {
  return Math.ceil(min / SLOT_MIN) * SLOT_MIN;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
  } catch {
    return {};
  }
}

function defaultRooms() {
  return Array.from({ length: 12 }, (_, i) => ({ id: `r${i + 1}`, name: `חדר ${i + 1}` }));
}

function getRooms(state) {
  if (Array.isArray(state.rooms) && state.rooms.length) {
    return state.rooms.map(r => ({ id: String(r.id), name: String(r.name || r.id || "חדר") }));
  }
  return defaultRooms();
}

function getTodaysEntries(state) {
  const now = new Date();
  const weekISO = sundayISO(now);
  const day = now.getDay();
  const schedule = Array.isArray(state.schedule) ? state.schedule : [];

  return schedule
    .filter(e => String(e.weekISO) === weekISO && Number(e.day) === day)
    .map(e => ({
      roomId: String(e.roomId || ""),
      start: String(e.start || "08:00"),
      duration: Math.max(30, Number(e.duration || 60)),
      staff: String(e.staff || ""),
      team: String(e.team || ""),
      note: String(e.note || "")
    }));
}

function getWindowSlots(now) {
  const nowMin = (now.getHours() * 60) + now.getMinutes();
  const start = floorToSlot(nowMin - 60);
  const end = ceilToSlot(nowMin + 180);
  const slots = [];

  for (let m = start; m <= end; m += SLOT_MIN) {
    slots.push(m);
  }
  return slots;
}

function isEntryInSlot(entry, slotStartMin) {
  const entryStart = timeToMin(entry.start);
  const entryEnd = entryStart + entry.duration;
  const slotEnd = slotStartMin + SLOT_MIN;
  return entryStart < slotEnd && entryEnd > slotStartMin;
}

function formatDateTime(now) {
  const dayLabel = DAY_NAMES[now.getDay()] || "";
  const dateLabel = new Intl.DateTimeFormat("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(now);

  return { dayLabel, dateLabel, timeLabel };
}

function renderClock() {
  const now = new Date();
  const { dayLabel, dateLabel, timeLabel } = formatDateTime(now);
  byId("nowTime").textContent = timeLabel;
  byId("nowDate").textContent = `${dayLabel}, ${dateLabel}`;
}

function renderNotifications(state) {
  const box = byId("notificationsList");
  const notifications = Array.isArray(state.notifications) ? state.notifications : [];

  if (!notifications.length) {
    box.innerHTML = '<div class="notice-item">אין הודעות להצגה כרגע.</div>';
    return;
  }

  const top = notifications.slice(0, 4);
  box.innerHTML = top.map(n => {
    const text = esc(n.text || "");
    const at = esc(n.at || "");
    const cls = n.critical ? "notice-item critical" : "notice-item";
    return `<div class="${cls}">${text}<br><small>${at}</small></div>`;
  }).join("");
}

function renderTable() {
  const state = loadState();
  const rooms = getRooms(state);
  const entries = getTodaysEntries(state);
  const now = new Date();
  const day = now.getDay();
  const slots = getWindowSlots(now);

  const totalPages = Math.max(1, Math.ceil(rooms.length / ROOMS_PER_PAGE));
  roomPageIndex = roomPageIndex % totalPages;

  const startIdx = roomPageIndex * ROOMS_PER_PAGE;
  const visibleRooms = rooms.slice(startIdx, startIdx + ROOMS_PER_PAGE);

  byId("roomsRange").textContent = `חדרים ${startIdx + 1}-${Math.min(startIdx + visibleRooms.length, rooms.length)} מתוך ${rooms.length}`;

  const headCells = visibleRooms.map(room => `<th>${esc(room.name)}</th>`).join("");
  let bodyRows = "";

  for (const slot of slots) {
    const isLive = (now.getHours() * 60) + now.getMinutes() >= slot && (now.getHours() * 60) + now.getMinutes() < slot + SLOT_MIN;
    const rowClass = isLive ? "live-row" : "";

    const roomCells = visibleRooms.map(room => {
      const matches = entries
        .filter(e => e.roomId === room.id && isEntryInSlot(e, slot))
        .sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

      if (!matches.length) {
        return '<td class="slot-empty">פנוי</td>';
      }

      const content = matches.map(m => {
        const end = minToTime(timeToMin(m.start) + m.duration);
        const note = m.note ? `<span class="meta">${esc(m.note)}</span>` : "";
        return `${esc(m.staff || "צוות")}${m.team ? ` · ${esc(m.team)}` : ""}<span class="meta">${esc(m.start)}-${end}</span>${note}`;
      }).join("<hr>");

      return `<td><div class="slot-booked">${content}</div></td>`;
    }).join("");

    bodyRows += `<tr class="${rowClass}"><th class="time-col">${minToTime(slot)}</th>${roomCells}</tr>`;
  }

  const weekendMsg = day > 4
    ? `<caption>היום אינו יום פעילות רגיל במערכת (שישי/שבת). מוצגת תצוגה חיה לפי זמן נוכחי.</caption>`
    : "";

  byId("displayTable").innerHTML = `${weekendMsg}<thead><tr><th class="time-col">שעה</th>${headCells}</tr></thead><tbody>${bodyRows}</tbody>`;
  renderNotifications(state);
}

function renderRotationCountdown() {
  const leftMs = Math.max(0, nextRotationAt - Date.now());
  const leftSec = Math.ceil(leftMs / 1000);
  const el = byId("rotateCountdown");
  if (!el) return;
  el.textContent = `החלפה בעוד ${leftSec} שניות`;
}

function nextPage() {
  roomPageIndex += 1;
  nextRotationAt = Date.now() + ROTATE_MS;
  renderTable();
  renderRotationCountdown();
}

function initialize() {
  renderClock();
  renderTable();
  renderRotationCountdown();

  setInterval(renderClock, 1000);
  setInterval(renderTable, 15000);
  setInterval(renderRotationCountdown, 1000);
  setInterval(nextPage, ROTATE_MS);
}

initialize();
