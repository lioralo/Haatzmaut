const STORAGE_KEY = "haatzmaut_state_v2";

const DAY_DEFS = [
  { key: 0, label: "ראשון" },
  { key: 1, label: "שני" },
  { key: 2, label: "שלישי" },
  { key: 3, label: "רביעי" },
  { key: 4, label: "חמישי" }
];

const WORK_START = 8 * 60;
const WORK_END = 20 * 60;
const SLOT_MINUTES = 30;
const SLOT_COUNT = (WORK_END - WORK_START) / SLOT_MINUTES;

const DEFAULT_USERS = [
  { fullName: "מנהל מערכת", phone: "0500000000", email: "admin@clinic.org", chatShortcut: "@admin", role: "מנהל", team: "אדמיניסטרציה" },
  { fullName: "ד" + '"' + "ר לוי", phone: "0500000001", email: "levy@clinic.org", chatShortcut: "@levy", role: "פסיכולוג", team: "מבוגרים" }
];

const DEFAULT_CREDENTIALS = {
  admin: { password: "admin123", role: "admin", label: "מנהל מערכת" },
  staff: { password: "staff123", role: "staff", label: "צוות" }
};

const DEFAULT_ROOMS = [
  { id: "room-1", name: "חדר 1", tags: ["טיפול ילדים", "ציוד אבחוני"] },
  { id: "room-2", name: "חדר 2", tags: ["טיפול קבוצתי"] },
  { id: "room-3", name: "חדר 3", tags: ["טיפול מבוגרים", "ציוד אבחוני"] },
  { id: "room-4", name: "חדר 4", tags: ["חדר משחק"] }
];

const DEFAULT_TEMPLATE = [
  { day: 0, roomId: "room-1", start: "08:30", staff: "נועה כהן", duration: 60, team: "ילדים", source: "base" },
  { day: 1, roomId: "room-2", start: "10:00", staff: "יואב בר", duration: 90, team: "מבוגרים", source: "base" },
  { day: 2, roomId: "room-3", start: "11:30", staff: "מאיה לוי", duration: 60, team: "מבוגרים", source: "base" },
  { day: 3, roomId: "room-4", start: "13:00", staff: "הילה סלע", duration: 120, team: "ילדים", source: "base" }
];

const byId = (id) => document.getElementById(id);

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 0 : -day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekKey(date) {
  return weekStart(date).toISOString().slice(0, 10);
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60).toString().padStart(2, "0");
  const minutes = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function slotIndexFromTime(value) {
  return Math.floor((timeToMinutes(value) - WORK_START) / SLOT_MINUTES);
}

function slotStartMinutes(index) {
  return WORK_START + index * SLOT_MINUTES;
}

function slotCountForDuration(duration) {
  return Math.max(1, Math.ceil(duration / SLOT_MINUTES));
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" }).format(date);
}

function formatDayLabel(dayKey, startDate) {
  const dayDef = DAY_DEFS.find((entry) => entry.key === dayKey);
  return `${dayDef.label} ${formatShortDate(addDays(startDate, dayKey))}`;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      values.push(value.trim());
      value = "";
    } else {
      value += ch;
    }
  }
  values.push(value.trim());
  return values;
}

function uniqueId(prefix = "id") {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRoom(room) {
  return {
    id: room.id || uniqueId("room"),
    name: room.name || "חדר ללא שם",
    tags: Array.isArray(room.tags) ? room.tags : String(room.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean)
  };
}

function normalizeEntry(entry, fallbackWeekStartISO = defaultWeekStartISO(), rooms = DEFAULT_ROOMS) {
  const week = entry.weekStartISO || entry.weekStart ? weekKey(entry.weekStartISO || entry.weekStart) : fallbackWeekStartISO;
  const start = entry.start || entry.hour || "08:00";
  return {
    id: entry.id || uniqueId("entry"),
    weekStartISO: week,
    weekStart: week,
    day: Number(entry.day ?? 0),
    roomId: entry.roomId || resolveRoomId(entry.room, rooms) || rooms[0]?.id || DEFAULT_ROOMS[0].id,
    start,
    duration: Number(entry.duration || 60),
    staff: entry.staff || "",
    team: entry.team || "מבוגרים",
    oneTime: Boolean(entry.oneTime),
    source: entry.source || "manual",
    note: entry.note || ""
  };
}

function loadState() {
  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  })();

  const todayWeek = weekKey(new Date());
  const stateFromStorage = stored || {};
  const loadedRooms = (stateFromStorage.rooms || DEFAULT_ROOMS).map(normalizeRoom);
  const loadedViewWeek = stateFromStorage.viewWeekStart || todayWeek;
  const loadedSchedule = (stateFromStorage.schedule || []).map((entry) => normalizeEntry({ ...entry, weekStart: entry.weekStart || loadedViewWeek }, loadedViewWeek, loadedRooms));

  return {
    currentUser: null,
    users: stateFromStorage.users || DEFAULT_USERS,
    credentials: DEFAULT_CREDENTIALS,
    rooms: loadedRooms,
    schedule: loadedSchedule.length ? loadedSchedule : DEFAULT_TEMPLATE.map((entry) => normalizeEntry({ ...entry, weekStart: todayWeek }, todayWeek, loadedRooms)),
    requests: stateFromStorage.requests || [],
    meetings: stateFromStorage.meetings || [],
    resources: stateFromStorage.resources || [],
    issues: stateFromStorage.issues || [],
    notifications: stateFromStorage.notifications || [],
    selectedDays: new Set(stateFromStorage.selectedDays || DAY_DEFS.map((day) => day.key)),
    selectedTags: new Set(stateFromStorage.selectedTags || []),
    viewWeekStart: stateFromStorage.viewWeekStart || todayWeek,
    activeTab: stateFromStorage.activeTab || "dashboardTab"
  };
}

const state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    users: state.users,
    rooms: state.rooms,
    schedule: state.schedule,
    requests: state.requests,
    meetings: state.meetings,
    resources: state.resources,
    issues: state.issues,
    notifications: state.notifications,
    selectedDays: [...state.selectedDays],
    selectedTags: [...state.selectedTags],
    viewWeekStart: state.viewWeekStart,
    activeTab: state.activeTab
  }));
}

function currentWeekDate() {
  return parseDateKey(state.viewWeekStart);
}

function currentWeekRange() {
  const start = currentWeekDate();
  const end = addDays(start, 4);
  return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
}

function resolveRoomId(roomValue, rooms = DEFAULT_ROOMS) {
  const byIdMatch = rooms.find((room) => room.id === roomValue);
  if (byIdMatch) return byIdMatch.id;
  const byNameMatch = rooms.find((room) => room.name === roomValue);
  return byNameMatch?.id || "";
}

function getRoomName(roomId) {
  return state.rooms.find((room) => room.id === roomId)?.name || roomId;
}

function getRoom(roomId) {
  return state.rooms.find((room) => room.id === roomId);
}

function getWeekEntries(weekStartKey = state.viewWeekStart) {
  return state.schedule
    .filter((entry) => entry.weekStartISO === weekStartKey || entry.weekStart === weekStartKey)
    .sort((left, right) => {
      if (left.day !== right.day) return left.day - right.day;
      if (left.start !== right.start) return left.start.localeCompare(right.start);
      return getRoomName(left.roomId).localeCompare(getRoomName(right.roomId), "he");
    });
}

function getEntriesByCell(weekEntries) {
  const cells = new Map();
  weekEntries.forEach((entry) => {
    const key = `${entry.day}|${entry.roomId}`;
    const list = cells.get(key) || [];
    list.push(entry);
    cells.set(key, list);
  });
  return cells;
}

function updateWeekLabels() {
  byId("weekLabel").textContent = `שבוע עבודה: ${currentWeekRange()}`;
  byId("meetingDate").textContent = `הישיבה הקרובה: ${formatDateLabel(addDays(currentWeekDate(), 0))} (יום ראשון)`;
  byId("adminWeekLabel").textContent = `השבוע הנוכחי בתצוגה: ${currentWeekRange()}`;
}

function showTab(tabId) {
  state.activeTab = tabId;
  saveState();
  document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.add("hidden"));
  document.querySelectorAll(".tabs button").forEach((btn) => btn.classList.remove("active"));
  byId(tabId).classList.remove("hidden");
  const activeButton = document.querySelector(`[data-tab='${tabId}']`);
  if (activeButton) activeButton.classList.add("active");
}

function addNotification(text, critical = false) {
  state.notifications.unshift({ id: uniqueId("note"), text, critical, at: new Date().toLocaleString("he-IL") });
  saveState();
  renderNotifications();
}

function isAdmin() {
  return state.currentUser?.role === "admin";
}

function setCurrentUser(username) {
  const account = state.credentials[username];
  if (!account) return;
  state.currentUser = { username, role: account.role, label: account.label };
  sessionStorage.setItem("clinic_user", JSON.stringify(state.currentUser));
}

function clearCurrentUser() {
  state.currentUser = null;
  sessionStorage.removeItem("clinic_user");
}

function setWeekStartDate(nextDate) {
  state.viewWeekStart = weekKey(nextDate);
  saveState();
  renderAll();
}

function renderTagFilters() {
  const container = byId("tagFilters");
  if (!container) return;
  const tags = [...new Set(state.rooms.flatMap((room) => room.tags))];
  container.innerHTML = "";
  tags.forEach((tag) => {
    const label = document.createElement("label");
    label.className = `chip ${state.selectedTags.has(tag) ? "chip-active" : ""}`;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.selectedTags.has(tag);
    cb.addEventListener("change", () => {
      cb.checked ? state.selectedTags.add(tag) : state.selectedTags.delete(tag);
      saveState();
      renderRoomOptions();
      renderOccupancy();
      renderAdminRooms();
    });
    label.append(cb, document.createTextNode(` ${tag}`));
    container.append(label);
  });
}

function roomAllowed(room) {
  if (state.selectedTags.size === 0) return true;
  return [...state.selectedTags].every((tag) => room.tags.includes(tag));
}

function filteredRooms() {
  return state.rooms.filter((room) => roomAllowed(room));
}

function renderRoomOptions() {
  const requestRoom = byId("requestRoom");
  const scheduleRoom = byId("scheduleRoom");
  const rooms = filteredRooms();
  const options = rooms.length
    ? rooms.map((room) => `<option value="${room.id}">${room.name}</option>`).join("")
    : "<option value=\"\">אין חדר זמין</option>";
  if (requestRoom) requestRoom.innerHTML = options;
  if (scheduleRoom) scheduleRoom.innerHTML = rooms.length ? state.rooms.map((room) => `<option value="${room.id}">${room.name}</option>`).join("") : "<option value=\"\">אין חדר זמין</option>";
}

function renderDayFilters() {
  const container = byId("dayFilters");
  if (!container) return;
  container.innerHTML = "";
  DAY_DEFS.forEach((day) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip day-chip ${state.selectedDays.has(day.key) ? "chip-active" : ""}`;
    button.textContent = day.label;
    button.addEventListener("click", () => {
      if (state.selectedDays.has(day.key)) {
        state.selectedDays.delete(day.key);
      } else {
        state.selectedDays.add(day.key);
      }
      if (state.selectedDays.size === 0) {
        DAY_DEFS.forEach((entry) => state.selectedDays.add(entry.key));
      }
      saveState();
      renderDayFilters();
      renderOccupancy();
      renderAdminEntries();
    });
    container.append(button);
  });
}

function renderWeekControls() {
  const weekLabel = byId("weekLabel");
  const adminWeekLabel = byId("adminWeekLabel");
  if (weekLabel) weekLabel.textContent = `שבוע עבודה: ${currentWeekRange()}`;
  if (adminWeekLabel) adminWeekLabel.textContent = `השבוע הנוכחי בתצוגה: ${currentWeekRange()}`;
}

function buildMatrix(weekEntries) {
  const matrix = {};
  DAY_DEFS.forEach((day) => {
    matrix[day.key] = {};
    state.rooms.forEach((room) => {
      matrix[day.key][room.id] = Array.from({ length: SLOT_COUNT }, () => null);
    });
  });

  weekEntries.forEach((entry) => {
    if (!matrix[entry.day]?.[entry.roomId]) return;
    const startIndex = slotIndexFromTime(entry.start);
    const span = slotCountForDuration(entry.duration);
    for (let offset = 0; offset < span; offset += 1) {
      const slotIndex = startIndex + offset;
      if (slotIndex < 0 || slotIndex >= SLOT_COUNT) continue;
      matrix[entry.day][entry.roomId][slotIndex] = {
        id: entry.id,
        entry,
        startIndex,
        span,
        isStart: offset === 0
      };
    }
  });

  return matrix;
}

function renderOccupancy() {
  const table = byId("occupancyTable");
  if (!table) return;
  const rooms = filteredRooms();
  const visibleDays = DAY_DEFS.filter((day) => state.selectedDays.has(day.key));
  const weekEntries = getWeekEntries();
  const matrix = buildMatrix(weekEntries);

  if (rooms.length === 0) {
    table.innerHTML = `<tbody><tr><td class="empty-state">אין חדרים שתואמים לסינון הנוכחי.</td></tr></tbody>`;
    return;
  }

  const headerRows = [
    `<tr><th class="time-head sticky-col">שעה</th>${visibleDays.map((day) => `<th class="day-head" colspan="${rooms.length}">${day.label}<small>${formatShortDate(addDays(currentWeekDate(), day.key))}</small></th>`).join("")}</tr>`,
    `<tr><th class="time-head sticky-col subhead">&nbsp;</th>${visibleDays.flatMap((day) => rooms.map((room) => `<th class="room-head" data-room-id="${room.id}">${room.name}<small>${room.tags.join(" • ")}</small></th>`)).join("")}</tr>`
  ];

  const bodyRows = Array.from({ length: SLOT_COUNT }, (_, slotIndex) => {
    const slotMinutes = slotStartMinutes(slotIndex);
    const slotLabel = minutesToTime(slotMinutes);
    const rowClass = slotIndex % 2 === 0 ? "hour-row" : "half-row";
    const cells = visibleDays.flatMap((day) => rooms.map((room) => {
      const cell = matrix[day.key][room.id][slotIndex];
      if (cell?.entry) {
        if (!cell.isStart) return "";
        const entry = cell.entry;
        const room = getRoom(entry.roomId);
        const start = minutesToTime(timeToMinutes(entry.start));
        const end = minutesToTime(timeToMinutes(entry.start) + entry.duration);
        return `
          <td class="booking-cell booking-${entry.source || "manual"}" rowspan="${cell.span}">
            <article class="booking-card" data-entry-id="${entry.id}">
              <div class="booking-card__top">
                <span class="room-badge">${room?.name || entry.roomId}</span>
                <span class="booking-team">${entry.team}</span>
              </div>
              <strong>${entry.staff}</strong>
              <div class="booking-time">${start} - ${end}</div>
              <div class="booking-duration">${entry.duration} דקות</div>
              ${entry.note ? `<p class="booking-note">${entry.note}</p>` : ""}
              ${isAdmin() ? `
                <div class="booking-actions">
                  <button type="button" class="edit-entry" data-entry-id="${entry.id}">עריכה</button>
                  <button type="button" class="delete-entry danger" data-entry-id="${entry.id}">מחיקה</button>
                </div>
              ` : ""}
            </article>
          </td>`;
      }
      if (cell) return "";
      return `
        <td class="empty-cell${isAdmin() ? " empty-cell--admin" : ""}" data-day="${day.key}" data-room-id="${room.id}" data-slot="${slotIndex}">
          ${isAdmin() ? `<button type="button" class="add-entry" data-day="${day.key}" data-room-id="${room.id}" data-slot="${slotIndex}">+</button>` : ""}
        </td>`;
    })).join("");
    return `<tr class="${rowClass}"><th class="time-slot sticky-col">${slotLabel}</th>${cells}</tr>`;
  }).join("");

  table.innerHTML = `<thead>${headerRows.join("")}</thead><tbody>${bodyRows}</tbody>`;

  table.querySelectorAll(".add-entry").forEach((button) => {
    button.addEventListener("click", () => {
      openScheduleEditor({
        day: Number(button.dataset.day),
        roomId: button.dataset.roomId,
        start: minutesToTime(WORK_START + Number(button.dataset.slot) * SLOT_MINUTES)
      });
    });
  });

  table.querySelectorAll(".edit-entry").forEach((button) => {
    button.addEventListener("click", () => openScheduleEditor(getEntryById(button.dataset.entryId)));
  });

  table.querySelectorAll(".delete-entry").forEach((button) => {
    button.addEventListener("click", () => removeEntry(button.dataset.entryId));
  });

  table.querySelectorAll(".booking-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const entry = getEntryById(card.dataset.entryId);
      if (entry && isAdmin()) openScheduleEditor(entry);
    });
  });
}

function getEntryById(entryId) {
  return state.schedule.find((entry) => entry.id === entryId);
}

function openScheduleEditor(entry) {
  if (!isAdmin()) return;
  const form = byId("scheduleForm");
  if (!form) return;
  byId("scheduleEntryId").value = entry?.id || "";
  byId("scheduleWeek").textContent = currentWeekRange();
  byId("scheduleDay").value = String(entry?.day ?? 0);
  byId("scheduleRoom").value = entry?.roomId || entry?.room || state.rooms[0]?.id || "";
  byId("scheduleStart").value = entry?.start || "08:00";
  byId("scheduleDuration").value = String(entry?.duration || 60);
  byId("scheduleStaff").value = entry?.staff || "";
  byId("scheduleTeam").value = entry?.team || "מבוגרים";
  byId("scheduleNote").value = entry?.note || "";
  byId("scheduleDeleteAction").classList.toggle("hidden", !entry?.id);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearScheduleEditor() {
  byId("scheduleEntryId").value = "";
  byId("scheduleForm").reset();
  byId("scheduleWeek").textContent = currentWeekRange();
  byId("scheduleDeleteAction").classList.add("hidden");
  byId("scheduleDuration").value = "60";
  byId("scheduleStart").value = "08:00";
}

function removeEntry(entryId) {
  if (!isAdmin()) return;
  const entry = getEntryById(entryId);
  if (!entry) return;
  if (!confirm(`למחוק את ${entry.staff} ב${formatDayLabel(entry.day, currentWeekDate())} ${entry.start}?`)) return;
  state.schedule = state.schedule.filter((item) => item.id !== entryId);
  addNotification(`הוסרה משבצת לו"ז עבור ${entry.staff}.`, true);
  saveState();
  renderAll();
  clearScheduleEditor();
}

function renderRequests() {
  const list = byId("requestsList");
  if (!list) return;

  if (state.requests.length === 0) {
    list.innerHTML = "<p>אין בקשות ממתינות.</p>";
    return;
  }

  list.innerHTML = state.requests.map((request) => `
    <div class="notice request-card">
      <div><strong>${request.staff}</strong> ביקש/ה ${getRoomName(request.roomId || request.room)} ביום ${DAY_DEFS.find((day) => day.key === Number(request.day))?.label || request.day} בשעה ${request.startTime || request.start} (${request.duration} דק')</div>
      <div>צוות: ${request.team} | ${request.reason}</div>
      ${isAdmin() ? `
        <div class="request-actions">
          <button type="button" data-id="${request.id}" data-action="approve">אישור</button>
          <button type="button" data-id="${request.id}" data-action="deny" class="danger">דחייה</button>
        </div>
      ` : "<div class='muted'>הבקשה תטופל על ידי מנהל/ת.</div>"}
    </div>
  `).join("");

  list.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const request = state.requests.find((item) => item.id === button.dataset.id);
      if (!request) return;
      const approved = button.dataset.action === "approve";
      state.requests = state.requests.filter((item) => item.id !== request.id);
      if (approved) {
        state.schedule.push(normalizeEntry({
          weekStart: state.viewWeekStart,
          day: request.day,
          roomId: request.roomId || request.room,
          start: request.startTime || request.start,
          duration: request.duration,
          staff: request.staff,
          team: request.team,
          oneTime: request.oneTime,
          source: "request",
          note: request.reason
        }));
      }
      addNotification(`בקשת השינוי של ${request.staff} ${approved ? "אושרה" : "נדחתה"}.`, true);
      saveState();
      renderAll();
    });
  });
}

function renderUsers() {
  const box = byId("usersTable");
  if (!box) return;
  box.innerHTML = `
    <table>
      <thead><tr><th>שם מלא</th><th>טלפון</th><th>דוא"ל</th><th>קיצור תקשורת</th><th>תפקיד</th><th>צוות</th></tr></thead>
      <tbody>${state.users.map((user) => `<tr><td>${user.fullName}</td><td>${user.phone}</td><td>${user.email}</td><td>${user.chatShortcut}</td><td>${user.role}</td><td>${user.team}</td></tr>`).join("")}</tbody>
    </table>
  `;
}

function renderMeetings() {
  const box = byId("meetingList");
  if (!box) return;
  box.innerHTML = state.meetings.length
    ? state.meetings.map((meeting) => `<div class="notice"><strong>${meeting.team}</strong>: ${meeting.agenda}<br><small>קבצים: ${meeting.files.join(", ") || "ללא"}</small></div>`).join("")
    : "<p>לא נוספו ישיבות עדיין.</p>";
}

function renderResources() {
  const box = byId("resourceList");
  if (!box) return;
  box.innerHTML = state.resources.length
    ? state.resources.map((resource) => `<div class="notice"><strong>${resource.title}</strong> (${resource.type})<br>${resource.content}</div>`).join("")
    : "<p>אין משאבים משותפים כרגע.</p>";
}

function renderIssues() {
  const box = byId("issueQueue");
  if (!box) return;
  box.innerHTML = state.issues.length
    ? state.issues.map((issue) => `<div class="notice"><strong>${issue.room}</strong> (${issue.hour}) - ${issue.details}<br><small>${issue.createdAt}</small></div>`).join("")
    : "<p>אין תקלות פתוחות.</p>";
}

function renderNotifications() {
  const box = byId("notificationsList");
  if (!box) return;
  box.innerHTML = state.notifications.length
    ? state.notifications.map((notification) => `<div class="notice ${notification.critical ? "notice-critical" : ""}">${notification.critical ? "הודעה חשובה: " : ""}${notification.text}<br><small>${notification.at}</small></div>`).join("")
    : "<p>אין התראות.</p>";
}

function renderAdminEntries() {
  const box = byId("adminEntryList");
  if (!box) return;
  if (!isAdmin()) {
    box.innerHTML = "<p>אזור זה זמין למנהלי מערכת בלבד.</p>";
    return;
  }
  const entries = getWeekEntries();
  box.innerHTML = entries.length
    ? entries.map((entry) => {
      const room = getRoom(entry.roomId);
      const end = minutesToTime(timeToMinutes(entry.start) + entry.duration);
      return `
        <div class="notice admin-entry" data-entry-id="${entry.id}">
          <div><strong>${entry.staff}</strong> · ${DAY_DEFS.find((day) => day.key === entry.day)?.label} · ${entry.start} - ${end}</div>
          <div>${room?.name || entry.roomId} · ${entry.duration} דק' · ${entry.team}${entry.note ? ` · ${entry.note}` : ""}</div>
          <div class="request-actions">
            <button type="button" class="edit-entry" data-entry-id="${entry.id}">עריכה</button>
            <button type="button" class="delete-entry danger" data-entry-id="${entry.id}">מחיקה</button>
          </div>
        </div>
      `;
    }).join("")
    : "<p>אין משבצות בשבוע המוצג. אפשר להוסיף מהטופס או ללחוץ על תאים ריקים בטבלה.</p>";

  box.querySelectorAll(".edit-entry").forEach((button) => {
    button.addEventListener("click", () => openScheduleEditor(getEntryById(button.dataset.entryId)));
  });

  box.querySelectorAll(".delete-entry").forEach((button) => {
    button.addEventListener("click", () => removeEntry(button.dataset.entryId));
  });
}

function renderAdminRooms() {
  const box = byId("adminRoomList");
  if (!box) return;
  if (!isAdmin()) {
    box.innerHTML = "<p>אזור זה זמין למנהלי מערכת בלבד.</p>";
    return;
  }
  box.innerHTML = state.rooms.length
    ? state.rooms.map((room) => `
      <div class="notice room-card" data-room-id="${room.id}">
        <div><strong>${room.name}</strong></div>
        <div class="room-tags">${room.tags.map((tag) => `<span class="chip chip-static">${tag}</span>`).join("")}</div>
        <div class="request-actions">
          <button type="button" class="edit-room" data-room-id="${room.id}">עריכה</button>
          <button type="button" class="delete-room danger" data-room-id="${room.id}">מחיקה</button>
        </div>
      </div>
    `).join("")
    : "<p>אין חדרים זמינים כרגע.</p>";

  box.querySelectorAll(".edit-room").forEach((button) => {
    button.addEventListener("click", () => openRoomEditor(getRoom(button.dataset.roomId)));
  });

  box.querySelectorAll(".delete-room").forEach((button) => {
    button.addEventListener("click", () => removeRoom(button.dataset.roomId));
  });
}

function renderAdminPanels() {
  const adminTab = byId("adminTab");
  const adminButton = document.querySelector("[data-tab='adminTab']");
  const usersTabButton = document.querySelector("[data-tab='usersTab']");
  const usersTab = byId("usersTab");
  const adminOnlyElements = document.querySelectorAll(".admin-only");

  if (isAdmin()) {
    adminTab?.classList.remove("hidden");
    adminButton?.classList.remove("hidden");
    usersTab?.classList.remove("hidden");
    usersTabButton?.classList.remove("hidden");
    adminOnlyElements.forEach((element) => element.classList.remove("hidden"));
  } else {
    adminTab?.classList.add("hidden");
    adminButton?.classList.add("hidden");
    if (state.activeTab === "adminTab") showTab("dashboardTab");
    usersTab?.classList.add("hidden");
    usersTabButton?.classList.add("hidden");
    adminOnlyElements.forEach((element) => element.classList.add("hidden"));
  }
}

function openRoomEditor(room) {
  if (!isAdmin() || !room) return;
  byId("roomId").value = room.id;
  byId("roomName").value = room.name;
  byId("roomTags").value = room.tags.join(", ");
  byId("roomFormTitle").textContent = `עריכת ${room.name}`;
  byId("roomFormReset").classList.remove("hidden");
}

function clearRoomEditor() {
  byId("roomId").value = "";
  byId("roomName").value = "";
  byId("roomTags").value = "";
  byId("roomFormTitle").textContent = "הוספת חדר";
  byId("roomFormReset").classList.add("hidden");
}

function removeRoom(roomId) {
  if (!isAdmin()) return;
  const room = getRoom(roomId);
  if (!room) return;
  const hasEntries = state.schedule.some((entry) => entry.roomId === roomId);
  const message = hasEntries
    ? `מחיקת ${room.name} תסיר גם את כל משבצות הלוח המקושרות אליו. להמשיך?`
    : `למחוק את ${room.name}?`;
  if (!confirm(message)) return;
  state.rooms = state.rooms.filter((item) => item.id !== roomId);
  state.schedule = state.schedule.filter((entry) => entry.roomId !== roomId);
  saveState();
  renderAll();
  addNotification(`החדר ${room.name} נמחק מהמערכת.`, true);
}

function renderStats() {
  const box = byId("dashboardStats");
  if (!box) return;
  const weekEntries = getWeekEntries();
  box.innerHTML = `
    <div class="stat-card"><span>חדרים</span><strong>${state.rooms.length}</strong></div>
    <div class="stat-card"><span>משבצות פעילות</span><strong>${weekEntries.length}</strong></div>
    <div class="stat-card"><span>בקשות פתוחות</span><strong>${state.requests.length}</strong></div>
    <div class="stat-card"><span>תקלות</span><strong>${state.issues.length}</strong></div>
  `;
}

function renderAdminForms() {
  if (!isAdmin()) return;
  byId("scheduleWeek").textContent = currentWeekRange();
  const roomSelects = [byId("scheduleRoom"), byId("requestRoom")].filter(Boolean);
  roomSelects.forEach((select) => {
    if (!select.value && select.options.length) select.value = select.options[0].value;
  });
}

function loadScheduleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "").trim();
      let records = [];
      if (file.name.toLowerCase().endsWith(".json")) {
        records = JSON.parse(text);
      } else {
        const [header, ...rows] = text.split(/\r?\n/).filter(Boolean);
        const columns = parseCsvLine(header);
        records = rows.map((line) => {
          const values = parseCsvLine(line);
          return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
        });
      }

      const week = state.viewWeekStart;
      state.schedule = records.map((record) => normalizeEntry({
        weekStart: record.weekStart || week,
        day: record.day ?? record.weekday ?? record.dayKey ?? 0,
        roomId: record.roomId || record.room,
        start: record.start || record.hour || "08:00",
        staff: record.staff || record.fullName || "",
        duration: record.duration || 60,
        team: record.team || "מבוגרים",
        oneTime: String(record.oneTime || false) === "true",
        source: record.source || "import",
        note: record.note || ""
      }, week, state.rooms));
      saveState();
      renderAll();
      addNotification("נוצר/עודכן לוח שבועי מקובץ CSV/JSON.");
    } catch (error) {
      alert(`פורמט קובץ לא תקין. יש להשתמש ב-CSV/JSON תקניים. פרטים: ${error.message || "שגיאה לא ידועה"}`);
    }
  };
  reader.readAsText(file);
}

function renderSessionState() {
  const storedUser = sessionStorage.getItem("clinic_user");
  if (!storedUser) return;
  state.currentUser = {
    username: storedUser,
    role: storedUser === "admin" ? "admin" : "staff"
  };
  byId("activeUser").textContent = `מחובר: ${state.currentUser.username}`;
  byId("activeRole").textContent = state.currentUser.role === "admin" ? "מנהל מערכת" : "צוות";
  byId("loginSection").classList.add("hidden");
  byId("appSection").classList.remove("hidden");
  byId("sessionBar").classList.remove("hidden");
}

function bindEvents() {
  byId("loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const username = byId("username").value.trim();
    const password = byId("password").value;
    const account = state.credentials[username];
    if (account && account.password === password) {
      setCurrentUser(username);
      byId("activeUser").textContent = `מחובר: ${username} · ${account.label}`;
      byId("loginSection").classList.add("hidden");
      byId("appSection").classList.remove("hidden");
      byId("sessionBar").classList.remove("hidden");
      byId("loginError").classList.add("hidden");
      renderAdminPanels();
      renderAll();
      showTab(state.activeTab === "adminTab" && !isAdmin() ? "dashboardTab" : state.activeTab);
      return;
    }
    byId("loginError").classList.remove("hidden");
  });

  byId("logoutBtn").addEventListener("click", () => {
    clearCurrentUser();
    byId("appSection").classList.add("hidden");
    byId("sessionBar").classList.add("hidden");
    byId("loginSection").classList.remove("hidden");
  });

  document.querySelectorAll(".tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.dataset.tab;
      if (button.classList.contains("hidden")) return;
      showTab(tabId);
    });
  });

  byId("weekPrev").addEventListener("click", () => setWeekStartDate(addDays(currentWeekDate(), -7)));
  byId("weekNext").addEventListener("click", () => setWeekStartDate(addDays(currentWeekDate(), 7)));

  byId("scheduleUpload").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) loadScheduleFile(file);
  });

  byId("requestForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const request = {
      id: uniqueId("request"),
      team: byId("requestTeam").value,
      room: byId("requestRoom").value,
      roomId: byId("requestRoom").value,
      day: Number(byId("requestDay").value),
      startTime: byId("requestStart").value,
      staff: byId("requestStaff").value.trim(),
      duration: Number(byId("requestDuration").value),
      oneTime: byId("requestOneTime").checked,
      reason: byId("requestReason").value.trim()
    };
    state.requests.unshift(request);
    saveState();
    byId("requestForm").reset();
    byId("requestDay").value = "0";
    byId("requestStart").value = "08:00";
    renderRequests();
    addNotification("נוצרה בקשת שינוי חדשה לאישור מנהל.", true);
  });

  byId("scheduleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const entryId = byId("scheduleEntryId").value;
    const payload = normalizeEntry({
      id: entryId || uniqueId("entry"),
      weekStart: state.viewWeekStart,
      day: Number(byId("scheduleDay").value),
      roomId: byId("scheduleRoom").value,
      start: byId("scheduleStart").value,
      duration: Number(byId("scheduleDuration").value),
      staff: byId("scheduleStaff").value.trim(),
      team: byId("scheduleTeam").value,
      note: byId("scheduleNote").value.trim(),
      source: entryId ? getEntryById(entryId)?.source || "manual" : "manual"
    });

    const conflict = state.schedule.find((entry) => {
      if (entry.id === payload.id) return false;
      if (entry.weekStart !== payload.weekStart || entry.day !== payload.day || entry.roomId !== payload.roomId) return false;
      const entryStart = timeToMinutes(entry.start);
      const entryEnd = entryStart + entry.duration;
      const payloadStart = timeToMinutes(payload.start);
      const payloadEnd = payloadStart + payload.duration;
      return payloadStart < entryEnd && payloadEnd > entryStart;
    });

    if (conflict) {
      alert(`יש התנגשות עם ${conflict.staff} ב${getRoomName(conflict.roomId)}.`);
      return;
    }

    const index = state.schedule.findIndex((entry) => entry.id === entryId);
    if (index >= 0) {
      state.schedule[index] = payload;
      addNotification(`משבצת הלו"ז של ${payload.staff} עודכנה.`, true);
    } else {
      state.schedule.push(payload);
      addNotification(`נוספה משבצת חדשה עבור ${payload.staff}.`, true);
    }
    saveState();
    renderAll();
    clearScheduleEditor();
  });

  byId("scheduleCancel").addEventListener("click", () => clearScheduleEditor());
  byId("scheduleDeleteAction").addEventListener("click", () => {
    const entryId = byId("scheduleEntryId").value;
    if (entryId) removeEntry(entryId);
  });

  byId("roomForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const roomId = byId("roomId").value;
    const room = normalizeRoom({
      id: roomId || uniqueId("room"),
      name: byId("roomName").value.trim(),
      tags: byId("roomTags").value
    });
    if (!room.name) return;

    const existingIndex = state.rooms.findIndex((item) => item.id === room.id);
    if (existingIndex >= 0) {
      state.rooms[existingIndex] = room;
      addNotification(`החדר ${room.name} עודכן.`, true);
    } else {
      state.rooms.push(room);
      addNotification(`החדר ${room.name} נוסף למערכת.`, true);
    }
    saveState();
    renderAll();
    clearRoomEditor();
  });

  byId("roomFormReset").addEventListener("click", () => clearRoomEditor());

  byId("userForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    state.users.push({
      fullName: byId("fullName").value.trim(),
      phone: byId("phone").value.trim(),
      email: byId("email").value.trim(),
      chatShortcut: byId("chatShortcut").value.trim(),
      role: byId("role").value.trim(),
      team: byId("team").value
    });
    saveState();
    byId("userForm").reset();
    renderUsers();
  });

  byId("meetingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const files = [...byId("meetingFiles").files].map((file) => file.name);
    const meeting = { team: byId("meetingTeam").value, agenda: byId("meetingAgenda").value.trim(), files };
    state.meetings.unshift(meeting);
    saveState();
    byId("meetingForm").reset();
    renderMeetings();
    addNotification("הועלה סדר יום/חומר חדש למודול ישיבות צוות.", true);
  });

  byId("resourceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.resources.unshift({ title: byId("resourceTitle").value.trim(), type: byId("resourceType").value, content: byId("resourceUrl").value.trim() });
    saveState();
    byId("resourceForm").reset();
    renderResources();
  });
}

function renderAll() {
  updateWeekLabels();
  renderSessionState();
  renderAdminPanels();
  renderStats();
  renderTagFilters();
  renderDayFilters();
  renderRoomOptions();
  renderWeekControls();
  byId("requestDay").innerHTML = DAY_DEFS.map((day) => `<option value="${day.key}">${day.label}</option>`).join("");
  byId("requestStart").innerHTML = Array.from({ length: SLOT_COUNT }, (_, index) => `<option value="${minutesToTime(slotStartMinutes(index))}">${minutesToTime(slotStartMinutes(index))}</option>`).join("");
  byId("scheduleDay").innerHTML = DAY_DEFS.map((day) => `<option value="${day.key}">${day.label}</option>`).join("");
  byId("scheduleStart").innerHTML = Array.from({ length: SLOT_COUNT }, (_, index) => `<option value="${minutesToTime(slotStartMinutes(index))}">${minutesToTime(slotStartMinutes(index))}</option>`).join("");
  if (byId("scheduleRoom").options.length === 0 && state.rooms.length) {
    byId("scheduleRoom").innerHTML = state.rooms.map((room) => `<option value="${room.id}">${room.name}</option>`).join("");
  }
  renderOccupancy();
  renderRequests();
  renderUsers();
  renderMeetings();
  renderResources();
  renderIssues();
  renderNotifications();
  renderAdminEntries();
  renderAdminRooms();
  renderAdminForms();
}

function initialize() {
  bindEvents();
  renderAll();

  const storedUser = sessionStorage.getItem("clinic_user");
  if (storedUser) {
    try {
      state.currentUser = JSON.parse(storedUser);
      byId("activeUser").textContent = `מחובר: ${state.currentUser.username} · ${state.currentUser.label}`;
      byId("loginSection").classList.add("hidden");
      byId("appSection").classList.remove("hidden");
      byId("sessionBar").classList.remove("hidden");
    } catch {
      clearCurrentUser();
    }
  }

  renderAdminPanels();
  if (state.activeTab === "adminTab" && !isAdmin()) {
    state.activeTab = "dashboardTab";
  }
  showTab(state.activeTab);
  renderAll();
}

initialize();
