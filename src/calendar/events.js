/* ============================================================
   CALENDAR EVENTS - booking / upload / requests / exports
   ============================================================ */

import {
  WORK_END,
  TEAMS
} from '../core/constants.js';

import {
  byId,
  esc,
  minToTime,
  timeToMin,
  makeId,
  showToast,
  enforceMaxLength,
  ensureUploadAllowed,
  confirmImportPreview,
  parseCsvRows,
  safeRender
} from '../core/utils.js';

import {
  state,
  isAdmin,
  persistState,
  persistStateImmediate,
  autoBackup,
  recordAudit
} from '../core/store.js';

import {
  getRoomName,
  getEntryById,
  ensureSyncedScheduleWindow,
  normalizeEntry,
  normalizeRequest,
  normalizeRoom,
  normalizeStaff,
  isValidScheduleTemplateRecord,
  isValidStaffRecord,
  mergeStaffWithLinkedPriority,
  templateFromEntries,
  applyTemplateScope,
  importScheduleFromFile,
  exportBookingsCSV,
  exportStaffCSV,
  exportRoomsCSV,
  resolveUnknownStaff,
  resolveUnmatchedStaffUsers
} from './state.js';

import {
  closeBookingModal,
  renderOccupancy,
  renderDayTabs,
  renderWeekHeader,
  renderStats,
  renderTagFilters,
  renderRequests,
  renderRoomStatusStrip,
  addNotification
} from './render.js';

/* ============================================================
   INIT CALENDAR EVENTS
   ============================================================ */

export function initCalendarEvents() {

  /* Booking modal submit */
  const bookingForm = byId("bookingForm");
  if (bookingForm) {
    bookingForm.addEventListener("submit", e => {
      e.preventDefault();
      if (!isAdmin()) return;

      const entryId = byId("bookingEntryId").value;
      const day     = Number(byId("bookingDay").value);
      const roomId  = byId("bookingRoomSel").value;
      const start   = byId("bookingStart").value;
      const end     = byId("bookingEnd").value;
      const dur     = timeToMin(end) - timeToMin(start);
      const staff   = byId("bookingStaff").value.trim();

      try {
        enforceMaxLength("שם איש צוות", staff, 80);
        enforceMaxLength("הערה", byId("bookingNote").value.trim(), 500);
      } catch (err) {
        showToast(err.message, "error");
        return;
      }

      if (!staff)        { showToast("יש להזין שם איש צוות.", "error"); return; }
      if (dur < 30)      { showToast("שעת הסיום חייבת להיות לאחר שעת ההתחלה.", "error"); return; }
      if (timeToMin(end) > WORK_END)   { showToast("המשבצת חורגת משעות העבודה.", "error"); return; }

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
        noteType: byId("bookingNoteType")?.value || "therapy",
        clientName: byId("bookingClientName")?.value.trim() || "",
        clientPhone: byId("bookingClientPhone")?.value.trim() || "",
        oneTime: byId("bookingOneTime").checked,
        source:  entryId ? (getEntryById(entryId)?.source || "manual") : "manual"
      }, state.weekISO, state.rooms);

      const idx = state.schedule.findIndex(ex => ex.id === entryId);
      if (idx >= 0) state.schedule[idx] = payload;
      else          state.schedule.push(payload);

      addNotification(`${staff} ${entryId ? "עודכן" : "נוסף"} ב${getRoomName(roomId)}.`, true);
      recordAudit(entryId ? "booking.update" : "booking.create", `${staff} · ${getRoomName(roomId)} · ${start}-${end}`, "info", false);
      persistState();
      closeBookingModal();
      renderOccupancy();
      renderStats();
      renderDayTabs();
    });
  }

  /* Booking close / cancel / delete */
  const bookingClose = byId("bookingClose");
  if (bookingClose) bookingClose.addEventListener("click", closeBookingModal);

  const bookingClose2 = byId("bookingClose2");
  if (bookingClose2) bookingClose2.addEventListener("click", closeBookingModal);

  const bookingDelete = byId("bookingDelete");
  if (bookingDelete) {
    bookingDelete.addEventListener("click", () => {
      const entryId = byId("bookingEntryId").value;
      if (!entryId || !isAdmin()) return;
      const entry = getEntryById(entryId);
      if (!entry || !confirm(`למחוק את ${entry.staff}?`)) return;
      state.schedule = state.schedule.filter(e => e.id !== entryId);
      addNotification(`${entry.staff} הוסר/ה.`, true);
      recordAudit("booking.delete", `${entry.staff} · ${getRoomName(entry.roomId)} · ${entry.start}`, "warn", false);
      persistState();
      closeBookingModal();
      renderOccupancy();
      renderStats();
      renderDayTabs();
    });
  }

  const bookingModal = byId("bookingModal");
  if (bookingModal) {
    bookingModal.addEventListener("click", e => {
      if (e.target === byId("bookingModal")) closeBookingModal();
    });
  }

  /* Booking "suggest change" */
  const bookingSuggestChange = byId("bookingSuggestChange");
  if (bookingSuggestChange) {
    bookingSuggestChange.addEventListener("click", () => {
      const entryId = byId("bookingEntryId").value;
      const staff = byId("bookingStaff").value.trim();
      const start = byId("bookingStart").value;
      const end   = byId("bookingEnd").value;
      if (!entryId || !staff) return;
      const dur = timeToMin(end) - timeToMin(start);
      if (dur < 30) { showToast("שעת הסיום לא תקינה.", "error"); return; }
      state.requests.unshift(normalizeRequest({
        team: byId("bookingTeam").value,
        roomId: byId("bookingRoomSel").value,
        day: Number(byId("bookingDay").value),
        start: byId("bookingStart").value,
        duration: dur,
        staff,
        oneTime: byId("bookingOneTime").checked,
        reason: byId("bookingNote").value.trim() || "בקשת שינוי מתוך הזמנה",
        targetEntryId: entryId,
        status: "pending"
      }));
      persistState();
      closeBookingModal();
      renderRequests();
      renderStats();
      addNotification("נשלחה בקשת שינוי להזמנה.", true);
    });
  }

  /* Schedule file upload — shared handler */
  async function handleScheduleUpload(file, scopeElId) {
    if (!ensureUploadAllowed(file, "קובץ לו\"ז")) return;
    const reader = new FileReader();
    reader.onload = async () => {
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

        const unknownStaff = validRows.map(r => String(r.staff || "").trim()).filter(Boolean);
        const staffMap = await resolveUnknownStaff(unknownStaff);
        if (staffMap === null) { showToast("ייבוא בוטל.", "info"); return; }
        
        const resolvedRows = validRows.map(r => ({
          ...r,
          staff: staffMap[String(r.staff || "").trim()] || r.staff,
          clientName: r.clientName || "",
          noteType: r.noteType || "therapy",
          recurring: r.recurring || "",
          recurringEnd: r.recurringEnd || ""
        }));

        const template = templateFromEntries(resolvedRows, state.rooms);
        if (!template.length) throw new Error("הקובץ לא מכיל רשומות תקינות");
        const scope = byId(scopeElId)?.value || "current-upcoming";
        const approved = confirmImportPreview("לו\"ז", rows.length, template.length, `טווח החלפה: ${scope}`);
        if (!approved) {
          showToast("ייבוא לו\"ז בוטל אחרי תצוגה מקדימה.", "info");
          return;
        }
        state.defaultTemplate = template;
        applyTemplateScope(template, scope);
        recordAudit("schedule.import", `נטענו ${template.length} רשומות (${scope}).`, "warn", false);
        persistState();
        autoBackup();
        safeRender(renderDayTabs, "dayTabs");
        safeRender(renderWeekHeader, "weekHeader");
        safeRender(renderStats, "stats");
        safeRender(renderTagFilters, "tagFilters");
        safeRender(renderOccupancy, "occupancy");
        safeRender(renderRequests, "requests");
        addNotification(`לוח הזמנים עודכן: נטענו ${template.length} רשומות תקינות מתוך ${rows.length}.`);
      } catch (err) {
        showToast(`שגיאה: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
  }

  const scheduleUpload = byId("scheduleUpload");
  if (scheduleUpload) {
    scheduleUpload.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) { handleScheduleUpload(file, "scheduleReplaceScope"); e.target.value = ""; }
    });
  }

  const scheduleUploadInline = byId("scheduleUploadInline");
  if (scheduleUploadInline) {
    scheduleUploadInline.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) { handleScheduleUpload(file, "scheduleReplaceScopeInline"); e.target.value = ""; }
    });
  }

  /* Room file upload */
  const roomUpload = byId("roomUpload");
  if (roomUpload) {
    roomUpload.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (!ensureUploadAllowed(file, "קובץ חדרים")) { e.target.value = ""; return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result || "").trim();
          const records = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseCsvRows(text);
          const rows = Array.isArray(records) ? records : [];
          const validRows = rows.filter(r => r && typeof r === "object" && String(r.name || "").trim());
          if (!validRows.length) throw new Error("לא נמצאו רשומות חדרים תקינות בקובץ");
          const approved = confirmImportPreview("חדרים", rows.length, validRows.length);
          if (!approved) {
            showToast("ייבוא חדרים בוטל אחרי תצוגה מקדימה.", "info");
            return;
          }
          const incoming = validRows.map(r => normalizeRoom({
            id:   String(r.id || "").trim() || makeId("room"),
            name: r.name,
            tags: r.tags
          }));
          incoming.forEach(room => {
            const idx = state.rooms.findIndex(r => r.id === room.id);
            if (idx >= 0) state.rooms[idx] = room;
            else state.rooms.push(room);
          });
          recordAudit("room.import", `יובאו ${incoming.length} חדרים.`, "warn", false);
          persistState();
          autoBackup();
          safeRender(renderDayTabs, "dayTabs");
          safeRender(renderWeekHeader, "weekHeader");
          safeRender(renderStats, "stats");
          safeRender(renderTagFilters, "tagFilters");
          safeRender(renderOccupancy, "occupancy");
          safeRender(renderRequests, "requests");
          addNotification(`יובאו ${incoming.length} חדרים מתוך ${rows.length} רשומות.`);
        } catch (err) {
          showToast(`שגיאה בייבוא חדרים: ${err.message}`, "error");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  /* Staff file upload — two-step with delegation */
  let staffUploadFile = null;
  
  document.addEventListener("change", e => {
    if (!e.target.matches?.("#staffUpload")) return;
    const file = e.target.files?.[0];
    if (!ensureUploadAllowed(file, "קובץ צוות")) { e.target.value = ""; staffUploadFile = null; return; }
    staffUploadFile = file;
    const sel = document.getElementById("staffFileSelected");
    const btn = document.getElementById("staffUploadStartBtn");
    if (sel) sel.textContent = file.name;
    if (btn) btn.disabled = false;
  });

  document.addEventListener("click", async e => {
    if (!e.target.matches?.("#staffUploadStartBtn")) return;
    const file = staffUploadFile;
    if (!file) { showToast("יש לבחור קובץ תחילה.", "error"); return; }
    const btn = e.target;
    btn.disabled = true;
    try {
      const reader = new FileReader();
      const text = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || "").trim());
        reader.onerror = () => reject(new Error("שגיאה בקריאת קובץ"));
        reader.readAsText(file);
      });

      const records = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseCsvRows(text);
      const rows = Array.isArray(records) ? records : [];
      const validRows = rows.filter(isValidStaffRecord);
      if (!validRows.length) throw new Error("לא נמצאו רשומות צוות תקינות בקובץ");
      const approved = confirmImportPreview("צוות", rows.length, validRows.length);
      if (!approved) { showToast("ייבוא צוות בוטל אחרי תצוגה מקדימה.", "info"); return; }

      const normalizedIncoming = validRows.map(r => normalizeStaff({
        id: String(r.id || "").trim() || makeId("staff"),
        fullName: r.fullName || r.name, phone: r.phone, email: r.email, role: r.role, team: r.team
      }));

      const beforeCount = state.staff.length;
      const beforeUserCount = state.users.length;
      const merged = mergeStaffWithLinkedPriority(state.staff, normalizedIncoming, state.users);
      state.staff = merged.staff;
      state.users = merged.users;
      recordAudit("staff.import", `יובאו ${validRows.length} רשומות צוות.`, "warn", false);
      persistStateImmediate();

      const userMatchResults = await resolveUnmatchedStaffUsers(state.staff, state.users);
      if (userMatchResults === null) { showToast("ייבוא צוות בוטל על-ידי המשתמש.", "info"); return; }

      if (userMatchResults && userMatchResults.length) {
        let newUserMsgs = [];
        for (const r of userMatchResults) {
          if (r.user) {
            state.users.push(r.user);
            newUserMsgs.push(`${r.staffName} ← ${r.user.username} (${r.rawPassword})`);
            recordAudit("user.create.auto", `נוצר משתמש ${r.user.username} עבור ${r.staffName} במהלך ייבוא.`, "critical", false);
          } else if (r.existingUserId) {
            const existingUser = state.users.find(u => u.id === r.existingUserId);
            if (existingUser) {
              existingUser.staffId = r.staffId;
              newUserMsgs.push(`${r.staffName} ← ${existingUser.username} (שויך)`);
              recordAudit("user.link", `שויך ${existingUser.username} ל${r.staffName} במהלך ייבוא.`, "critical", false);
            }
          }
        }
        if (newUserMsgs.length) showToast(`משתמשים שטופלו: ${newUserMsgs.join(" | ")}`, "info");
      }

      persistState();
      autoBackup();
      const newUsersCount = state.users.length - beforeUserCount + (userMatchResults || []).filter(r => r.existingUserId).length;
      addNotification(`יובא קובץ צוות: ${validRows.length} רשומות תקינות מתוך ${rows.length}. סה"כ צוות: ${state.staff.length} (לפני: ${beforeCount}). נוצרו/שויכו ${newUsersCount} משתמשים.`);
      showToast("ייבוא צוות הושלם.", "info");
    } catch (err) {
      showToast(`שגיאה בייבוא צוות: ${err.message}`, "error");
    } finally {
      staffUploadFile = null;
      btn.disabled = true;
      const sel = document.getElementById("staffFileSelected");
      if (sel) sel.textContent = "";
      const upl = document.getElementById("staffUpload");
      if (upl) upl.value = "";
    }
  });

  const meetingGroupUpload = byId("meetingGroupUpload");
  if (meetingGroupUpload) {
    meetingGroupUpload.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (!ensureUploadAllowed(file, "קובץ ישיבות")) { e.target.value = ""; return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result || "").trim();
          const records = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseCsvRows(text);
          const rows = Array.isArray(records) ? records : [];
          const validRows = rows.filter(r => r && typeof r === "object" && String(r.name || "").trim());
          if (!validRows.length) throw new Error("לא נמצאו רשומות ישיבות תקינות בקובץ");
          const approved = confirmImportPreview("ישיבות", rows.length, validRows.length);
          if (!approved) { showToast("ייבוא ישיבות בוטל.", "info"); return; }
          let imported = 0;
          validRows.forEach(row => {
            const g = {
              id: makeId("group"),
              name: String(row.name || "").trim(),
              color: String(row.color || "#0072BC").trim(),
              weeklyDay: Number.isFinite(Number(row.weeklyDay)) ? Math.min(4, Math.max(0, Number(row.weeklyDay))) : 0,
              defaultTime: String(row.defaultTime || "09:00").trim()
            };
            if (!g.name) return;
            state.meetingGroups = state.meetingGroups || [];
            const idx = state.meetingGroups.findIndex(mg => mg.name === g.name);
            if (idx >= 0) state.meetingGroups[idx] = g;
            else state.meetingGroups.push(g);
            imported++;
          });
          persistState();
          addNotification(`יובאו ${imported} קבוצות ישיבות מתוך ${rows.length} רשומות.`);
          const status = byId("meetingImportStatus");
          if (status) status.innerHTML = `<span style="color:var(--primary)">יובאו ${imported} קבוצות.</span>`;
        } catch (err) {
          showToast(`שגיאה בייבוא: ${err.message}`, "error");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  /* Export buttons */
  const exportBookingsBtn = byId("exportBookingsBtn");
  if (exportBookingsBtn) exportBookingsBtn.addEventListener("click", () => { exportBookingsCSV(); });

  const exportStaffBtn = byId("exportStaffBtn");
  if (exportStaffBtn) exportStaffBtn.addEventListener("click", () => { exportStaffCSV(); });

  const exportRoomsBtn = byId("exportRoomsBtn");
  if (exportRoomsBtn) exportRoomsBtn.addEventListener("click", () => { exportRoomsCSV(); });

  /* Request form submit */
  const requestForm = byId("requestForm");
  if (requestForm) {
    requestForm.addEventListener("submit", e => {
      e.preventDefault();
      const staff = byId("requestStaff").value.trim();
      const reason = byId("requestReason").value.trim();
      try {
        enforceMaxLength("שם איש צוות", staff, 80);
        enforceMaxLength("סיבת בקשה", reason, 500);
      } catch (err) {
        showToast(err.message, "error");
        return;
      }
      const reqStart = byId("requestStart").value;
      const reqEnd   = byId("requestEnd").value;
      const dur = timeToMin(reqEnd) - timeToMin(reqStart);
      if (!staff) { showToast("יש להזין שם איש צוות.", "error"); return; }
      if (dur < 30) { showToast("שעת הסיום חייבת להיות לאחר שעת ההתחלה.", "error"); return; }
      state.requests.unshift(normalizeRequest({
        id:        makeId("req"),
        team:      byId("requestTeam").value,
        room:      byId("requestRoom").value,
        roomId:    byId("requestRoom").value,
        day:       Number(byId("requestDay").value),
        startTime: reqStart,
        start:     reqStart,
        staff,
        duration:  dur,
        oneTime:   byId("requestOneTime").checked,
        reason:    byId("requestReason").value.trim(),
        targetEntryId: byId("requestTargetEntry")?.value || "",
        status: "pending"
      }));
      persistState();
      requestForm.reset();
      renderRequests();
      recordAudit("request.create", `${staff} · ${reason.slice(0, 80)}`, "info", false);
      addNotification("נשלחה בקשת שינוי לאישור מנהל.", true);
    });
  }

  // Session status toggle (in booking list view)
  document.getElementById("bookingListView")?.addEventListener("click", async (e) => {
    const statusBtn = e.target.closest("[data-status-action]");
    if (!statusBtn) return;
    const entryId = statusBtn.dataset.entryId;
    const newStatus = statusBtn.dataset.statusAction;
    const entry = getEntryById(entryId);
    if (!entry || !isAdmin()) return;
    entry.sessionStatus = newStatus;
    persistState();
    const { renderBookingList } = await import('../main.js');
    renderBookingList();
    renderRoomStatusStrip();
    addNotification(`סטטוס פגישה עודכן ל-${newStatus === "in-session" ? "בטיפול" : newStatus === "done" ? "הסתיים" : "לא הגיע"}.`);
  });
}
