/* ============================================================
   ISSUES – event handlers
   ============================================================ */

import {
  state,
  isAdmin,
  persistState,
  recordAudit
} from '../core/store.js';
import { getRoomName } from '../calendar/state.js';
import { byId, esc, showToast, enforceMaxLength } from '../core/utils.js';
import {
  createIssue,
  updateIssueStatus,
  addComment,
  assignIssue
} from './state.js';
import {
  renderIssuesBoard,
  renderIssueDetail,
  renderIssueForm,
  setFilter,
  setExpanded
} from './render.js';

/* ============================================================
   INIT
   ============================================================ */

export function initIssuesEvents() {
  renderIssueForm();
  renderIssuesBoard();
  bindBoardEvents();
  bindKanbanDragEvents();
  bindKanbanFilterEvents();
  bindQuickReportEvents();
}

/* ============================================================
   KANBAN DRAG-AND-DROP
   ============================================================ */

let _kanbanDragBound = false;

function bindKanbanDragEvents() {
  if (_kanbanDragBound) return;
  const queue = byId("issueQueue");
  if (!queue) return;

  queue.addEventListener("dragstart", e => {
    const card = e.target.closest(".kanban-card");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.issueId);
    card.classList.add("dragging");
  });

  queue.addEventListener("dragover", e => {
    const col = e.target.closest(".kanban-cards");
    if (!col) return;
    e.preventDefault();
  });

  queue.addEventListener("drop", e => {
    e.preventDefault();
    const col = e.target.closest(".kanban-cards");
    if (!col) return;
    const issueId = e.dataTransfer.getData("text/plain");
    const newStatus = col.dataset.status;
    if (!issueId || !newStatus) return;
    try {
      updateIssueStatus(issueId, newStatus);
      persistState();
      renderIssuesBoard();
      bindBoardEvents();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  _kanbanDragBound = true;
}

/* ============================================================
   KANBAN FILTER (שלי / הכל / ללא שיוך)
   ============================================================ */

let _kanbanFilterBound = false;

function bindKanbanFilterEvents() {
  if (_kanbanFilterBound) return;
  const queue = byId("issueQueue");
  if (!queue) return;

  queue.addEventListener("click", e => {
    const fb = e.target.closest("[data-issue-filter]");
    if (!fb) return;
    state.issueFilter = fb.dataset.issueFilter || "all";
    renderIssuesBoard();
    bindBoardEvents();
  });

  _kanbanFilterBound = true;
}

/* ============================================================
   QUICK-REPORT TEMPLATE BUTTONS
   ============================================================ */

let _quickReportBound = false;

function bindQuickReportEvents() {
  if (_quickReportBound) return;
  const queue = byId("issueQueue");
  if (!queue) return;

  queue.addEventListener("click", e => {
    const btn = e.target.closest("[data-quick-report]");
    if (!btn) return;
    const type = btn.dataset.quickReport;
    const typeMap = {
      room: "broken-equipment",
      equipment: "broken-equipment",
      safety: "safety-hazard",
      clean: "cleanliness"
    };
    const textMap = {
      room: "תקלה בחדר ",
      equipment: "תקלת ציוד: ",
      safety: "",
      clean: ""
    };
    const typeEl = byId("issueType");
    const textEl = byId("issueText");
    if (typeEl) typeEl.value = typeMap[type] || "other";
    if (textEl) {
      textEl.value = textMap[type] || "";
      textEl.focus();
      textEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  _quickReportBound = true;
}

/* ============================================================
   ISSUE FORM
   ============================================================ */

let _issueFormBound = false;

function bindIssueForm() {
  if (_issueFormBound) return;
  const form = byId("issueForm");
  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    try {
      const details = byId("issueText").value.trim();
      const type = byId("issueType").value;
      const priority = byId("issuePriority").value;
      const roomId = byId("issueRoom").value;

      if (!details) { showToast("יש להזין תיאור תקלה.", "error"); return; }

      enforceMaxLength("תיאור תקלה", details, 600);

      createIssue({
        roomId,
        room: roomId ? getRoomName(roomId) : "כללי",
        type,
        priority,
        details,
        reportedBy: state.currentUser?.username || "system"
      });

      form.reset();
      renderIssuesBoard();
      bindBoardEvents();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  _issueFormBound = true;
}

/* ============================================================
   FILTER CHIPS & CARD CLICKS
   ============================================================ */

let _boardHandler = null;
let _boardChangeHandler = null;

function bindBoardEvents() {
  const box = byId("issueQueue");
  if (!box) return;

  if (_boardHandler) {
    box.removeEventListener("click", _boardHandler);
    box.removeEventListener("change", _boardChangeHandler);
  }

  _boardHandler = handleBoardClick;
  _boardChangeHandler = handleBoardChange;

  box.addEventListener("click", _boardHandler);
  box.addEventListener("change", _boardChangeHandler);

  bindIssueForm();
}

function handleBoardClick(e) {
  const target = e.target.closest("[data-filter]");
  if (target) {
    e.preventDefault();
    handleFilterChange(target.dataset.filter, target.dataset.val);
    return;
  }

  const cardMain = e.target.closest("[data-action='expand']");
  if (cardMain) {
    const card = cardMain.closest("[data-issue-id]");
    if (card) {
      expandIssue(card.dataset.issueId);
      return;
    }
  }

  const statusBtn = e.target.closest("[data-action='status-change']");
  if (statusBtn) {
    handleStatusChange(statusBtn.dataset.issue, statusBtn.dataset.status);
    return;
  }

  const collapseBtn = e.target.closest("[data-action='collapse']");
  if (collapseBtn) {
    collapseIssue(collapseBtn.dataset.issue);
    return;
  }

  const commentForm = e.target.closest("[data-action='add-comment']");
  if (commentForm) {
    e.preventDefault();
    const textarea = commentForm.querySelector("textarea");
    if (textarea) {
      handleAddComment(commentForm.dataset.issue, textarea.value);
    }
    return;
  }
}

function handleBoardChange(e) {
  const target = e.target.closest("[data-action='assign']");
  if (target) {
    handleAssign(target.dataset.issue, target.value);
    return;
  }
}

/* ============================================================
   HANDLERS
   ============================================================ */

function handleFilterChange(filter, val) {
  setFilter(filter, val);
  renderIssuesBoard();
  bindBoardEvents();
}

function expandIssue(issueId) {
  setExpanded(issueId);
  renderIssuesBoard();
  bindBoardEvents();
}

function collapseIssue(issueId) {
  setExpanded("");
  renderIssuesBoard();
  bindBoardEvents();
}

function handleStatusChange(issueId, newStatus) {
  try {
    updateIssueStatus(issueId, newStatus);
    renderIssuesBoard();
    bindBoardEvents();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleAssign(issueId, staffId) {
  assignIssue(issueId, staffId);
  renderIssuesBoard();
  bindBoardEvents();
}

function handleAddComment(issueId, text) {
  try {
    addComment(issueId, state.currentUser?.username || "system", text);
    setExpanded(issueId);
    renderIssuesBoard();
    bindBoardEvents();
  } catch (err) {
    showToast(err.message, "error");
  }
}
