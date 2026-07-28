/* ============================================================
   MEETINGS RENDER — DOM rendering for groups and meetings
   ============================================================ */

import {
  esc, sanitizeUrl, safeFileDisplayName, localISO,
  byId
} from '../core/index.js';
import { TEAMS } from '../core/constants.js';
import {
  state, isAdmin
} from '../core/index.js';
import { t } from '../core/i18n.js';
import {
  ensureDefaultGroups,
  getGroupById,
  getUpcomingMeetings, getPastMeetings,
  dayLabel, recurringRuleLabel,
  getStaffNamesByIds
} from './state.js';

/* ============================================================
   GROUP FILTER STATE
   ============================================================ */

let meetingGroupFilter = null;
let meetingSubTab = "upcoming";

export function setMeetingGroupFilter(val) {
  meetingGroupFilter = val;
}

let _selectedMeetings = new Set();

export function getSelectedMeetings() {
  return [..._selectedMeetings];
}

export function clearSelectedMeetings() {
  _selectedMeetings = new Set();
}

export function setMeetingSubTab(val) {
  meetingSubTab = val;
}

/* ============================================================
   GROUP RENDERING
   ============================================================ */

export function renderMeetingGroups() {
  ensureDefaultGroups();
  const tab = byId("meetingsTab");
  if (!tab) return;

  // Render into view mode, not edit mode
  const viewMode = byId("meetingsViewMode");
  let container = byId("meetingGroupsContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "meetingGroupsContainer";
    if (viewMode) {
      const meetingList = byId("meetingList");
      if (meetingList) {
        viewMode.insertBefore(container, meetingList);
      } else {
        viewMode.appendChild(container);
      }
    }
  }

  const admin = isAdmin();

  container.innerHTML = `
    <div class="section-head">
      <h3>&#x05E7;&#x05D1;&#x05D5;&#x05E6;&#x05D5;&#x05EA; &#x05D9;&#x05E9;&#x05D9;&#x05D1;&#x05D5;&#x05EA;</h3>
      ${admin ? `<button type="button" id="addGroupBtn" class="btn-sm">&#x05D4;&#x05D5;&#x05E1;&#x05E4;&#x05EA; &#x05E7;&#x05D1;&#x05D5;&#x05E6;&#x05D4;</button>` : ""}
    </div>
    <div class="admin-list">
      ${state.meetingGroups.map(g => {
        const dl = dayLabel(g.weeklyDay);
        return `<div class="admin-row">
          <div class="admin-row-info">
            <span class="group-color-dot" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${esc(g.color)};margin:0 0 0 6px;vertical-align:middle;"></span>
            <strong>${esc(g.name)}</strong>
            <span class="muted small">${g.team ? `${esc(g.team)} · ` : ""}${dl} · ${esc(g.defaultTime)}</span>
          </div>
          ${admin ? `<div class="admin-row-acts">
            <button class="btn-sm" data-action="edit-group" data-group-id="${g.id}">&#x05E2;&#x05E8;&#x05D9;&#x05DB;&#x05D4;</button>
            <button class="btn-sm danger" data-action="del-group" data-group-id="${g.id}">&#x05DE;&#x05D7;&#x05D9;&#x05E7;&#x05D4;</button>
          </div>` : ""}
        </div>`;
      }).join("") || `<p class="empty-state">&#x05D0;&#x05D9;&#x05DF; &#x05E7;&#x05D1;&#x05D5;&#x05E6;&#x05D5;&#x05EA;.</p>`}
    </div>
  `;

}

export function renderGroupForm(group = null) {
  let formContainer = byId("groupFormContainer");
  if (!formContainer) {
    const groupsContainer = byId("meetingGroupsContainer");
    if (!groupsContainer) return;
    const listEl = groupsContainer.querySelector(".admin-list");
    formContainer = document.createElement("div");
    formContainer.id = "groupFormContainer";
    if (listEl) {
      listEl.parentNode.insertBefore(formContainer, listEl.nextSibling);
    } else {
      groupsContainer.appendChild(formContainer);
    }
  }

  const isEdit = Boolean(group?.id);
  const dayOpts = [
    { key: 0, label: "&#x05E8;&#x05D0;&#x05E9;&#x05D5;&#x05DF;" },
    { key: 1, label: "&#x05E9;&#x05E0;&#x05D9;" },
    { key: 2, label: "&#x05E9;&#x05DC;&#x05D9;&#x05E9;&#x05D9;" },
    { key: 3, label: "&#x05E8;&#x05D1;&#x05D9;&#x05E2;&#x05D9;" },
    { key: 4, label: "&#x05D7;&#x05DE;&#x05D9;&#x05E9;&#x05D9;" }
  ];
  const timeOpts = Array.from({ length: 24 }, (_, i) => {
    const h = String(i + 1).padStart(2, "0");
    const m = i % 2 === 0 ? "00" : "30";
    return `${h}:${m}`;
  });

  formContainer.innerHTML = `
    <form id="groupForm" class="grid-form" style="margin-top:.5rem;">
      <input type="hidden" id="groupFormId" value="${esc(group?.id || "")}" />
      <label>&#x05E9;&#x05DD; &#x05D4;&#x05E7;&#x05D1;&#x05D5;&#x05E6;&#x05D4; <input id="groupFormName" value="${esc(group?.name || "")}" required /></label>
      <label>&#x05E6;&#x05D1;&#x05E2; <input id="groupFormColor" type="color" value="${esc(group?.color || "#0072BC")}" /></label>
      <label>&#x05E6;&#x05D5;&#x05D5;&#x05EA;
        <select id="groupFormTeam">
          <option value="">&#x05DC;&#x05DC;&#x05D0;</option>
          ${TEAMS.map(team => `<option value="${esc(team)}"${group?.team === team ? " selected" : ""}>${esc(team)}</option>`).join("")}
        </select>
      </label>
      <label>&#x05D9;&#x05D5;&#x05DD; &#x05E9;&#x05D1;&#x05D5;&#x05E2;&#x05D9;
        <select id="groupFormDay">
          ${dayOpts.map(d => `<option value="${d.key}"${(group?.weeklyDay ?? 0) === d.key ? " selected" : ""}>${d.label}</option>`).join("")}
        </select>
      </label>
      <label>&#x05E9;&#x05E2;&#x05EA; &#x05D1;&#x05E8;&#x05D9;&#x05E8;&#x05EA; &#x05DE;&#x05D7;&#x05D3;&#x05DC;
        <select id="groupFormTime">
          ${timeOpts.map(t => `<option value="${t}"${(group?.defaultTime || "09:00") === t ? " selected" : ""}>${t}</option>`).join("")}
        </select>
      </label>
      <div style="display:flex;gap:.5rem;">
        <button type="submit" class="btn-sm">${isEdit ? "&#x05E2;&#x05D3;&#x05DB;&#x05D5;&#x05DF;" : "&#x05D4;&#x05D5;&#x05E1;&#x05E4;&#x05D4;"}</button>
        ${isEdit ? `<button type="button" id="groupFormCancelBtn" class="btn-sm secondary">&#x05D1;&#x05D9;&#x05D8;&#x05D5;&#x05DC;</button>` : ""}
      </div>
    </form>
  `;

  formContainer.classList.toggle("hidden", false);
}

/* ============================================================
   MEETING FORM INJECTION
   ============================================================ */

export function renderMeetingForm(meeting = null) {
  ensureDefaultGroups();
  const form = byId("meetingForm");
  if (!form) return;

  const isEdit = Boolean(meeting?.id);
  let editIdEl = byId("meetingEditId");
  if (!editIdEl) {
    editIdEl = document.createElement("input");
    editIdEl.type = "hidden";
    editIdEl.id = "meetingEditId";
    form.insertBefore(editIdEl, form.firstChild);
  }
  editIdEl.value = meeting?.id || "";

  byId("meetingSpeaker").value = meeting?.speaker || "";

  let titleInput = byId("meetingTitle");
  if (!titleInput) {
    const speakerLabel = byId("meetingSpeaker")?.closest("label");
    const titleLabel = document.createElement("label");
    titleLabel.innerHTML = '&#x05DB;&#x05D5;&#x05EA;&#x05E8;&#x05EA; <input id="meetingTitle" />';
    titleInput = titleLabel.querySelector("input");
    if (speakerLabel?.parentNode) {
      speakerLabel.parentNode.insertBefore(titleLabel, speakerLabel);
    }
  }
  if (titleInput) titleInput.value = meeting?.title || "";

  let groupChecks = byId("meetingGroupChecks");
  if (!groupChecks) {
    const meetingTeamLabel = byId("meetingTeam")?.closest("label");
    groupChecks = document.createElement("fieldset");
    groupChecks.className = "full";
    groupChecks.id = "meetingGroupChecks";
    groupChecks.innerHTML = `<legend>קבוצות</legend>`;
    if (meetingTeamLabel?.parentNode) {
      meetingTeamLabel.parentNode.insertBefore(groupChecks, meetingTeamLabel.nextSibling);
    }
  }

  const selectedIds = meeting?.groupIds || [];

  const teamSel = byId("meetingTeam");
  const recurringSel = byId("meetingRecurring");

  const renderGroupChecks = () => {
    const selectedTeam = teamSel?.value || "";
    const recurringRule = recurringSel?.value || "";
    const restrictByTeam = Boolean(recurringRule && selectedTeam);
    const availableGroups = restrictByTeam
      ? state.meetingGroups.filter(g => g.team === selectedTeam)
      : state.meetingGroups;

    groupChecks.innerHTML = `<legend>&#x05E7;&#x05D1;&#x05D5;&#x05E6;&#x05D5;&#x05EA;</legend>${availableGroups.map(g => `
      <label class="chip${selectedIds.includes(g.id) ? " chip-active" : ""}" style="display:inline-flex;align-items:center;gap:4px;margin:2px;">
        <input type="checkbox" name="meetingGroupIds" value="${esc(g.id)}"${selectedIds.includes(g.id) ? " checked" : ""} />
        <span class="group-color-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(g.color)};"></span>
        <span>${esc(g.name)}</span>
      </label>
    `).join("")}${restrictByTeam && !availableGroups.length ? '<p class="muted small">אין קבוצות משויכות לצוות שנבחר.</p>' : ''}`;
  };

  let durationEl = byId("meetingDuration");
  if (!durationEl) {
    const timeLabel = byId("meetingTime").closest("label");
    durationEl = document.createElement("label");
    durationEl.innerHTML = '&#x05DE;&#x05E9;&#x05DA; (&#x05D3;&#x05E7;&#x05D5;&#x05EA;) <input id="meetingDuration" type="number" min="15" step="15" value="60" />';
    if (timeLabel?.parentNode) {
      timeLabel.parentNode.insertBefore(durationEl, timeLabel.nextSibling);
    }
  }
  byId("meetingDuration").value = String(meeting?.duration || 60);

  let recurringEl = byId("meetingRecurring");
  if (!recurringEl) {
    const durLabel = byId("meetingDuration").closest("label");
    recurringEl = document.createElement("label");
    recurringEl.innerHTML = `&#x05D7;&#x05D6;&#x05E8;&#x05EA;&#x05D9;&#x05D5;&#x05EA;
      <select id="meetingRecurring">
        <option value="">&#x05D7;&#x05D3;-&#x05E4;&#x05E2;&#x05DE;&#x05D9;&#x05EA;</option>
        <option value="weekly">&#x05E9;&#x05D1;&#x05D5;&#x05E2;&#x05D9;&#x05EA;</option>
        <option value="biweekly">&#x05D3;&#x05D5;-&#x05E9;&#x05D1;&#x05D5;&#x05E2;&#x05D9;&#x05EA;</option>
        <option value="monthly-first">&#x05D7;&#x05D5;&#x05D3;&#x05E9;&#x05D9;&#x05EA; (&#x05E8;&#x05D0;&#x05E9;&#x05D5;&#x05E0;&#x05D4;)</option>
        <option value="monthly-nth">&#x05D7;&#x05D5;&#x05D3;&#x05E9;&#x05D9;&#x05EA;</option>
      </select>`;
    if (durLabel?.parentNode) {
      durLabel.parentNode.insertBefore(recurringEl, durLabel.nextSibling);
    }
  }
  byId("meetingRecurring").value = meeting?.recurringRule || "";

  byId("meetingDate").value = meeting?.date || localISO(new Date());
  byId("meetingTime").value = meeting?.time || "09:00";
  byId("meetingAgenda").value = meeting?.agenda || "";
  byId("meetingLink").value = meeting?.link || "";

  if (teamSel) {
    teamSel.innerHTML = '<option value="">ללא</option>' + TEAMS.map(t => `<option value="${t}"${meeting?.team === t ? ' selected' : ''}>${t}</option>`).join("");
    teamSel.onchange = () => renderGroupChecks();
  }

  recurringSel.onchange = () => renderGroupChecks();
  renderGroupChecks();

  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) submitBtn.textContent = isEdit ? "&#x05E2;&#x05D3;&#x05DB;&#x05D5;&#x05DF;" : "&#x05E9;&#x05DE;&#x05D9;&#x05E8;&#x05D4;";

  let cancelBtn = byId("meetingFormCancel");
  if (isEdit && !cancelBtn) {
    cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.id = "meetingFormCancel";
    cancelBtn.className = "btn-sm secondary";
    cancelBtn.textContent = "&#x05D1;&#x05D9;&#x05D8;&#x05D5;&#x05DC;";
    if (submitBtn) submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
  }
  if (!isEdit && cancelBtn) {
    cancelBtn.remove();
  }
}

/* ============================================================
   MEETING TIMELINE (replaces renderMeetingsList)
   ============================================================ */

const RECURRING_PARENT_RULES = ["weekly", "biweekly", "monthly-first", "monthly-nth"];

export function renderMeetingTimeline() {
  const list = byId("meetingList");
  if (!list) return;

  ensureDefaultGroups();

  const upcoming = getUpcomingMeetings();
  const past = getPastMeetings();
  const admin = isAdmin();

  const groupMap = {};
  (state.meetingGroups || []).forEach(g => { groupMap[g.id] = g; });

  const renderGroupBadges = (groupIds) => (groupIds || []).map(gid => {
    const g = groupMap[gid];
    return `<span class="mt-badge" style="background:${esc(g?.color || "#ccc")}20;color:${esc(g?.color || "#666")}">${esc(g?.name || gid)}</span>`;
  }).join("");

  const renderGroupFilterChips = () => {
    const groups = state.meetingGroups || [];
    return groups.map(g => {
      const active = meetingGroupFilter === g.id;
      return `<button type="button" class="chip ${active ? "chip-active" : ""}" data-meeting-group-filter="${g.id}">
        <span class="group-color-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(g.color)};margin-left:4px;vertical-align:middle;"></span>
        ${esc(g.name)}
      </button>`;
    }).join("");
  };

  const renderCard = (m) => {
    const [y, mo, d] = (m.date || "").split("-");
    const dateStr = d && mo ? `${d}/${mo}` : "";
    const isJoint = (m.groupIds || []).length > 1;
    return `
    <div class="mt-card" data-meeting-id="${m.id}">
      ${admin ? `<input type="checkbox" class="meeting-select-cb" data-select-meeting="${m.id}" />` : ''}
      <div class="mt-time">${esc(m.time)}${dateStr ? `<span class="mt-date-chip">${dateStr}</span>` : ""}</div>
      <div class="mt-body">
        <div class="mt-title">${esc(m.title || m.speaker)}</div>
        <div class="mt-speaker">${esc(m.staffIds?.length ? getStaffNamesByIds(m.staffIds).join(", ") : m.speaker)} · ${m.duration} &#x05D3;&#x05E7;׳</div>
        <div class="mt-badges">${isJoint ? '<span class="mt-badge" style="background:var(--primary)20;color:var(--primary)">&#x05DE;&#x05E9;&#x05D5;&#x05EA;&#x05E4;&#x05EA;</span>' : renderGroupBadges(m.groupIds)}</div>
        ${RECURRING_PARENT_RULES.includes(m.recurringRule) ? `<div class="mt-recur">&#x1F501; &#x05EA;&#x05D1;&#x05E0;&#x05D9;&#x05EA; — ${recurringRuleLabel(m.recurringRule)}</div>` : ''}
        ${m.agenda ? `<div class="mt-recur">${esc(m.agenda.substring(0, 120))}${m.agenda.length > 120 ? "..." : ""}</div>` : ''}
      </div>
      ${admin ? `<div style="display:flex;gap:.25rem;align-items:center"><button class="btn-sm" data-action="edit-meeting" data-meeting-id="${m.id}">&#x05E2;&#x05E8;&#x05D9;&#x05DB;&#x05D4;</button><button class="btn-sm secondary" data-action="del-meeting" data-meeting-id="${m.id}">&#x05DE;&#x05D7;&#x05D9;&#x05E7;&#x05D4;</button></div>` : ''}
    </div>`;
  };

  const filteredUpcoming = meetingGroupFilter
    ? upcoming.filter(m => (m.groupIds || []).includes(meetingGroupFilter))
    : upcoming;
  const filteredPast = meetingGroupFilter
    ? past.filter(m => (m.groupIds || []).includes(meetingGroupFilter))
    : past;

  let html = '';

  html += `<div class="meeting-sub-tabs" style="display:flex;gap:.5rem;margin-bottom:.75rem">
    <button type="button" class="chip ${meetingSubTab === "upcoming" ? "chip-active" : ""}" data-meeting-sub-tab="upcoming">ישיבות קרובות</button>
    <button type="button" class="chip ${meetingSubTab === "past" ? "chip-active" : ""}" data-meeting-sub-tab="past">ישיבות שהתקיימו</button>
    <button type="button" class="chip ${meetingSubTab === "groups" ? "chip-active" : ""}" data-meeting-sub-tab="groups">קבוצות</button>
  </div>`;

  if (meetingSubTab === "groups") {
    html += `<div class="admin-list">
      ${(state.meetingGroups || []).map(g => {
        const dl = dayLabel(g.weeklyDay);
        return `<div class="admin-row">
          <div class="admin-row-info">
            <span class="group-color-dot" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${esc(g.color)};margin:0 0 0 6px;vertical-align:middle;"></span>
            <strong>${esc(g.name)}</strong>
            <span class="muted small">${g.team ? `${esc(g.team)} · ` : ""}${dl} · ${esc(g.defaultTime)}</span>
          </div>
          ${admin ? `<div class="admin-row-acts">
            <button class="btn-sm" data-action="edit-group" data-group-id="${g.id}">עריכה</button>
            <button class="btn-sm danger" data-action="del-group" data-group-id="${g.id}">מחיקה</button>
          </div>` : ""}
        </div>`;
      }).join("") || `<p class="empty-state">אין קבוצות.</p>`}
    </div>`;
  } else {
    html += `<div class="meeting-group-filters">
      <button type="button" class="chip ${!meetingGroupFilter ? "chip-active" : ""}" data-meeting-group-filter="">הכל</button>
      ${renderGroupFilterChips()}
    </div>`;

    if (meetingSubTab === "upcoming") {
      if (filteredUpcoming.length) {
        html += `<div class="meeting-bulk-bar" style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem;${admin ? '' : 'display:none'}">
          <button type="button" class="btn-sm secondary" data-action="select-all-meetings">בחר הכל</button>
          <button type="button" class="btn-sm secondary" data-action="deselect-all-meetings">בטל בחירה</button>
          <button type="button" class="btn-sm danger" data-action="del-selected-meetings" style="margin-right:auto">מחק נבחרים</button>
        </div>`;
        html += `<h3>ישיבות קרובות</h3><div class="meeting-timeline">${filteredUpcoming.map(renderCard).join("")}</div>`;
      } else {
        html += `<p class="empty-state">אין ישיבות קרובות.</p>`;
      }
    } else {
      const allFilteredPast = meetingGroupFilter
        ? past.filter(m => (m.groupIds || []).includes(meetingGroupFilter))
        : past;
      if (allFilteredPast.length) {
        html += `<h3>ישיבות שהתקיימו (${allFilteredPast.length})</h3><div class="meeting-timeline">${allFilteredPast.map(renderCard).join("")}</div>`;
      } else {
        html += `<p class="empty-state">אין ישיבות שהתקיימו.</p>`;
      }
    }
  }

  list.innerHTML = html;
}

/* ============================================================
   REFRESH
   ============================================================ */

export function renderAllMeetings() {
  renderMeetingGroups();
  renderMeetingTimeline();
}

export function showMeetingInfoDialog(meeting) {
  const [y, mo, d] = (meeting.date || "").split("-");
  const dateStr = d && mo ? `${d}/${mo}/${y}` : meeting.date || "—";
  const speaker = meeting.speaker || "—";
  const agenda = meeting.agenda || "—";
  const link = meeting.link || "";
  const files = (meeting.files || []).length ? meeting.files.join(", ") : "—";
  const duration = meeting.duration || 60;
  const time = meeting.time || "—";
  const groups = (meeting.groupIds || [])
    .map(gid => (state.meetingGroups || []).find(g => g.id === gid)?.name || gid)
    .join(", ") || "—";

  const existing = document.getElementById("meetingInfoDialog");
  if (existing) existing.remove();

  const dialog = document.createElement("dialog");
  dialog.id = "meetingInfoDialog";
  dialog.style.cssText = "padding:0;border:none;border-radius:12px;box-shadow:0 32px 80px rgba(15,23,42,.32);max-width:480px;width:90vw;background:var(--surface-2);";
  dialog.innerHTML = `
    <div class="dialog-head">
      <h3>${esc(meeting.title || t("meetings.title"))}</h3>
      <button type="button" class="dialog-close-btn" aria-label="סגור" id="meetingInfoClose">✕</button>
    </div>
    <div class="dialog-body" style="display:grid;gap:.6rem;font-size:.9rem">
      <div><strong>📅 ${t("meeting.info.date")}:</strong> ${esc(dateStr)} · ${esc(time)} (${duration} ${t("meeting.duration")})</div>
      <div><strong>👤 ${t("meeting.info.speaker")}:</strong> ${esc(speaker)}</div>
      <div><strong>👥 ${t("meeting.info.group")}:</strong> ${esc(groups)}</div>
      <div><strong>📋 ${t("meeting.info.agenda")}:</strong> ${esc(agenda)}</div>
      ${link ? `<div><strong>🔗 ${t("meeting.info.link")}:</strong> <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a></div>` : ""}
      <div><strong>📎 ${t("meeting.info.files")}:</strong> ${esc(files)}</div>
    </div>
    <div class="dialog-footer">
      <button type="button" class="secondary" id="meetingInfoClose2">${t("common.close")}</button>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();
  dialog.querySelector("#meetingInfoClose")?.addEventListener("click", () => { dialog.close(); dialog.remove(); });
  dialog.querySelector("#meetingInfoClose2")?.addEventListener("click", () => { dialog.close(); dialog.remove(); });
  dialog.addEventListener("click", e => { if (e.target === dialog) { dialog.close(); dialog.remove(); } });
}
