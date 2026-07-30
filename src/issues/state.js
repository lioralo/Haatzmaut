/* ============================================================
   ISSUES – state management
   ============================================================ */

import { state, persistState, recordAudit } from '../core/store.js';
import { makeId, enforceMaxLength, showToast } from '../core/utils.js';

/* ============================================================
   CONSTANTS
   ============================================================ */

export const ISSUE_TYPES = {
  "broken-equipment": "ציוד תקול",
  "cleanliness": "ניקיון",
  "safety-hazard": "מפגע בטיחות",
  "it-issue": "תקלת מחשוב",
  "other": "אחר"
};

export const STATUS_LABELS = {
  "new": "חדש",
  "in_progress": "בטיפול",
  "resolved": "נפתר",
  "closed": "סגור"
};

export const PRIORITY_LABELS = {
  "low": "נמוך",
  "medium": "בינוני",
  "high": "גבוה",
  "critical": "קריטי"
};

export const VALID_TRANSITIONS = {
  "new": ["in_progress"],
  "in_progress": ["resolved", "closed"],
  "resolved": ["closed", "in_progress"],
  "closed": ["in_progress"]
};

const VALID_TYPES = Object.keys(ISSUE_TYPES);
const VALID_STATUSES = Object.keys(STATUS_LABELS);
const VALID_PRIORITIES = Object.keys(PRIORITY_LABELS);

/* ============================================================
   NORMALIZATION
   ============================================================ */

export function normalizeIssue(i) {
  return {
    id: i.id || makeId("issue"),
    roomId: String(i.roomId || ""),
    room: String(i.room || "כללי").trim() || "כללי",
    type: VALID_TYPES.includes(i.type) ? i.type : "other",
    priority: VALID_PRIORITIES.includes(i.priority) ? i.priority : "medium",
    details: String(i.details || i.text || "").trim(),
    status: VALID_STATUSES.includes(i.status) ? i.status : "new",
    assignedTo: String(i.assignedTo || ""),
    reportedBy: String(i.reportedBy || state.currentUser?.username || "system"),
    createdAt: i.createdAt || new Date().toLocaleString("he-IL"),
    updatedAt: i.updatedAt || i.createdAt || new Date().toLocaleString("he-IL"),
    comments: Array.isArray(i.comments) ? i.comments.map(c => normalizeComment(c)) : []
  };
}

function normalizeComment(c) {
  return {
    id: c.id || makeId("c"),
    user: String(c.user || "system"),
    text: String(c.text || "").trim(),
    createdAt: c.createdAt || new Date().toLocaleString("he-IL")
  };
}

/* ============================================================
   CRUD
   ============================================================ */

export function createIssue(formData) {
  enforceMaxLength("תיאור תקלה", formData.details || "", 600);
  if (!String(formData.details || "").trim()) {
    throw new Error("יש להזין תיאור תקלה.");
  }
  const issue = normalizeIssue(formData);
  state.issues.unshift(issue);
  persistState();
  recordAudit("issue.create", `#${issue.id.slice(-8)} ${ISSUE_TYPES[issue.type]}`, "info", false);
  return issue;
}

export function updateIssue(id, updates) {
  const issue = state.issues.find(i => i.id === id);
  if (!issue) return null;
  if (updates.details !== undefined) {
    enforceMaxLength("תיאור תקלה", updates.details, 600);
  }
  if (updates.type !== undefined && !VALID_TYPES.includes(updates.type)) {
    throw new Error("סוג תקלה לא חוקי.");
  }
  if (updates.priority !== undefined && !VALID_PRIORITIES.includes(updates.priority)) {
    throw new Error("דרגת דחיפות לא חוקית.");
  }
  Object.assign(issue, updates, { updatedAt: new Date().toLocaleString("he-IL") });
  persistState();
  recordAudit("issue.update", `#${id.slice(-8)}`, "info", false);
  return issue;
}

export function updateIssueStatus(id, newStatus) {
  const issue = state.issues.find(i => i.id === id);
  if (!issue) return null;
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error("סטטוס לא חוקי.");
  }
  const allowed = VALID_TRANSITIONS[issue.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`לא ניתן לעבור מ-${STATUS_LABELS[issue.status]} ל-${STATUS_LABELS[newStatus]}.`);
  }
  issue.status = newStatus;
  issue.updatedAt = new Date().toLocaleString("he-IL");
  persistState();
  recordAudit("issue.status", `#${id.slice(-8)} => ${STATUS_LABELS[newStatus]}`, "info", false);
  showToast(`הסטטוס עודכן ל-${STATUS_LABELS[newStatus]}.`);
  return issue;
}

export function addComment(issueId, user, text) {
  const issue = state.issues.find(i => i.id === issueId);
  if (!issue) return null;
  const txt = String(text || "").trim();
  if (!txt) {
    throw new Error("יש להזין תגובה.");
  }
  enforceMaxLength("תגובה", txt, 600);
  if (!issue.comments) issue.comments = [];
  issue.comments.push(normalizeComment({ user: user || state.currentUser?.username || "system", text: txt }));
  issue.updatedAt = new Date().toLocaleString("he-IL");
  persistState();
  recordAudit("issue.comment", `#${issueId.slice(-8)}`, "info", false);
  return issue;
}

export function assignIssue(issueId, staffId) {
  const issue = state.issues.find(i => i.id === issueId);
  if (!issue) return null;
  issue.assignedTo = String(staffId || "");
  issue.updatedAt = new Date().toLocaleString("he-IL");
  persistState();
  recordAudit("issue.assign", `#${issueId.slice(-8)} => ${staffId || "בוטל"}`, "info", false);
  return issue;
}

/* ============================================================
   QUERIES
   ============================================================ */

export function getIssuesByStatus(status) {
  return state.issues.filter(i => i.status === status);
}

export function getIssuesByRoom(roomId) {
  return state.issues.filter(i => i.roomId === roomId);
}

export function getIssuesByPriority(priority) {
  return state.issues.filter(i => i.priority === priority);
}
