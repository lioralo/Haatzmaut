/* ============================================================
   CONSTANTS
   ============================================================ */

const STORAGE_KEY = "haatzmaut_v4";

const DAY_DEFS = [
  { key: 0, label: "ראשון",  short: "א׳" },
  { key: 1, label: "שני",    short: "ב׳" },
  { key: 2, label: "שלישי", short: "ג׳" },
  { key: 3, label: "רביעי", short: "ד׳" },
  { key: 4, label: "חמישי", short: "ה׳" }
];

const WORK_START = 8 * 60;
const WORK_END   = 20 * 60;
const SLOT_MIN   = 30;
const SLOT_COUNT = (WORK_END - WORK_START) / SLOT_MIN;  // 24

const TEAMS = ["מבוגרים", "ילדים", "נוער", "זוגות", "אדמיניסטרציה"];

const DEFAULT_ROOMS = [
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

const DEFAULT_STAFF = [
  { id: "s1", fullName: "מנהל מערכת",  phone: "0500000000", email: "admin@clinic.org",  role: "מנהל",              team: "אדמיניסטרציה" },
  { id: "s2", fullName: 'ד"ר לוי',      phone: "0500000001", email: "levy@clinic.org",   role: "פסיכולוג",           team: "מבוגרים"      },
  { id: "s3", fullName: "נועה כהן",     phone: "0500000002", email: "noa@clinic.org",    role: "מטפלת",              team: "ילדים"         },
  { id: "s4", fullName: "יואב בר",      phone: "0500000003", email: "yoav@clinic.org",   role: "פסיכולוג",           team: "מבוגרים"      },
  { id: "s5", fullName: "מאיה לוי",     phone: "0500000004", email: "maya@clinic.org",   role: "מטפלת",              team: "מבוגרים"      },
  { id: "s6", fullName: "עדי רוזן",     phone: "0500000005", email: "adi@clinic.org",    role: "עובדת סוציאלית",     team: "ילדים"         },
  { id: "s7", fullName: "שרון מזרחי",   phone: "0500000006", email: "sharon@clinic.org", role: "פסיכולוגית",         team: "נוער"          },
  { id: "s8", fullName: "רן כהן",       phone: "0500000007", email: "ran@clinic.org",    role: "מטפל זוגות",         team: "זוגות"         }
];

const DEFAULT_CREDENTIALS = {
  admin: { password: "admin123", role: "admin", label: "מנהל מערכת" },
  staff: { password: "staff123", role: "staff", label: "צוות"        }
};

/* ============================================================
   UTILITIES
   ============================================================ */

const byId = id => document.getElementById(id);

function pad2(n) { return String(n).padStart(2, "0"); }

// Timezone-safe ISO date string from a local Date (avoids UTC offset issues for UTC+ timezones)
function localISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function minToTime(m) {
  const n = ((m % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(n / 60))}:${pad2(n % 60)}`;
}

function timeToMin(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
}

function slotOf(t)        { return Math.floor((timeToMin(t) - WORK_START) / SLOT_MIN); }
function slotStart(i)     { return WORK_START + i * SLOT_MIN; }
function slotsFor(dur)    { return Math.max(1, Math.ceil(dur / SLOT_MIN)); }

function makeId(prefix = "id") {
  if (window.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sundayISO(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return localISO(d);
}

function isoDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

function shiftWeek(isoStr, weeks) {
  const d = isoDate(isoStr);
  d.setDate(d.getDate() + weeks * 7);
  return localISO(d);
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
function fmtShort(date) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" }).format(date);
}

function todayDayIdx() { const d = new Date().getDay(); return d <= 4 ? d : 0; }

function clampDay(day) {
  const n = Number(day);
  return Number.isFinite(n) ? Math.min(4, Math.max(0, n)) : 0;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeRoom(r) {
  return {
    id:   r.id   || makeId("room"),
    name: String(r.name || "").trim() || "חדר ללא שם",
    tags: Array.isArray(r.tags)
      ? r.tags.map(t => String(t).trim()).filter(Boolean)
      : String(r.tags || "").split(",").map(t => t.trim()).filter(Boolean)
  };
}

function normalizeStaff(s) {
  return {
    id:       s.id       || makeId("staff"),
    fullName: String(s.fullName || "").trim(),
    phone:    String(s.phone    || "").trim(),
    email:    String(s.email    || "").trim(),
    role:     String(s.role     || "").trim(),
    team:     String(s.team     || TEAMS[0])
  };
}

function normalizeEntry(e, weekISO, roomsList) {
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
    team:     String(e.team   || TEAMS[0]),
    oneTime:  Boolean(e.oneTime),
    note:     String(e.note   || e.notes || "").trim(),
    source:   String(e.source || "manual")
  };
}

/* ============================================================
   STATE
   ============================================================ */

function loadStoredState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
}

function buildDefaultSchedule(weekISO, rooms) {
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

function hydrateState() {
  const src   = loadStoredState() || {};
  const rooms = Array.isArray(src.rooms) && src.rooms.length
    ? src.rooms.map(normalizeRoom)
    : DEFAULT_ROOMS.map(r => ({ ...r }));
  const staff = Array.isArray(src.staff) && src.staff.length
    ? src.staff.map(normalizeStaff)
    : DEFAULT_STAFF.map(s => ({ ...s }));
  const weekISO = src.weekISO || sundayISO();
  const schedule = Array.isArray(src.schedule) && src.schedule.length
    ? src.schedule.map(e => normalizeEntry(e, weekISO, rooms))
    : buildDefaultSchedule(weekISO, rooms);

  return {
    currentUser:   null,
    credentials:   DEFAULT_CREDENTIALS,
    rooms,
    staff,
    schedule,
    requests:      src.requests      || [],
    meetings:      src.meetings      || [],
    resources:     src.resources     || [],
    issues:        src.issues        || [],
    notifications: src.notifications || [],
    selectedTags:  new Set(Array.isArray(src.selectedTags) ? src.selectedTags : []),
    weekISO,
    activeDay:     clampDay(src.activeDay ?? todayDayIdx()),
    activeTab:     src.activeTab || "dashboardTab",
    drag:          null
  };
}

const state = hydrateState();

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      rooms:         state.rooms,
      staff:         state.staff,
      schedule:      state.schedule,
      requests:      state.requests,
      meetings:      state.meetings,
      resources:     state.resources,
      issues:        state.issues,
      notifications: state.notifications,
      selectedTags:  [...state.selectedTags],
      weekISO:       state.weekISO,
      activeDay:     state.activeDay,
      activeTab:     state.activeTab
    }));
  } catch {}
}

/* ============================================================
   SELECTORS
   ============================================================ */

const isAdmin     = () => state.currentUser?.role === "admin";
const getRoomById = id  => state.rooms.find(r => r.id === id);
const getRoomName = id  => getRoomById(id)?.name || id;
const getEntryById = id => state.schedule.find(e => e.id === id);
const weekStart   = ()  => isoDate(state.weekISO);

function weekRange() {
  const s = weekStart();
  return `${fmtDate(s)} – ${fmtDate(addDays(s, 4))}`;
}

function activeDayDate() { return addDays(weekStart(), state.activeDay); }

function dayLabel(key) { return DAY_DEFS.find(d => d.key === Number(key))?.label || ""; }

function activeDayEntries() {
  return state.schedule
    .filter(e => e.weekISO === state.weekISO && e.day === state.activeDay)
    .sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
}

function filteredRooms() {
  if (!state.selectedTags.size) return state.rooms;
  return state.rooms.filter(r => [...state.selectedTags].every(t => r.tags.includes(t)));
}

/* ============================================================
   GRID BUILDER  (for the single-day table)
   ============================================================ */

function buildDayGrid(rooms) {
  // returns: rooms × SLOT_COUNT 2D structure
  const entries = activeDayEntries();
  return rooms.map(room => {
    const arr = Array(SLOT_COUNT).fill(null);
    entries.filter(e => e.roomId === room.id).forEach(entry => {
      const si   = slotOf(entry.start);
      const span = slotsFor(entry.duration);
      for (let i = 0; i < span && si + i < SLOT_COUNT; i++) {
        arr[si + i] = { entry, isStart: i === 0, span, si };
      }
    });
    return { room, arr };
  });
}

/* ============================================================
   OCCUPANCY TABLE
   ============================================================ */

function renderOccupancy() {
  const table = byId("occupancyTable");
  if (!table) return;
  const rooms = filteredRooms();
  if (!rooms.length) {
    table.innerHTML = `<tbody><tr><td class="empty-state" colspan="2">אין חדרים המתאימים לסינון.</td></tr></tbody>`;
    return;
  }

  const grid  = buildDayGrid(rooms);
  const admin = isAdmin();

  /* ---- HEADER ---- */
  const thRooms = rooms.map(r =>
    `<th class="room-col-head" data-room-id="${r.id}">
       <span class="rcol-name">${esc(r.name)}</span>
       <small class="rcol-tags">${r.tags.map(t => esc(t)).join(" · ")}</small>
     </th>`
  ).join("");
  const thead = `<thead><tr><th class="time-col-head">שעה</th>${thRooms}</tr></thead>`;

  /* ---- BODY ---- */
  const skipSet = new Set(); // "roomId:slotIndex" cells consumed by a rowspan

  const rows = Array.from({ length: SLOT_COUNT }, (_, si) => {
    const slotMin  = slotStart(si);
    const timeLabel = minToTime(slotMin);
    const isHour   = slotMin % 60 === 0;

    const cells = grid.map(({ room, arr }) => {
      const key = `${room.id}:${si}`;
      if (skipSet.has(key)) return "";   // consumed by rowspan

      const cell = arr[si];

      if (!cell) {
        // Truly empty slot
        const clickAttrs = `data-room-id="${room.id}" data-slot="${si}"`;
        if (admin) {
          return `<td class="slot-empty slot-droptarget" ${clickAttrs}
                    tabindex="0" role="button"
                    aria-label="הוסף ב${esc(room.name)} ${timeLabel}">
                    <span class="slot-plus" aria-hidden="true">+</span>
                  </td>`;
        }
        return `<td class="slot-empty" ${clickAttrs}></td>`;
      }

      if (!cell.isStart) return "";  // shouldn't happen given skipSet but safety guard

      const { entry, span } = cell;
      // Mark the cells this entry spans
      for (let k = 1; k < span; k++) {
        if (si + k < SLOT_COUNT) skipSet.add(`${room.id}:${si + k}`);
      }

      const endTime = minToTime(timeToMin(entry.start) + entry.duration);
      const teamColor = teamColorClass(entry.team);

      return `<td class="slot-booked" rowspan="${span}" data-entry-id="${entry.id}">
        <div class="bcard ${teamColor}${entry.oneTime ? " bcard-onetime" : ""}"
             draggable="${admin}"
             data-entry-id="${entry.id}"
             data-room-id="${entry.roomId}"
             data-start-slot="${slotOf(entry.start)}">
          <div class="bcard-head">
            <strong class="bcard-staff">${esc(entry.staff)}</strong>
            ${entry.oneTime ? `<span class="bcard-badge">חד-פעמי</span>` : ""}
          </div>
          <div class="bcard-time">${esc(entry.start)} – ${endTime}</div>
          <div class="bcard-dur">${entry.duration} דק׳</div>
          ${admin ? `<button type="button" class="bcard-move-btn" data-entry-id="${entry.id}">העבר</button>` : ""}
          ${entry.note ? `<div class="bcard-note">${esc(entry.note)}</div>` : ""}
        </div>
      </td>`;
    }).join("");

    return `<tr class="slot-row${isHour ? " slot-full-hour" : ""}" data-slot="${si}">
      <th class="time-cell${isHour ? " time-hour" : ""}">${timeLabel}</th>
      ${cells}
    </tr>`;
  }).join("");

  table.innerHTML = `${thead}<tbody>${rows}</tbody>`;
  bindTableInteractions(table, admin);
}

function teamColorClass(team) {
  const map = {
    "ילדים":         "tc-green",
    "מבוגרים":       "tc-blue",
    "נוער":          "tc-purple",
    "זוגות":         "tc-amber",
    "אדמיניסטרציה":  "tc-gray"
  };
  return map[team] || "tc-default";
}

function bindTableInteractions(table, admin) {
  const pendingMoveEntryId = () => state.drag?.entryId || null;

  const handleMove = (roomId, slot) => {
    const entryId = pendingMoveEntryId();
    if (!entryId) return false;
    moveEntryToSlot(entryId, roomId, Number(slot));
    clearMoveMode(table);
    return true;
  };

  /* Click on empty slot */
  table.querySelectorAll(".slot-empty").forEach(td => {
    const open = () => {
      if (handleMove(td.dataset.roomId, td.dataset.slot)) return;
      openBookingModal({ roomId: td.dataset.roomId, slot: Number(td.dataset.slot) });
    };
    td.addEventListener("click", open);
    td.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });

  /* Click on booking card */
  table.querySelectorAll(".bcard").forEach(card => {
    card.addEventListener("click", () => {
      const entry = getEntryById(card.dataset.entryId);
      if (entry) openBookingModal({ entry });
    });
  });

  if (!admin) return;

  table.querySelectorAll(".bcard-move-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const entryId = btn.dataset.entryId;
      if (!entryId) return;
      state.drag = { entryId, touchFallback: true };
      table.classList.add("move-mode");
      table.querySelectorAll(".slot-droptarget").forEach(el => el.classList.add("move-target"));
      showToast("בחרו משבצת יעד להעברת ההזמנה.");
    });
  });

  /* Drag start */
  table.querySelectorAll(".bcard[draggable='true']").forEach(card => {
    card.addEventListener("dragstart", e => {
      state.drag = { entryId: card.dataset.entryId };
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.entryId);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      clearMoveMode(table);
    });
  });

  /* Drop targets */
  table.querySelectorAll(".slot-droptarget").forEach(td => {
    td.addEventListener("dragover", e => { e.preventDefault(); td.classList.add("drag-over"); });
    td.addEventListener("dragleave", ()  => td.classList.remove("drag-over"));
    td.addEventListener("drop", e => {
      e.preventDefault();
      td.classList.remove("drag-over");
      const { entryId } = state.drag || {};
      if (!entryId) return;
      moveEntryToSlot(entryId, td.dataset.roomId, Number(td.dataset.slot));
    });
  });

  table.addEventListener("keydown", e => {
    if (e.key === "Escape" && pendingMoveEntryId()) {
      clearMoveMode(table);
      showToast("העברת ההזמנה בוטלה.");
    }
  });
}

function clearMoveMode(table) {
  table.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  table.querySelectorAll(".move-target").forEach(el => el.classList.remove("move-target"));
  table.classList.remove("move-mode");
  state.drag = null;
}

function moveEntryToSlot(entryId, newRoomId, newSlot) {
  const entry = getEntryById(entryId);
  if (!entry) return;

  const newStart = minToTime(slotStart(newSlot));
  if (timeToMin(newStart) + entry.duration > WORK_END) {
    showToast("המשבצת חורגת משעות העבודה.", "error");
    return;
  }

  const conflict = state.schedule.find(ex =>
    ex.id !== entry.id &&
    ex.weekISO === state.weekISO &&
    ex.day === state.activeDay &&
    ex.roomId === newRoomId &&
    timeToMin(ex.start) < timeToMin(newStart) + entry.duration &&
    timeToMin(ex.start) + ex.duration > timeToMin(newStart)
  );
  if (conflict) {
    showToast(`התנגשות עם ${conflict.staff} – לא ניתן להעביר לכאן.`, "error");
    return;
  }

  entry.roomId = newRoomId;
  entry.start  = newStart;
  persistState();
  renderOccupancy();
  renderStats();
  addNotification(`${entry.staff} הועבר/ה ל${getRoomName(newRoomId)} בשעה ${entry.start}.`);
}

/* ============================================================
   BOOKING MODAL
   ============================================================ */

function openBookingModal({ roomId, slot, entry } = {}) {
  const modal  = byId("bookingModal");
  const isEdit = Boolean(entry?.id);
  const admin  = isAdmin();

  byId("bookingModalTitle").textContent = isEdit ? "עריכת הזמנה" : (admin ? "הוספת הזמנה" : "פרטי הזמנה");
  byId("bookingEntryId").value = entry?.id  || "";
  byId("bookingDay").value     = String(entry?.day ?? state.activeDay);

  /* Room select */
  const roomSel = byId("bookingRoomSel");
  const targetRoom = entry?.roomId || roomId || state.rooms[0]?.id || "";
  roomSel.innerHTML = state.rooms.map(r =>
    `<option value="${r.id}"${r.id === targetRoom ? " selected" : ""}>${esc(r.name)}</option>`
  ).join("");

  /* Start time select */
  const startSel = byId("bookingStart");
  const targetStart = entry?.start || minToTime(slotStart(slot ?? 0));
  startSel.innerHTML = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const t = minToTime(slotStart(i));
    return `<option value="${t}"${t === targetStart ? " selected" : ""}>${t}</option>`;
  }).join("");

  /* Team select */
  const teamSel = byId("bookingTeam");
  teamSel.innerHTML = TEAMS.map(t =>
    `<option value="${t}"${entry?.team === t ? " selected" : ""}>${t}</option>`
  ).join("");

  /* Staff datalist */
  byId("bookingStaffList").innerHTML = state.staff.map(p =>
    `<option value="${esc(p.fullName)}">`
  ).join("");

  byId("bookingStaff").value    = entry?.staff    || "";
  byId("bookingDuration").value = String(entry?.duration || 60);
  byId("bookingNote").value     = entry?.note     || "";
  byId("bookingOneTime").checked = Boolean(entry?.oneTime);

  /* Read-only for staff users */
  const fields = ["bookingStaff", "bookingDuration", "bookingStart", "bookingRoomSel", "bookingTeam", "bookingNote", "bookingOneTime"];
  fields.forEach(id => { const el = byId(id); if (el) el.disabled = !admin; });
  byId("bookingSubmit").classList.toggle("hidden", !admin);
  byId("bookingDelete").classList.toggle("hidden", !(admin && isEdit));

  modal.showModal();
}

function closeBookingModal() { byId("bookingModal").close(); }

/* ============================================================
   DAY TABS
   ============================================================ */

function renderDayTabs() {
  const container = byId("dayTabs");
  if (!container) return;
  const ws = weekStart();
  container.innerHTML = DAY_DEFS.map(d => {
    const date   = addDays(ws, d.key);
    const active = d.key === state.activeDay;
    const count  = state.schedule.filter(e => e.weekISO === state.weekISO && e.day === d.key).length;
    return `<button type="button" class="day-tab${active ? " active" : ""}" data-day="${d.key}">
      <span class="dt-short">${d.short}</span>
      <span class="dt-label">${d.label}</span>
      <span class="dt-date">${fmtShort(date)}</span>
      ${count ? `<span class="dt-count">${count}</span>` : ""}
    </button>`;
  }).join("");

  container.querySelectorAll(".day-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.activeDay = Number(btn.dataset.day);
      persistState();
      renderDayTabs();
      renderWeekHeader();
      renderOccupancy();
      renderStats();
      const requestDay = byId("requestDay");
      if (requestDay) requestDay.value = String(state.activeDay);
    });
  });
}

/* ============================================================
   WEEK HEADER
   ============================================================ */

function renderWeekHeader() {
  const wl = byId("weekLabel");
  if (wl) wl.textContent = `שבוע עבודה: ${weekRange()}`;
  const dh = byId("dayHeading");
  if (dh) {
    const d = DAY_DEFS[state.activeDay];
    dh.textContent = `${d?.label || ""} · ${fmtDate(activeDayDate())}`;
  }
  const awl = byId("adminWeekLabel");
  if (awl) awl.textContent = `שבוע: ${weekRange()}`;
}

/* ============================================================
   STATS
   ============================================================ */

function renderStats() {
  const box = byId("dashboardStats");
  if (!box) return;
  const today  = activeDayEntries().length;
  const weekly = state.schedule.filter(e => e.weekISO === state.weekISO).length;
  box.innerHTML = `
    <div class="stat-card"><span>חדרים</span>          <strong>${state.rooms.length}</strong></div>
    <div class="stat-card"><span>הזמנות היום</span>    <strong>${today}</strong></div>
    <div class="stat-card"><span>הזמנות בשבוע</span>  <strong>${weekly}</strong></div>
    <div class="stat-card"><span>בקשות פתוחות</span>  <strong>${state.requests.length}</strong></div>
  `;
}

/* ============================================================
   TAG FILTERS
   ============================================================ */

function renderTagFilters() {
  const container = byId("tagFilters");
  if (!container) return;
  const tags = [...new Set(state.rooms.flatMap(r => r.tags))].sort((a, b) => a.localeCompare(b, "he"));
  container.innerHTML = tags.map(tag => `
    <label class="chip${state.selectedTags.has(tag) ? " chip-active" : ""}">
      <input type="checkbox" value="${esc(tag)}"${state.selectedTags.has(tag) ? " checked" : ""} />
      <span>${esc(tag)}</span>
    </label>
  `).join("");
  container.querySelectorAll("input").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.checked ? state.selectedTags.add(cb.value) : state.selectedTags.delete(cb.value);
      persistState();
      renderTagFilters();
      renderOccupancy();
    });
  });
}

/* ============================================================
   REQUESTS
   ============================================================ */

function renderRequests() {
  const list = byId("requestsList");
  if (!list) return;
  if (!state.requests.length) {
    list.innerHTML = `<p class="empty-state">אין בקשות ממתינות.</p>`;
    return;
  }
  list.innerHTML = state.requests.map(req => {
    const dl  = dayLabel(req.day);
    const t   = req.startTime || req.start || "—";
    const rn  = getRoomName(req.roomId || req.room) || req.room || "—";
    const btns = isAdmin()
      ? `<div class="notice-actions">
           <button class="btn-sm" data-req-id="${req.id}" data-action="approve">אישור</button>
           <button class="btn-sm secondary" data-req-id="${req.id}" data-action="deny">דחייה</button>
         </div>`
      : `<div class="muted small">ממתין לאישור מנהל</div>`;
    return `<div class="notice">
      <div><strong>${esc(req.staff)}</strong> ביקש/ה ${esc(rn)} · יום ${dl} · ${t} (${req.duration} דק׳)</div>
      <div class="muted small">${esc(req.team)} | ${esc(req.reason)}</div>
      ${btns}
    </div>`;
  }).join("");

  list.querySelectorAll("button[data-req-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const req = state.requests.find(r => r.id === btn.dataset.reqId);
      if (!req) return;
      state.requests = state.requests.filter(r => r.id !== req.id);
      if (btn.dataset.action === "approve") {
        state.schedule.push(normalizeEntry({
          weekISO:  state.weekISO,
          day:      req.day,
          roomId:   req.roomId || req.room,
          start:    req.startTime || req.start,
          duration: req.duration,
          staff:    req.staff,
          team:     req.team,
          oneTime:  req.oneTime,
          note:     req.reason,
          source:   "request"
        }, state.weekISO, state.rooms));
        addNotification(`בקשת ${req.staff} אושרה.`, true);
      } else {
        addNotification(`בקשת ${req.staff} נדחתה.`);
      }
      persistState();
      renderAll();
    });
  });
}

/* ============================================================
   MEETINGS / RESOURCES / ISSUES / NOTIFICATIONS
   ============================================================ */

function renderMeetings() {
  const box = byId("meetingList");
  if (!box) return;
  box.innerHTML = state.meetings.length
    ? state.meetings.map(m =>
        `<div class="notice"><strong>${esc(m.team)}</strong>: ${esc(m.agenda)}<br>
         <small>קבצים: ${(m.files || []).map(f => esc(f)).join(", ") || "ללא"}</small></div>`
      ).join("")
    : `<p class="empty-state">לא נוספו ישיבות עדיין.</p>`;
}

function renderResources() {
  const box = byId("resourceList");
  if (!box) return;
  box.innerHTML = state.resources.length
    ? state.resources.map(r =>
        `<div class="notice"><strong>${esc(r.title)}</strong> (${esc(r.type)})<br>${esc(r.content)}</div>`
      ).join("")
    : `<p class="empty-state">אין משאבים משותפים.</p>`;
}

function renderIssues() {
  const box = byId("issueQueue");
  if (!box) return;
  box.innerHTML = state.issues.length
    ? state.issues.map(i =>
        `<div class="notice"><strong>${esc(i.room)}</strong> (${esc(i.hour || i.time || "")}) – ${esc(i.details)}<br><small>${esc(i.createdAt)}</small></div>`
      ).join("")
    : `<p class="empty-state">אין תקלות פתוחות.</p>`;
}

function renderNotifications() {
  const box = byId("notificationsList");
  if (!box) return;
  box.innerHTML = state.notifications.length
    ? state.notifications.map(n =>
        `<div class="notice${n.critical ? " notice-critical" : ""}">
           ${n.critical ? "🔔 " : ""}${esc(n.text)}<br><small>${esc(n.at)}</small>
         </div>`
      ).join("")
    : `<p class="empty-state">אין התראות.</p>`;
}

/* ============================================================
   ADMIN – ROOMS
   ============================================================ */

function renderAdminRooms() {
  const list = byId("adminRoomList");
  if (!list) return;
  list.innerHTML = state.rooms.map(room => `
    <div class="admin-row">
      <div class="admin-row-info">
        <strong>${esc(room.name)}</strong>
        <div class="tag-row">${room.tags.map(t => `<span class="tag-pill">${esc(t)}</span>`).join("")}</div>
      </div>
      <div class="admin-row-acts">
        <button class="btn-sm" data-action="edit-room" data-room-id="${room.id}">עריכה</button>
        <button class="btn-sm danger" data-action="del-room" data-room-id="${room.id}">מחיקה</button>
      </div>
    </div>
  `).join("") || `<p class="empty-state">אין חדרים.</p>`;

  list.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const room = getRoomById(btn.dataset.roomId);
      if (!room) return;
      if (btn.dataset.action === "edit-room") {
        byId("adminRoomId").value   = room.id;
        byId("adminRoomName").value = room.name;
        byId("adminRoomTags").value = room.tags.join(", ");
        byId("adminRoomSaveBtn").textContent = "עדכון חדר";
        byId("adminRoomClearBtn").classList.remove("hidden");
        byId("adminRoomName").focus();
      } else {
        if (!confirm(`למחוק את ${room.name}? כל המשבצות יוסרו.`)) return;
        state.rooms    = state.rooms.filter(r => r.id !== room.id);
        state.schedule = state.schedule.filter(e => e.roomId !== room.id);
        persistState();
        renderAll();
        addNotification(`${room.name} נמחק.`);
      }
    });
  });
}

/* ============================================================
   ADMIN – STAFF
   ============================================================ */

function renderAdminStaff() {
  const list = byId("adminStaffList");
  if (!list) return;
  list.innerHTML = state.staff.map(p => `
    <div class="admin-row">
      <div class="admin-row-info">
        <strong>${esc(p.fullName)}</strong>
        <span class="muted small">${esc(p.role)} · ${esc(p.team)}</span>
        <span class="muted small">${esc(p.phone)} | ${esc(p.email)}</span>
      </div>
      <div class="admin-row-acts">
        <button class="btn-sm" data-action="edit-staff" data-staff-id="${p.id}">עריכה</button>
        <button class="btn-sm danger" data-action="del-staff" data-staff-id="${p.id}">מחיקה</button>
      </div>
    </div>
  `).join("") || `<p class="empty-state">אין צוות.</p>`;

  list.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const person = state.staff.find(p => p.id === btn.dataset.staffId);
      if (!person) return;
      if (btn.dataset.action === "edit-staff") {
        byId("adminStaffId").value    = person.id;
        byId("adminStaffName").value  = person.fullName;
        byId("adminStaffPhone").value = person.phone;
        byId("adminStaffEmail").value = person.email;
        byId("adminStaffRole").value  = person.role;
        byId("adminStaffTeam").value  = person.team;
        byId("adminStaffSaveBtn").textContent = "עדכון איש צוות";
        byId("adminStaffClearBtn").classList.remove("hidden");
        byId("adminStaffName").focus();
      } else {
        if (!confirm(`למחוק את ${person.fullName}?`)) return;
        state.staff = state.staff.filter(p => p.id !== person.id);
        persistState();
        renderAdminStaff();
        addNotification(`${person.fullName} הוסר/ה.`);
      }
    });
  });
}

/* ============================================================
   SESSION BAR + ACCESS CONTROL
   ============================================================ */

function renderSessionBar() {
  const bar = byId("sessionBar");
  if (!state.currentUser) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  byId("activeUser").textContent = `מחובר: ${state.currentUser.username}`;
  byId("activeRole").textContent = state.currentUser.role === "admin" ? "מנהל מערכת" : "צוות";
}

function applyAccessControl() {
  const admin = isAdmin();
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !admin));
  const adminBtn = document.querySelector("[data-tab='adminTab']");
  if (adminBtn) adminBtn.classList.toggle("hidden", !admin);
  if (!admin && state.activeTab === "adminTab") state.activeTab = "dashboardTab";
}

/* ============================================================
   TOAST
   ============================================================ */

function showToast(text, type = "info") {
  const toast = byId("toast");
  if (!toast) return;
  toast.textContent  = text;
  toast.className    = `toast toast-${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 3200);
}

function addNotification(text, critical = false) {
  state.notifications.unshift({ id: makeId("note"), text, critical, at: new Date().toLocaleString("he-IL") });
  persistState();
  renderNotifications();
  showToast(text, critical ? "warn" : "info");
}

/* ============================================================
   TAB ROUTING
   ============================================================ */

function showTab(tabId) {
  const btn = document.querySelector(`[data-tab='${tabId}']`);
  if (!btn || btn.classList.contains("hidden")) return;
  state.activeTab = tabId;
  document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
  document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
  byId(tabId)?.classList.remove("hidden");
  btn.classList.add("active");
}

/* ============================================================
   RENDER ALL
   ============================================================ */

function renderAll() {
  renderSessionBar();
  applyAccessControl();
  renderWeekHeader();
  renderDayTabs();
  renderStats();
  renderTagFilters();
  renderOccupancy();
  renderRequests();
  renderMeetings();
  renderResources();
  renderIssues();
  renderNotifications();
  repopulateSelects();
  if (isAdmin()) {
    renderAdminRooms();
    renderAdminStaff();
  }
}

/* ============================================================
   BIND EVENTS
   ============================================================ */


function repopulateSelects() {
  // Refresh selects that depend on mutable state (rooms, staff, week).
  // Safe to call any time – preserves current selection when possible.
  const roomOpts = state.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
  const teamOpts = TEAMS.map(t => `<option>${t}</option>`).join("");
  const staffDatalist = state.staff.map(p => `<option value="${esc(p.fullName)}">`).join("");

  ["requestRoom"].forEach(id => {
    const sel = byId(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = roomOpts;
    if (state.rooms.find(r => r.id === cur)) sel.value = cur;
  });

  ["adminStaffTeam", "requestTeam", "meetingTeam"].forEach(id => {
    const sel = byId(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = teamOpts;
    if (cur) sel.value = cur;
  });

  const requestDay = byId("requestDay");
  if (requestDay) requestDay.value = String(clampDay(state.activeDay));

  // Update staff datalist for request form
  const dl = byId("requestStaffList");
  if (dl) dl.innerHTML = staffDatalist;
}

/* One-time population of selects that never change (day names, time slots) */
function populateStaticSelects() {
  const dayOpts  = DAY_DEFS.map(d => `<option value="${d.key}">${d.label}</option>`).join("");
  const timeOpts = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const t = minToTime(slotStart(i));
    return `<option value="${t}">${t}</option>`;
  }).join("");
  byId("requestDay").innerHTML   = dayOpts;
  byId("requestStart").innerHTML = timeOpts;
}

function bindEvents() {

  /* Login */
  byId("loginForm").addEventListener("submit", e => {
    e.preventDefault();
    const u = byId("username").value.trim();
    const p = byId("password").value;
    const acct = state.credentials[u];
    if (acct && acct.password === p) {
      state.currentUser = { username: u, role: acct.role, label: acct.label };
      sessionStorage.setItem("clinic_user", u);
      byId("loginSection").classList.add("hidden");
      byId("appSection").classList.remove("hidden");
      byId("loginError").classList.add("hidden");
      renderAll();
      showTab(state.activeTab === "adminTab" && !isAdmin() ? "dashboardTab" : state.activeTab);
    } else {
      byId("loginError").classList.remove("hidden");
    }
  });

  byId("logoutBtn").addEventListener("click", () => {
    state.currentUser = null;
    sessionStorage.removeItem("clinic_user");
    byId("appSection").classList.add("hidden");
    byId("loginSection").classList.remove("hidden");
    renderSessionBar();
  });

  /* Tab navigation */
  document.querySelectorAll(".tabs button").forEach(btn =>
    btn.addEventListener("click", () => showTab(btn.dataset.tab))
  );

  /* Week navigation */
  byId("weekPrev").addEventListener("click", () => {
    state.weekISO = shiftWeek(state.weekISO, -1);
    persistState(); renderAll();
  });
  byId("weekNext").addEventListener("click", () => {
    state.weekISO = shiftWeek(state.weekISO, 1);
    persistState(); renderAll();
  });
  byId("weekToday").addEventListener("click", () => {
    state.weekISO = sundayISO();
    state.activeDay = todayDayIdx();
    persistState(); renderAll();
  });

  /* Booking modal submit */
  byId("bookingForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!isAdmin()) return;

    const entryId = byId("bookingEntryId").value;
    const day     = Number(byId("bookingDay").value);
    const roomId  = byId("bookingRoomSel").value;
    const start   = byId("bookingStart").value;
    const dur     = Number(byId("bookingDuration").value);
    const staff   = byId("bookingStaff").value.trim();

    if (!staff)                              { showToast("יש להזין שם איש צוות.", "error"); return; }
    if (timeToMin(start) + dur > WORK_END)   { showToast("המשבצת חורגת משעות העבודה.", "error"); return; }

    const conflict = state.schedule.find(ex =>
      ex.id !== entryId &&
      ex.weekISO === state.weekISO &&
      ex.day === day && ex.roomId === roomId &&
      timeToMin(ex.start) < timeToMin(start) + dur &&
      timeToMin(ex.start) + ex.duration > timeToMin(start)
    );
    if (conflict) { showToast(`התנגשות עם ${conflict.staff}.`, "error"); return; }

    const payload = normalizeEntry({
      id:      entryId || makeId("entry"),
      weekISO: state.weekISO,
      day, roomId, start,
      duration: dur,
      staff,
      team:    byId("bookingTeam").value,
      note:    byId("bookingNote").value.trim(),
      oneTime: byId("bookingOneTime").checked,
      source:  entryId ? (getEntryById(entryId)?.source || "manual") : "manual"
    }, state.weekISO, state.rooms);

    const idx = state.schedule.findIndex(ex => ex.id === entryId);
    if (idx >= 0) state.schedule[idx] = payload;
    else          state.schedule.push(payload);

    addNotification(`${staff} ${entryId ? "עודכן" : "נוסף"} ב${getRoomName(roomId)}.`, true);
    persistState();
    closeBookingModal();
    renderOccupancy();
    renderStats();
    renderDayTabs();
  });

  byId("bookingClose").addEventListener("click", closeBookingModal);
  byId("bookingClose2").addEventListener("click", closeBookingModal);
  byId("bookingDelete").addEventListener("click", () => {
    const entryId = byId("bookingEntryId").value;
    if (!entryId || !isAdmin()) return;
    const entry = getEntryById(entryId);
    if (!entry || !confirm(`למחוק את ${entry.staff}?`)) return;
    state.schedule = state.schedule.filter(e => e.id !== entryId);
    addNotification(`${entry.staff} הוסר/ה.`, true);
    persistState();
    closeBookingModal();
    renderOccupancy();
    renderStats();
    renderDayTabs();
  });
  /* Click backdrop to close */
  byId("bookingModal").addEventListener("click", e => {
    if (e.target === byId("bookingModal")) closeBookingModal();
  });

  /* CSV/JSON upload */
  byId("scheduleUpload")?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "").trim();
        let records;
        if (file.name.toLowerCase().endsWith(".json")) {
          records = JSON.parse(text);
        } else {
          const [header, ...rows] = text.split(/\r?\n/).filter(Boolean);
          const cols = header.split(",").map(c => c.trim());
          records = rows.map(line => {
            const vals = line.split(",").map(v => v.trim());
            return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
          });
        }
        state.schedule = records.map(r => normalizeEntry(r, state.weekISO, state.rooms));
        persistState(); renderAll();
        addNotification("לוח הזמנים עודכן מקובץ.");
      } catch (err) {
        showToast(`שגיאה: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
  });

  /* Requests form */
  const reqRoomSel = byId("requestRoom");
  byId("requestForm").addEventListener("submit", e => {
    e.preventDefault();
    const staff = byId("requestStaff").value.trim();
    if (!staff) { showToast("יש להזין שם איש צוות.", "error"); return; }
    state.requests.unshift({
      id:        makeId("req"),
      team:      byId("requestTeam").value,
      room:      reqRoomSel.value,
      roomId:    reqRoomSel.value,
      day:       Number(byId("requestDay").value),
      startTime: byId("requestStart").value,
      start:     byId("requestStart").value,
      staff,
      duration:  Number(byId("requestDuration").value),
      oneTime:   byId("requestOneTime").checked,
      reason:    byId("requestReason").value.trim()
    });
    persistState();
    byId("requestForm").reset();
    renderRequests();
    addNotification("נשלחה בקשת שינוי לאישור מנהל.", true);
    repopulateSelects();
  });

  /* Meetings form */
  byId("meetingForm").addEventListener("submit", e => {
    e.preventDefault();
    state.meetings.unshift({
      team:   byId("meetingTeam").value,
      agenda: byId("meetingAgenda").value.trim(),
      files:  [...byId("meetingFiles").files].map(f => f.name)
    });
    persistState(); byId("meetingForm").reset(); renderMeetings();
    addNotification("נוסף סדר יום לישיבת צוות.");
  });

  /* Resources form */
  byId("resourceForm").addEventListener("submit", e => {
    e.preventDefault();
    state.resources.unshift({
      title:   byId("resourceTitle").value.trim(),
      type:    byId("resourceType").value,
      content: byId("resourceUrl").value.trim()
    });
    persistState(); byId("resourceForm").reset(); renderResources();
  });

  /* Admin – room form */
  byId("adminRoomForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!isAdmin()) return;
    const id   = byId("adminRoomId").value;
    const room = normalizeRoom({ id: id || makeId("room"), name: byId("adminRoomName").value, tags: byId("adminRoomTags").value });
    if (!room.name) { showToast("יש להזין שם חדר.", "error"); return; }
    const idx = state.rooms.findIndex(r => r.id === room.id);
    if (idx >= 0) state.rooms[idx] = room;
    else          state.rooms.push(room);
    persistState(); renderAll();
    addNotification(`${room.name} עודכן/נוסף.`);
    byId("adminRoomForm").reset();
    byId("adminRoomId").value = "";
    byId("adminRoomSaveBtn").textContent = "הוסף חדר";
    byId("adminRoomClearBtn").classList.add("hidden");
  });
  byId("adminRoomClearBtn").addEventListener("click", () => {
    byId("adminRoomForm").reset();
    byId("adminRoomId").value = "";
    byId("adminRoomSaveBtn").textContent = "הוסף חדר";
    byId("adminRoomClearBtn").classList.add("hidden");
  });

  /* Admin – staff form */
  byId("adminStaffForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!isAdmin()) return;
    const id     = byId("adminStaffId").value;
    const person = normalizeStaff({
      id:       id || makeId("staff"),
      fullName: byId("adminStaffName").value,
      phone:    byId("adminStaffPhone").value,
      email:    byId("adminStaffEmail").value,
      role:     byId("adminStaffRole").value,
      team:     byId("adminStaffTeam").value
    });
    if (!person.fullName) { showToast("יש להזין שם מלא.", "error"); return; }
    const idx = state.staff.findIndex(p => p.id === person.id);
    if (idx >= 0) state.staff[idx] = person;
    else          state.staff.push(person);
    persistState(); renderAdminStaff();
    addNotification(`${person.fullName} עודכן/נוסף.`);
    byId("adminStaffForm").reset();
    byId("adminStaffId").value = "";
    byId("adminStaffSaveBtn").textContent = "הוסף איש צוות";
    byId("adminStaffClearBtn").classList.add("hidden");
  });
  byId("adminStaffClearBtn").addEventListener("click", () => {
    byId("adminStaffForm").reset();
    byId("adminStaffId").value = "";
    byId("adminStaffSaveBtn").textContent = "הוסף איש צוות";
    byId("adminStaffClearBtn").classList.add("hidden");
  });
}

/* ============================================================
   INITIALIZE
   ============================================================ */

function initialize() {
  /* Restore session */
  const stored = sessionStorage.getItem("clinic_user");
  if (stored) {
    state.currentUser = { username: stored, role: stored === "admin" ? "admin" : "staff", label: "" };
    byId("loginSection").classList.add("hidden");
    byId("appSection").classList.remove("hidden");
  }

  populateStaticSelects();
  bindEvents();
  renderAll();

  if (state.currentUser) {
    showTab(state.activeTab === "adminTab" && !isAdmin() ? "dashboardTab" : state.activeTab);
  }
}

window.addEventListener("beforeunload", persistState);
initialize();
