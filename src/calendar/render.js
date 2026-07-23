/* ============================================================
   CALENDAR RENDER - occupancy table / tabs / stats / filters
   ============================================================ */

import {
  DAY_DEFS,
  TEAMS,
  WORK_START,
  WORK_END,
  SLOT_MIN,
  SLOT_COUNT
} from '../core/constants.js';

import {
  byId,
  esc,
  minToTime,
  timeToMin,
  slotOf,
  slotStart,
  slotsFor,
  fmtDate,
  fmtShort,
  isoDate,
  addDays,
  dayLabel,
  teamColorClass,
  roomColorClass,
  showToast,
  safeRender,
  makeId
} from '../core/utils.js';

import {
  state,
  isAdmin,
  persistState,
  recordAudit
} from '../core/store.js';

import {
  getRoomById,
  getRoomName,
  getEntryById,
  activeDayDate,
  activeDayEntries,
  filteredRooms,
  weekRange,
  normalizeEntry,
  normalizeRequest,
  getWeeklyOccupancy,
  getNoShowRate,
  getResolutionTimeAvg,
  getTherapistStats
} from './state.js';

/* ============================================================
   NOTIFICATIONS (convenience)
   ============================================================ */

export function addNotification(text, critical = false) {
  state.notifications = state.notifications || [];
  state.notifications.unshift({ id: makeId("note"), text, critical, at: new Date().toLocaleString("he-IL") });
  persistState();
  showToast(text, critical ? "warn" : "info");
  /* Update bell badge */
  const badge = document.getElementById("notificationBadge");
  const bell = document.getElementById("notificationBell");
  if (badge && bell) {
    const count = state.notifications.length;
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
    bell.classList.toggle("hidden", !state.currentUser);
  }
}

/* ============================================================
   GRID BUILDER
   ============================================================ */

export function buildDayGrid(rooms) {
  let entries = activeDayEntries();
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
   MOVE / DRAG
   ============================================================ */

export function moveEntryToSlot(entryId, newRoomId, newSlot) {
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

export function clearMoveMode(table) {
  table.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  table.querySelectorAll(".move-target").forEach(el => el.classList.remove("move-target"));
  table.classList.remove("move-mode");
  state.drag = null;
}

/* ============================================================
   TABLE INTERACTIONS
   ============================================================ */

export function bindTableInteractions(table, admin) {
  const pendingMoveEntryId = () => state.drag?.entryId || null;

  const handleMove = (roomId, slot) => {
    const entryId = pendingMoveEntryId();
    if (!entryId) return false;
    moveEntryToSlot(entryId, roomId, Number(slot));
    clearMoveMode(table);
    return true;
  };

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

/* ============================================================
   OCCUPANCY TABLE
   ============================================================ */

export function renderOccupancy() {
  const table = byId("occupancyTable");
  if (!table) return;
  const rooms = filteredRooms();
  if (!rooms.length) {
    table.innerHTML = `<tbody><tr><td class="empty-state" colspan="2">אין חדרים המתאימים לסינון.</td></tr></tbody>`;
    return;
  }

  const grid  = buildDayGrid(rooms);
  const admin = isAdmin();

  const thRooms = rooms.map(r =>
    `<th class="room-col-head" scope="col" role="columnheader" data-room-id="${r.id}">
       <span class="rcol-name">${esc(r.name)}</span>
       <small class="rcol-tags">${r.tags.map(t => esc(t)).join(" · ")}</small>
     </th>`
  ).join("");
  const thead = `<thead><tr role="row"><th class="time-col-head" scope="col" role="columnheader">שעה</th>${thRooms}</tr></thead>`;

  const skipSet = new Set();

  const rows = Array.from({ length: SLOT_COUNT }, (_, si) => {
    const slotMin  = slotStart(si);
    const timeLabel = minToTime(slotMin);
    const isHour   = slotMin % 60 === 0;

    const cells = grid.map(({ room, arr }) => {
      const key = `${room.id}:${si}`;
      if (skipSet.has(key)) return "";

      const cell = arr[si];

      if (!cell) {
        const clickAttrs = `data-room-id="${room.id}" data-slot="${si}"`;
        if (admin) {
          return `<td class="slot-empty slot-droptarget" ${clickAttrs} role="gridcell"
                    tabindex="0"
                    aria-label="הוסף ב${esc(room.name)} ${timeLabel}">
                    <span class="slot-plus" aria-hidden="true">+</span>
                  </td>`;
        }
        return `<td class="slot-empty" ${clickAttrs} role="gridcell"></td>`;
      }

      if (!cell.isStart) return "";

      const { entry, span } = cell;
      for (let k = 1; k < span; k++) {
        if (si + k < SLOT_COUNT) skipSet.add(`${room.id}:${si + k}`);
      }

      const isMeeting = entry._isMeeting;
      const endTime = minToTime(timeToMin(entry.start) + entry.duration);
      const teamColor = teamColorClass(entry.team);
      const roomBand = roomColorClass(entry.roomId);

      return `<td class="slot-booked ${roomBand}" rowspan="${span}" data-entry-id="${entry.id}" role="gridcell" aria-label="${esc(getRoomName(entry.roomId))} · ${esc(entry.staff)} · ${esc(entry.start)}-${endTime} · ${esc(entry.team)}">
         <div class="bcard ${teamColor}${entry.oneTime ? " bcard-onetime" : ""}${isMeeting ? " bcard-meeting" : ""}"
              draggable="${!isMeeting && admin}"
              data-entry-id="${entry.id}"
              data-room-id="${entry.roomId}"
              data-start-slot="${slotOf(entry.start)}">
           <div class="bcard-head">
             <strong class="bcard-staff">${isMeeting ? '&#x1F4CB; ' : ''}${esc(entry.clientName || entry.staff)}</strong>
             ${isMeeting ? `<span class="bcard-badge" style="background:var(--accent)">ישיבה</span>` : ""}
             ${!isMeeting && entry.oneTime && !entry.recurringRule && !entry.parentRecurringId ? `<span class="bcard-badge">חד-פעמי</span>` : ""}
             ${entry.sessionStatus && entry.sessionStatus !== "scheduled" ? `<span class="bcard-badge bcard-status-${entry.sessionStatus}">${entry.sessionStatus === "in-session" ? "בטיפול" : "הסתיים"}</span>` : ""}
           </div>
           <div class="bcard-room">${esc(getRoomName(entry.roomId))}${entry.clientName && entry.staff !== entry.clientName ? ` · ${esc(entry.staff)}` : ""}</div>
           <div class="bcard-time">${esc(entry.start)} – ${endTime}</div>
           <div class="bcard-dur">${entry.duration} דק׳${entry.noteType ? ` · ${esc(entry.noteType)}` : ""}</div>
           ${admin && !isMeeting ? `<button type="button" class="bcard-move-btn" data-entry-id="${entry.id}">העבר</button>` : ""}
           ${entry.note ? `<div class="bcard-note">${esc(entry.note)}</div>` : ""}
         </div>
       </td>`;
    }).join("");

    return `<tr class="slot-row${isHour ? " slot-full-hour" : ""}" role="row" data-slot="${si}">
      <th class="time-cell${isHour ? " time-hour" : ""}" scope="row" role="rowheader">${timeLabel}</th>
      ${cells}
    </tr>`;
  }).join("");

  table.setAttribute("role", "grid");
  table.setAttribute("aria-label", "לוח הזמנות יומי");
  table.innerHTML = `<caption class="sr-only">לוח הזמנות – ${rooms.length} חדרים, שעות 08:00 עד 20:00</caption>${thead}<tbody>${rows}</tbody>`;
  bindTableInteractions(table, admin);
}

/* ============================================================
   DAY TABS
   ============================================================ */

export function renderDayTabs() {
  const container = byId("dayTabs");
  if (!container) return;
  const ws = addDays(isoDate(state.weekISO), 0);
  const isoWk = state.weekISO;
  container.innerHTML = DAY_DEFS.map(d => {
    const date   = addDays(ws, d.key);
    const active = d.key === state.activeDay;
    const count  = state.schedule.filter(e => e.weekISO === isoWk && e.day === d.key).length;
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

export function renderWeekHeader() {
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

export function renderStats() {
  const box = byId("dashboardStats");
  if (!box) return;
  const today  = activeDayEntries().length;
  const weekly = state.schedule.filter(e => e.weekISO === state.weekISO).length;
  const pendingRequests = state.requests.filter(r => r.status === "pending").length;
  box.innerHTML = `
    <div class="stat-card"><span>חדרים</span>          <strong>${state.rooms.length}</strong></div>
    <div class="stat-card"><span>הזמנות היום</span>    <strong>${today}</strong></div>
    <div class="stat-card"><span>הזמנות בשבוע</span>  <strong>${weekly}</strong></div>
    <div class="stat-card"><span>בקשות ממתינות</span>  <strong>${pendingRequests}</strong></div>
  `;
}

/* ============================================================
   TAG FILTERS
   ============================================================ */

export function renderTagFilters() {
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

export function populateRequestForm() {
  const teamSel = byId("requestTeam");
  const roomSel = byId("requestRoom");
  const daySel  = byId("requestDay");
  const startSel = byId("requestStart");
  const endSel   = byId("requestEnd");
  const staffList = byId("requestStaffList");
  const staffInput = byId("requestStaff");

  if (teamSel) teamSel.innerHTML = TEAMS.map(t => `<option value="${t}">${t}</option>`).join("");
  if (roomSel) roomSel.innerHTML = state.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
  if (daySel) daySel.innerHTML = DAY_DEFS.map(d => `<option value="${d.key}">${d.label}</option>`).join("");
  if (startSel) startSel.innerHTML = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const t = minToTime(slotStart(i));
    return `<option value="${t}">${t}</option>`;
  }).join("");
  if (endSel) {
    const updateEndTimes = () => {
      const startMin = timeToMin(startSel.value);
      endSel.innerHTML = Array.from({ length: SLOT_COUNT + 1 }, (_, i) => {
        const m = slotStart(i);
        if (m <= startMin) return "";
        const t = minToTime(m);
        return `<option value="${t}">${t}</option>`;
      }).join("");
      if (!endSel.value || timeToMin(endSel.value) <= startMin) {
        endSel.value = minToTime(Math.min(startMin + 60, WORK_END));
      }
    };
    startSel.onchange = updateEndTimes;
    updateEndTimes();
  }
  if (staffList) staffList.innerHTML = state.staff.map(s => `<option value="${esc(s.fullName)}">`).join("");
  if (staffInput && !staffInput.value && state.currentUser?.staffId) {
    const currentStaff = state.staff.find(s => s.id === state.currentUser.staffId);
    if (currentStaff) staffInput.value = currentStaff.fullName;
  }
}

export function renderRequests() {
  populateRequestForm();
  const list = byId("requestsList");
  if (!list) return;
  if (!state.requests.length) {
    list.innerHTML = `<p class="empty-state">אין בקשות ממתינות.</p>`;
    return;
  }
  const statusLabels = { pending: "ממתין", approved: "אושר", denied: "נדחה" };
  list.innerHTML = state.requests.map(req => {
    const dl  = dayLabel(req.day);
    const t   = req.startTime || req.start || "—";
    const rn  = getRoomName(req.roomId || req.room) || req.room || "—";
    const btns = isAdmin() && req.status === "pending"
      ? `<div class="notice-actions">
           <button class="btn-sm" data-req-id="${req.id}" data-action="approve">אישור</button>
           <button class="btn-sm secondary" data-req-id="${req.id}" data-action="deny">דחייה</button>
         </div>`
      : `<div class="muted small">${req.status === "pending" ? "ממתין לאישור מנהל" : `סטטוס: ${statusLabels[req.status] || req.status}`}</div>`;
    return `<div class="notice">
      <div><strong>${esc(req.staff)}</strong> ביקש/ה ${esc(rn)} · יום ${dl} · ${t} (${req.duration} דק׳)</div>
      <div class="muted small">${esc(req.team)} | ${esc(req.reason)}</div>
      <div class="notice-sub">סטטוס: ${statusLabels[req.status] || req.status}${req.decidedAt ? ` · ${esc(req.decidedAt)}` : ""}</div>
      ${btns}
    </div>`;
  }).join("");

  list.querySelectorAll("button[data-req-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const req = state.requests.find(r => r.id === btn.dataset.reqId);
      if (!req || req.status !== "pending") return;
      if (btn.dataset.action === "approve") {
        const existing = req.targetEntryId ? getEntryById(req.targetEntryId) : null;
        if (existing) {
          existing.weekISO = state.weekISO;
          existing.day = req.day;
          existing.roomId = req.roomId || req.room;
          existing.start = req.startTime || req.start;
          existing.duration = req.duration;
          existing.staff = req.staff;
          existing.team = req.team;
          existing.oneTime = req.oneTime;
          existing.note = req.reason;
          existing.source = "request";
        } else {
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
        }
        req.status = "approved";
        req.decidedAt = new Date().toLocaleString("he-IL");
        req.decidedBy = state.currentUser?.username || "admin";
        addNotification(`בקשת ${req.staff} אושרה.`, true);
      } else {
        req.status = "denied";
        req.decidedAt = new Date().toLocaleString("he-IL");
        req.decidedBy = state.currentUser?.username || "admin";
        addNotification(`בקשת ${req.staff} נדחתה.`);
      }
      persistState();
      renderOccupancy();
      renderDayTabs();
      renderWeekHeader();
      renderStats();
      renderTagFilters();
      renderRequests();
    });
  });
}

/* ============================================================
   BOOKING MODAL
   ============================================================ */

export function openBookingModal({ roomId, slot, entry } = {}) {
  const modal  = byId("bookingModal");
  const isEdit = Boolean(entry?.id);
  const isMeeting = entry?._isMeeting;
  const admin  = isAdmin();

  if (isMeeting) {
    byId("bookingModalTitle").textContent = "פרטי ישיבה";
    byId("bookingEntryId").value = entry?.id || "";
    byId("bookingDay").value = String(state.activeDay);
    const meetingData = entry._meetingData || {};
    const dialogBody = document.querySelector("#bookingModal .dialog-body");
    if (dialogBody) {
      dialogBody.innerHTML = `
        <div style="display:grid;gap:.5rem;font-size:.9rem">
          <strong>${esc(meetingData.title || entry.note || 'ישיבה')}</strong>
          <div><strong>דובר:</strong> ${esc(meetingData.speaker || entry.staff || '—')}</div>
          <div><strong>שעה:</strong> ${esc(entry.start)} – ${minToTime(timeToMin(entry.start) + entry.duration)}</div>
          <div><strong>חדר:</strong> ${esc(getRoomName(entry.roomId))}</div>
          ${meetingData.agenda ? `<div><strong>סדר יום:</strong> ${esc(meetingData.agenda)}</div>` : ''}
          ${meetingData.link ? `<div><strong>קישור:</strong> <a href="${esc(meetingData.link)}" target="_blank">${esc(meetingData.link)}</a></div>` : ''}
        </div>
      `;
    }
    byId("bookingSubmit").classList.add("hidden");
    byId("bookingDelete").classList.add("hidden");
    byId("bookingClose2").textContent = "סגור";
  } else {
    byId("bookingModalTitle").textContent = isEdit ? "עריכת הזמנה" : (admin ? "הוספת הזמנה" : "פרטי הזמנה");
  byId("bookingEntryId").value = entry?.id  || "";
  byId("bookingDay").value     = String(entry?.day ?? state.activeDay);

  const roomSel = byId("bookingRoomSel");
  const targetRoom = entry?.roomId || roomId || state.rooms[0]?.id || "";
  roomSel.innerHTML = state.rooms.map(r =>
    `<option value="${r.id}"${r.id === targetRoom ? " selected" : ""}>${esc(r.name)}</option>`
  ).join("");

  const startSel = byId("bookingStart");
  const targetStart = entry?.start || minToTime(slotStart(slot ?? 0));
  startSel.innerHTML = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const t = minToTime(slotStart(i));
    return `<option value="${t}"${t === targetStart ? " selected" : ""}>${t}</option>`;
  }).join("");

  const endSel = byId("bookingEnd");
  const targetEnd = entry
    ? minToTime(timeToMin(entry.start) + entry.duration)
    : minToTime(slotStart((slot ?? 0) + 2));
  const populateEndTimes = (startVal) => {
    const startMin = timeToMin(startVal);
    endSel.innerHTML = Array.from({ length: SLOT_COUNT + 1 }, (_, i) => {
      const m = slotStart(i);
      if (m <= startMin) return "";
      const t = minToTime(m);
      return `<option value="${t}"${t === targetEnd ? " selected" : ""}>${t}</option>`;
    }).join("");
    if (!endSel.value || timeToMin(endSel.value) <= timeToMin(startSel.value)) {
      endSel.value = minToTime(Math.min(timeToMin(startSel.value) + 60, WORK_END));
    }
  };
  populateEndTimes(targetStart);
  startSel.onchange = () => populateEndTimes(startSel.value);

  const teamSel = byId("bookingTeam");
  teamSel.innerHTML = TEAMS.map(t =>
    `<option value="${t}"${entry?.team === t ? " selected" : ""}>${t}</option>`
  ).join("");

  byId("bookingStaffList").innerHTML = state.staff.map(p =>
    `<option value="${esc(p.fullName)}">`
  ).join("");

  byId("bookingStaff").value    = entry?.staff    || "";
  byId("bookingNote").value     = entry?.note     || "";
  byId("bookingOneTime").checked = Boolean(entry?.oneTime);

  byId("bookingRecurring").value = entry?.recurringRule || "";
  byId("bookingRecurringEnd").value = entry?.recurringEndDate || "";

  const noteTypeSel = byId("bookingNoteType");
  if (noteTypeSel) noteTypeSel.value = entry?.noteType || "therapy";

  const fields = ["bookingStaff", "bookingEnd", "bookingStart", "bookingRoomSel", "bookingTeam", "bookingNote", "bookingOneTime", "bookingNoteType"];
  fields.forEach(id => { const el = byId(id); if (el) el.disabled = !admin; });
  byId("bookingSubmit").classList.toggle("hidden", !admin);
  byId("bookingSuggestChange")?.classList.toggle("hidden", !isEdit);
  byId("bookingDelete").classList.toggle("hidden", !(admin && isEdit));
  }

  let _lastFocus = document.activeElement;
  modal.showModal();
  const closeHandler = () => {
    modal.removeEventListener("close", closeHandler);
    if (_lastFocus && _lastFocus.focus) _lastFocus.focus();
  };
  modal.addEventListener("close", closeHandler);
}

export function closeBookingModal() { byId("bookingModal").close(); }

export function renderWaitlistPanel() {
  const panel = document.getElementById("waitlistPanel");
  if (!panel) return;
  const items = state.waitlist || [];
  panel.innerHTML = items.length ? `
    <details class="filter-collapsible"><summary>רשימת המתנה (${items.length})</summary>
      <div style="max-height:200px;overflow-y:auto">
        ${items.slice(0,20).map(w => `<div class="notice"><strong>${esc(w.clientName)}</strong> · ${esc(w.clientPhone)}<br><small>${DAY_DEFS[w.day]?.label} · ${w.start} · ${esc(getRoomName(w.roomId))} · ${esc(w.createdAt)}</small></div>`).join("")}
      </div>
    </details>` : "";
}

export function renderStatsDashboard() {
  const container = document.getElementById("statsDashboard");
  if (!container) return;
  let html = '<div class="section-head"><h2>סטטיסטיקה</h2></div>';
  html += '<div class="dashboard-summary">';

  const occ = getWeeklyOccupancy(state.weekISO);
  html += `<div class="dash-card"><span class="dash-value">${occ}%</span><span class="dash-label">תפוסה שבועית</span></div>`;

  const nsr = getNoShowRate(state.weekISO);
  html += `<div class="dash-card warning"><span class="dash-value">${nsr}%</span><span class="dash-label">אי-הגעה</span></div>`;

  const rta = getResolutionTimeAvg();
  html += `<div class="dash-card"><span class="dash-value">${rta}</span><span class="dash-label">ימים לפתרון תקלה</span></div>`;

  html += '</div>';

  const top5 = getTherapistStats(state.weekISO);
  if (top5.length) {
    html += '<div class="section-head"><h3>מטפלים מובילים השבוע</h3></div>';
    const max = top5[0][1];
    html += top5.map(([name, count]) => `
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;font-size:.85rem">
        <span style="min-width:80px">${esc(name)}</span>
        <div class="stat-bar-wrap" style="flex:1"><div class="stat-bar-fill" style="width:${Math.round(count/max*100)}%;background:var(--primary)">${count}</div></div>
      </div>`).join("");
  }

  container.innerHTML = html;
}

export function renderRoomStatusStrip() {
  const strip = document.getElementById("roomStatusStrip");
  if (!strip) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const entries = activeDayEntries();
  const rooms = state.rooms || [];
  strip.innerHTML = rooms.map(room => {
    const current = entries.find(e => {
      const start = timeToMin(e.start);
      const end = start + e.duration;
      return e.roomId === room.id && start <= nowMin && nowMin < end;
    });
    const next = !current ? entries.find(e => {
      return e.roomId === room.id && timeToMin(e.start) > nowMin;
    }) : null;
    let statusClass = "room-status-free";
    let statusText = "פנוי";
    let sessionText = "—";
    let timeText = "";
    if (current) {
      statusClass = "room-status-occupied";
      statusText = "בטיפול";
      sessionText = esc(current.clientName || current.staff);
      const end = timeToMin(current.start) + current.duration;
      timeText = `עד ${minToTime(end)}`;
    } else if (next && timeToMin(next.start) - nowMin < 15) {
      statusClass = "room-status-soon";
      statusText = "קרוב";
      sessionText = esc(next.clientName || next.staff);
      timeText = `${next.start}`;
    }
    return `<div class="room-status-card">
      <div class="rs-room"><span class="room-status-dot ${statusClass}"></span>${esc(room.name)}</div>
      <div class="rs-session">${sessionText}</div>
      <div class="rs-time">${statusText} · ${timeText}</div>
    </div>`;
  }).join("");
}
