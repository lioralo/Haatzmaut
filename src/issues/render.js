/* ============================================================
   ISSUES – rendering
   ============================================================ */

import {
  state,
  isAdmin,
  getStaffById
} from '../core/store.js';
import { getRoomName } from '../calendar/state.js';
import { byId, esc, safeRender } from '../core/utils.js';
import {
  ISSUE_TYPES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  VALID_TRANSITIONS
} from './state.js';

/* ============================================================
   FILTER STATE (exported for events.js)
   ============================================================ */

export let filterStatus = "";
export let filterPriority = "";
export let filterRoom = "";
export let expandedIssueId = "";

export function setFilter(filter, val) {
  if (filter === "status") filterStatus = val;
  if (filter === "priority") filterPriority = val;
  if (filter === "room") filterRoom = val;
  expandedIssueId = "";
}

export function setExpanded(id) {
  expandedIssueId = id;
}

/* ============================================================
   HELPERS
   ============================================================ */

function filteredIssues() {
  const currentStaffId = state.currentUser?.staffId || "";
  return state.issues.filter(i => {
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterPriority && i.priority !== filterPriority) return false;
    if (filterRoom && i.roomId !== filterRoom) return false;
    if (state.issueFilter === "mine" && i.assignedTo !== currentStaffId) return false;
    if (state.issueFilter === "unassigned" && i.assignedTo) return false;
    return true;
  });
}

/* ============================================================
   ISSUES BOARD — KANBAN
   ============================================================ */

export function renderIssuesBoard() {
  safeRender(() => {
    const box = byId("issueQueue");
    if (!box) return;

    const issues = filteredIssues();
    const roomOptions = ["", ...new Set(state.issues.filter(i => i.roomId).map(i => i.roomId))];

    const columns = ["new", "in_progress", "resolved", "closed"];

    const renderCard = (issue) => {
      const ms = Date.now() - new Date(issue.createdAt.split('/').reverse().join('-')).getTime();
      const daysAgo = Math.max(0, Math.floor(ms / 86400000));
      const canComplete = issue.status === "in_progress";
      return `
        <div class="kanban-card" draggable="true" data-issue-id="${issue.id}">
          <div class="kc-room">${esc(issue.roomId ? getRoomName(issue.roomId) : (issue.room || "כללי"))}</div>
          <div>${esc(issue.details.substring(0, 60))}${issue.details.length > 60 ? "..." : ""}</div>
          <div class="kc-meta">
            <span>${ISSUE_TYPES[issue.type] || issue.type}</span>
            <span>${PRIORITY_LABELS[issue.priority] || issue.priority}</span>
            ${issue.assignedTo ? `<span>&#x1F4CC; ${esc(getStaffById(issue.assignedTo)?.fullName || issue.assignedTo)}</span>` : ""}
          </div>
          <div class="kc-meta" style="margin-top:.2rem">&#x05DC;&#x05E4;&#x05E0;&#x05D9; ${daysAgo} &#x05D9;&#x05DE;&#x05D9;&#x05DD;</div>
          <div style="display:flex;gap:.25rem;margin-top:.3rem">
            <button class="btn-sm" data-action="expand" data-issue-id="${issue.id}">&#x05E4;&#x05E8;&#x05D8;&#x05D9;&#x05DD;</button>
            ${canComplete ? `<button class="btn-sm" data-action="quick-complete" data-issue-id="${issue.id}">&#x05D4;&#x05E9;&#x05DC;&#x05DD; &#x05D8;&#x05D9;&#x05E4;&#x05D5;&#x05DC;</button>` : ""}
          </div>
        </div>`;
    };

    box.innerHTML = `
      <div class="issues-filters">
        <div class="filter-group">
          <span class="filter-label">&#x05E1;&#x05D8;&#x05D8;&#x05D5;&#x05E1;:</span>
          <button class="chip ${filterStatus === "" ? "chip-active" : ""}" data-filter="status" data-val="">&#x05D4;&#x05DB;&#x05DC;</button>
          ${Object.entries(STATUS_LABELS).map(([k, v]) =>
            `<button class="chip ${filterStatus === k ? "chip-active" : ""}" data-filter="status" data-val="${k}">${esc(v)}</button>`
          ).join("")}
        </div>
        <div class="filter-group">
          <span class="filter-label">&#x05D3;&#x05D7;&#x05D9;&#x05E4;&#x05D5;&#x05EA;:</span>
          <button class="chip ${filterPriority === "" ? "chip-active" : ""}" data-filter="priority" data-val="">&#x05D4;&#x05DB;&#x05DC;</button>
          ${Object.entries(PRIORITY_LABELS).map(([k, v]) =>
            `<button class="chip ${filterPriority === k ? "chip-active" : ""}" data-filter="priority" data-val="${k}">${esc(v)}</button>`
          ).join("")}
        </div>
        <div class="filter-group">
          <span class="filter-label">&#x05D7;&#x05D3;&#x05E8;:</span>
          ${roomOptions.map(rid =>
            `<button class="chip ${filterRoom === rid ? "chip-active" : ""}" data-filter="room" data-val="${rid}">${rid ? esc(getRoomName(rid)) : "&#x05D4;&#x05DB;&#x05DC;"}</button>`
          ).join("")}
        </div>
        <div class="filter-group" style="margin-right:auto">
          <button class="chip ${state.issueFilter === "all" ? "chip-active" : ""}" data-issue-filter="all">&#x05D4;&#x05DB;&#x05DC;</button>
          <button class="chip ${state.issueFilter === "mine" ? "chip-active" : ""}" data-issue-filter="mine">&#x05E9;&#x05DC;&#x05D9;</button>
          <button class="chip ${state.issueFilter === "unassigned" ? "chip-active" : ""}" data-issue-filter="unassigned">&#x05DC;&#x05DC;&#x05D0; &#x05E9;&#x05D9;&#x05D5;&#x05DA;</button>
        </div>
      </div>
      <div class="quick-report-bar">
        <button type="button" class="chip" data-quick-report="room">&#x05EA;&#x05E7;&#x05DC;&#x05D4; &#x05D1;&#x05D7;&#x05D3;&#x05E8;</button>
        <button type="button" class="chip" data-quick-report="equipment">&#x05EA;&#x05E7;&#x05DC;&#x05EA; &#x05E6;&#x05D9;&#x05D5;&#x05D3;</button>
        <button type="button" class="chip" data-quick-report="safety">&#x05DE;&#x05E4;&#x05D2;&#x05E2; &#x05D1;&#x05D8;&#x05D9;&#x05D7;&#x05D5;&#x05EA;</button>
        <button type="button" class="chip" data-quick-report="clean">&#x05E0;&#x05D9;&#x05E7;&#x05D9;&#x05D5;&#x05DF;</button>
      </div>
      <div class="kanban-board">
        ${columns.map(st => `
          <div class="kanban-column">
            <h4>${STATUS_LABELS[st]}</h4>
            <div class="kanban-cards" data-status="${st}">
              ${issues.filter(i => i.status === st).map(renderCard).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;

    if (expandedIssueId) {
      const issue = state.issues.find(i => i.id === expandedIssueId);
      if (issue) renderIssueDetail(issue);
    }
  }, "issuesBoard");
}

/* ============================================================
   ISSUE DETAIL
   ============================================================ */

export function renderIssueDetail(issue) {
  const id = typeof issue === "string" ? issue : issue.id;
  const iss = typeof issue === "string" ? state.issues.find(i => i.id === id) : issue;
  if (!iss) return;

  const detailEl = byId(`issueDetail-${iss.id}`);
  if (!detailEl) {
    expandedIssueId = iss.id;
    renderIssuesBoard();
    return;
  }

  const roomName = iss.roomId ? getRoomName(iss.roomId) : (iss.room || "כללי");
  const staff = iss.assignedTo ? getStaffById(iss.assignedTo) : null;
  const sortedComments = [...(iss.comments || [])].reverse();
  const allowedTransitions = VALID_TRANSITIONS[iss.status] || [];

  detailEl.innerHTML = `
    <div class="detail-body">
      <div class="detail-meta">
        <div><strong>&#x05D7;&#x05D3;&#x05E8;:</strong> ${esc(roomName)}</div>
        <div><strong>&#x05E1;&#x05D5;&#x05D2;:</strong> ${esc(ISSUE_TYPES[iss.type])}</div>
        <div><strong>&#x05D3;&#x05D7;&#x05D9;&#x05E4;&#x05D5;&#x05EA;:</strong> ${esc(PRIORITY_LABELS[iss.priority])}</div>
        <div><strong>&#x05E1;&#x05D8;&#x05D8;&#x05D5;&#x05E1;:</strong> ${esc(STATUS_LABELS[iss.status])}</div>
        <div><strong>&#x05D3;&#x05D5;&#x05D5;&#x05D7; &#x05E2;&#x05DC; &#x05D9;&#x05D3;&#x05D9;:</strong> ${esc(iss.reportedBy)}</div>
        <div><strong>&#x05D3;&#x05D5;&#x05D5;&#x05D7; &#x05D1;:</strong> ${esc(iss.createdAt)}</div>
        <div><strong>&#x05E2;&#x05D5;&#x05D3;&#x05DB;&#x05DF;:</strong> ${esc(iss.updatedAt)}</div>
        ${staff ? `<div><strong>&#x05DE;&#x05E9;&#x05D5;&#x05D9;&#x05DA; &#x05DC;:</strong> ${esc(staff.fullName)}</div>` : ""}
      </div>
      <div class="detail-details">${esc(iss.details)}</div>
      ${isAdmin() ? `
        <div class="detail-assign" style="margin:.5rem 0">
          <label>עריכת תיאור:</label>
          <textarea data-action="edit-details" data-issue="${iss.id}" rows="3" style="width:100%">${esc(iss.details)}</textarea>
          <button class="btn-sm" data-action="save-details" data-issue="${iss.id}" style="margin-top:.25rem">שמור תיאור</button>
        </div>
      ` : ""}

      <div class="detail-actions">
        ${allowedTransitions.map(st =>
          `<button class="btn-sm" data-action="status-change" data-issue="${iss.id}" data-status="${st}">
            ${esc(STATUS_LABELS[st])}
          </button>`
        ).join("")}
      </div>

      ${isAdmin() ? `
        <div class="detail-assign">
          <label>&#x05E9;&#x05D9;&#x05D5;&#x05DA; &#x05DC;&#x05D0;&#x05D9;&#x05E9; &#x05E6;&#x05D5;&#x05D5;&#x05EA;:</label>
          <select data-action="assign" data-issue="${iss.id}">
            <option value="">-- &#x05DC;&#x05D0; &#x05DE;&#x05E9;&#x05D5;&#x05D9;&#x05DA; --</option>
            ${state.staff.map(s =>
              `<option value="${s.id}"${iss.assignedTo === s.id ? " selected" : ""}>${esc(s.fullName)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="detail-assign">
          <label>&#x05D0;&#x05D7;&#x05E8;&#x05D0;&#x05D9; &#x05EA;&#x05D9;&#x05E7;&#x05D5;&#x05DF;:</label>
          <select data-action="fixer" data-issue="${iss.id}">
            <option value="">-- &#x05D1;&#x05D7;&#x05E8; &#x05D0;&#x05D7;&#x05E8;&#x05D0;&#x05D9; &#x05EA;&#x05D9;&#x05E7;&#x05D5;&#x05DF; --</option>
            ${state.staff.map(s =>
              `<option value="${s.id}"${iss.fixer === s.id ? " selected" : ""}>${esc(s.fullName)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="detail-assign">
          <label>&#x05EA;&#x05D0;&#x05E8;&#x05D9;&#x05DA; &#x05D9;&#x05E2;&#x05D3; &#x05DC;&#x05EA;&#x05D9;&#x05E7;&#x05D5;&#x05DF;:</label>
          <input type="date" data-action="target-fix-date" data-issue="${iss.id}" value="${esc(iss.targetFixDate || "")}" />
        </div>
      ` : ""}

      <div class="detail-comments">
        <h4>&#x05EA;&#x05D2;&#x05D5;&#x05D1;&#x05D5;&#x05EA; (${iss.comments ? iss.comments.length : 0})</h4>
        ${sortedComments.length
          ? sortedComments.map(c => `
              <div class="comment">
                <div class="comment-head">
                  <strong>${esc(c.user)}</strong>
                  <span class="muted small">${esc(c.createdAt)}</span>
                </div>
                <div class="comment-text">${esc(c.text)}</div>
              </div>
            `).join("")
          : `<p class="empty-state small">&#x05D0;&#x05D9;&#x05DF; &#x05EA;&#x05D2;&#x05D5;&#x05D1;&#x05D5;&#x05EA;.</p>`
        }
      </div>

      <form class="comment-form" data-action="add-comment" data-issue="${iss.id}">
        <textarea placeholder="&#x05D4;&#x05D5;&#x05E1;&#x05E3; &#x05EA;&#x05D2;&#x05D5;&#x05D1;&#x05D4;..." required maxlength="600"></textarea>
        <button type="submit">&#x05E9;&#x05DC;&#x05D9;&#x05D7;&#x05D4;</button>
      </form>

      <button class="btn-sm secondary" data-action="collapse" data-issue="${iss.id}">&#x05E1;&#x05D2;&#x05D5;&#x05E8; &#x05E4;&#x05E8;&#x05D8;&#x05D9;&#x05DD;</button>
    </div>
  `;
}

/* ============================================================
   RENDER ISSUE FORM (into #issueForm)
   ============================================================ */

export function renderIssueForm() {
  safeRender(() => {
    const form = byId("issueForm");
    if (!form) return;

    form.innerHTML = `
      <label>&#x05D7;&#x05D3;&#x05E8; (&#x05D0;&#x05D5;&#x05E4;&#x05E6;&#x05D9;&#x05D5;&#x05E0;&#x05DC;&#x05D9;)
        <select id="issueRoom">
          <option value="">-- &#x05DB;&#x05DC;&#x05DC;&#x05D9; --</option>
          ${state.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}
        </select>
      </label>
      <label>&#x05E1;&#x05D5;&#x05D2; &#x05EA;&#x05E7;&#x05DC;&#x05D4;
        <select id="issueType">
          ${Object.entries(ISSUE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
        </select>
      </label>
      <label>&#x05D3;&#x05D7;&#x05D9;&#x05E4;&#x05D5;&#x05EA;
        <select id="issuePriority">
          ${Object.entries(PRIORITY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
        </select>
      </label>
      <label class="full">&#x05EA;&#x05D9;&#x05D0;&#x05D5;&#x05E8; &#x05EA;&#x05E7;&#x05DC;&#x05D4;
        <textarea id="issueText" required placeholder="&#x05E4;&#x05D9;&#x05E8;&#x05D5;&#x05D8; &#x05D4;&#x05EA;&#x05E7;&#x05DC;&#x05D4;" maxlength="600"></textarea>
      </label>
      <button type="submit">&#x05E9;&#x05DC;&#x05D9;&#x05D7;&#x05EA; &#x05EA;&#x05E7;&#x05DC;&#x05D4;</button>
    `;
  }, "issueForm");
}
