/* ============================================================
   MEETINGS EVENTS — DOM event binding for meetings module
   ============================================================ */

import {
  sanitizeUrl, stripHtml, safeFileDisplayName, localISO,
  showToast, byId, enforceMaxLength
} from '../core/index.js';
import {
  state, isAdmin
} from '../core/index.js';
import {
  ensureDefaultGroups,
  createGroup, updateGroup, deleteGroup,
  createMeeting, updateMeeting, deleteMeeting,
  deleteMeetingsByGroup, deleteSelectedMeetings,
  importMeetingsFromFile, exportMeetingsCSV
} from './state.js';
import {
  renderMeetingGroups, renderGroupForm,
  renderMeetingForm, renderAllMeetings,
  setMeetingGroupFilter, renderMeetingTimeline,
  setMeetingSubTab, showMeetingInfoDialog
} from './render.js';

/* ============================================================
   INIT
   ============================================================ */

export function initMeetingsEvents() {
  ensureDefaultGroups();

  bindGroupForm();
  bindMeetingForm();
  bindMeetingUpload();
  bindExportBtn();
  bindDelegatedClicks();
  bindMeetingFormCancel();

  renderAllMeetings();
}

/* ============================================================
   GROUP FORM
   ============================================================ */

function bindGroupForm() {
  document.addEventListener("submit", e => {
    const form = e.target;
    if (form.id !== "groupForm") return;
    e.preventDefault();

    const id = form.querySelector("#groupFormId")?.value || "";
    const name = form.querySelector("#groupFormName")?.value || "";
    const color = form.querySelector("#groupFormColor")?.value || "#0072BC";
    const weeklyDay = Number(form.querySelector("#groupFormDay")?.value || 0);
    const defaultTime = form.querySelector("#groupFormTime")?.value || "09:00";

    if (!name.trim()) {
      showToast("יש להזין שם קבוצה.", "error");
      return;
    }

    if (id) {
      updateGroup(id, { name, color, weeklyDay, defaultTime });
      showToast(`הקבוצה "${name}" עודכנה.`, "info");
    } else {
      createGroup({ name, color, weeklyDay, defaultTime });
      showToast(`נוספה קבוצה "${name}".`, "info");
    }

    hideGroupForm();
    renderAllMeetings();
  });
}

function hideGroupForm() {
  const container = byId("groupFormContainer");
  if (container) container.classList.add("hidden");
}

/* ============================================================
   MEETING FORM
   ============================================================ */

function bindMeetingForm() {
  const form = byId("meetingForm");
  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();

    const editId = byId("meetingEditId")?.value || "";

    try {
      enforceMaxLength("שם דובר", byId("meetingSpeaker").value, 80);
      const titleEl = byId("meetingTitle");
      if (titleEl) enforceMaxLength("כותרת", titleEl.value, 120);
      enforceMaxLength("נושאים וסדר יום", byId("meetingAgenda").value.trim(), 800);
      enforceMaxLength("קישור", byId("meetingLink").value.trim(), 300);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }

    const rawLink = byId("meetingLink").value.trim();
    const safeLink = sanitizeUrl(rawLink);
    if (rawLink && !safeLink) {
      showToast("קישור לא חוקי - יש להזין כתובת URL תקינה.", "error");
      return;
    }

    const groupChecks = byId("meetingGroupChecks")?.querySelectorAll("input[name='meetingGroupIds']:checked") || [];
    const groupIds = [...groupChecks].map(cb => cb.value);

    const staffCheckboxes = document.querySelectorAll("#meetingForm input[name='meetingStaff']:checked");
    const staffIds = Array.from(staffCheckboxes).map(cb => cb.value);

    const formData = {
      speaker: byId("meetingSpeaker").value,
      title: byId("meetingTitle")?.value || "",
      groupIds,
      staffIds,
      date: byId("meetingDate").value,
      time: byId("meetingTime").value,
      duration: Number(byId("meetingDuration")?.value || 60),
      agenda: stripHtml(byId("meetingAgenda").value.trim()),
      link: safeLink,
      files: [...byId("meetingFiles").files].map(f => safeFileDisplayName(f.name)),
      recurringRule: byId("meetingRecurring")?.value || null
    };

    if (editId) {
      updateMeeting(editId, formData);
      showToast("ישיבה עודכנה.", "info");
    } else {
      createMeeting(formData);
      showToast("ישיבה נוספה.", "info");
    }

    resetMeetingForm();
    renderAllMeetings();
  });
}

function resetMeetingForm() {
  const form = byId("meetingForm");
  if (!form) return;
  form.reset();
  const editIdEl = byId("meetingEditId");
  if (editIdEl) editIdEl.value = "";
  const titleEl = byId("meetingTitle");
  if (titleEl) titleEl.value = "";
  const durationEl = byId("meetingDuration");
  if (durationEl) durationEl.value = "60";
  const recurringEl = byId("meetingRecurring");
  if (recurringEl) recurringEl.value = "";
  const dateEl = byId("meetingDate");
  if (dateEl) dateEl.value = localISO(new Date());
  const timeEl = byId("meetingTime");
  if (timeEl) timeEl.value = "09:00";
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.textContent = "שמירה";
  const cancelBtn = byId("meetingFormCancel");
  if (cancelBtn) cancelBtn.remove();
}

function bindMeetingFormCancel() {
  document.addEventListener("click", e => {
    if (e.target.id === "meetingFormCancel" || e.target.id === "groupFormCancelBtn") {
      if (e.target.id === "meetingFormCancel") resetMeetingForm();
      if (e.target.id === "groupFormCancelBtn") hideGroupForm();
    }
  });
}

/* ============================================================
   UPLOAD
   ============================================================ */

function bindMeetingUpload() {
  const input = byId("meetingUpload");
  if (!input) return;
  input.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    importMeetingsFromFile(file);
    e.target.value = "";
    renderAllMeetings();
  });
}

/* ============================================================
   EXPORT
   ============================================================ */

function bindExportBtn() {
  const btn = byId("exportMeetingsBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    exportMeetingsCSV();
  });
}

/* ============================================================
   DELEGATED CLICKS (group & meeting actions)
   ============================================================ */

function bindDelegatedClicks() {
  const tab = byId("meetingsTab");
  if (!tab) return;

  tab.addEventListener("click", e => {
    const filterBtn = e.target.closest("[data-meeting-group-filter]");
    if (filterBtn) {
      const gid = filterBtn.dataset.meetingGroupFilter;
      setMeetingGroupFilter(gid || null);
      renderMeetingTimeline();
      return;
    }

    const subTabBtn = e.target.closest("[data-meeting-sub-tab]");
    if (subTabBtn) {
      const subtab = subTabBtn.dataset.meetingSubTab;
      setMeetingSubTab(subtab);
      renderMeetingTimeline();
      return;
    }

    const goDateBtn = e.target.closest("[data-go-to-date]");
    if (goDateBtn) {
      const date = goDateBtn.dataset.goToDate;
      state.weekISO = date;
      state.activeDay = new Date(date + "T00:00:00").getDay();
      import('../calendar/state.js').then(m => m.ensureSyncedScheduleWindow());
      import('../main.js').then(m => { m.showTab("dashboardTab"); m.renderActiveTab(); });
      return;
    }

    const meetingCard = e.target.closest(".mt-card[data-meeting-id]");
    if (meetingCard && !e.target.closest("button, input")) {
      const mid = meetingCard.dataset.meetingId;
      const meeting = state.meetings.find(m => m.id === mid);
      if (meeting) showMeetingInfoDialog(meeting);
      return;
    }

    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const groupId = btn.dataset.groupId;
    const meetingId = btn.dataset.meetingId;

    switch (action) {
      case "add-group":
        renderGroupForm();
        break;

      case "edit-group":
        editGroupHandler(groupId);
        break;

      case "del-group":
        deleteGroupHandler(groupId);
        break;

      case "edit-meeting":
        editMeetingHandler(meetingId);
        break;

      case "del-meeting":
        deleteMeetingHandler(meetingId);
        break;

      case "select-all-meetings":
        document.querySelectorAll('[data-select-meeting]').forEach(cb => cb.checked = true);
        break;

      case "deselect-all-meetings":
        document.querySelectorAll('[data-select-meeting]').forEach(cb => cb.checked = false);
        break;

      case "del-selected-meetings":
        bulkDeleteHandler();
        break;
    }
  });

  document.addEventListener("click", e => {
    if (e.target.id === "addGroupBtn") {
      renderGroupForm();
    }
  });
}


function editGroupHandler(groupId) {
  const group = state.meetingGroups.find(g => g.id === groupId);
  if (!group) return;
  renderGroupForm(group);
}

function bulkDeleteHandler() {
  const selected = [];
  document.querySelectorAll('[data-select-meeting]:checked').forEach(cb => {
    selected.push(cb.dataset.selectMeeting);
  });
  if (!selected.length) {
    showToast("לא נבחרו ישיבות למחיקה.", "warn");
    return;
  }
  if (!confirm(`למחוק ${selected.length} ישיבות נבחרות?`)) return;
  const count = deleteSelectedMeetings(selected);
  renderAllMeetings();
  showToast(`נמחקו ${count} ישיבות.`, "info");
}

function deleteGroupHandler(groupId) {
  const group = state.meetingGroups.find(g => g.id === groupId);
  if (!group) return;
  const meetingCount = (state.meetings || []).filter(m => (m.groupIds || []).includes(groupId)).length;
  let shouldDeleteMeetings = false;
  if (meetingCount > 0) {
    shouldDeleteMeetings = confirm(`למחוק את הקבוצה "${group.name}"?\n\n${meetingCount} ישיבות משויכות. למחוק גם את כל הישיבות בקבוצה?\n\nאישור = מחיקת קבוצה + ישיבות\nביטול = ביטול`);
  } else {
    if (!confirm(`למחוק את הקבוצה "${group.name}"?`)) return;
  }
  if (shouldDeleteMeetings) {
    deleteMeetingsByGroup(groupId);
  }
  deleteGroup(groupId);
  hideGroupForm();
  renderAllMeetings();
  showToast(shouldDeleteMeetings ? `הקבוצה ו-${meetingCount} ישיבות נמחקו.` : `הקבוצה "${group.name}" נמחקה.`, "info");
}

function editMeetingHandler(meetingId) {
  const meeting = state.meetings.find(m => m.id === meetingId);
  if (!meeting) return;
  byId("meetingsViewMode")?.classList.add("hidden");
  byId("meetingsEditMode")?.classList.remove("hidden");
  renderMeetingForm(meeting);
  const submitBtn = byId("meetingForm")?.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.textContent = "עדכון";
}

function deleteMeetingHandler(meetingId) {
  const meeting = state.meetings.find(m => m.id === meetingId);
  if (!meeting || !confirm(`למחוק את הישיבה "${meeting.title || meeting.speaker}"?`)) return;
  deleteMeeting(meetingId);
  renderAllMeetings();
  showToast("ישיבה נמחקה.", "info");
}
