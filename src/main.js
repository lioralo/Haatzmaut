/* ============================================================
   HAATZMAUT — Main Entry Point
   Bootstraps core store, restores session, initializes all modules.
   ============================================================ */

import { state, isAdmin, persistStateImmediate, recordAudit, runIntegrityAssistant, loadStoredState, startAutoBackup, exportFullBackup, exportEncryptedBackup, applyImportedState, importEncryptedBackup, saveManagedBackup, getManagedBackups, restoreManagedBackup, deleteManagedBackup } from './core/store.js';
import { DEV_LOGIN_ENABLED, DEFAULT_ROOMS, DEFAULT_STAFF, DAY_DEFS } from './core/constants.js';
import {
  byId, showToast, generatePassword, passwordForUser, makeId,
  localISO, minToTime, timeToMin, sundayISO, todayDayIdx, clampDay, esc
} from './core/utils.js';
import {
  restoreSession, registerActivity, applyAccessControl,
  renderSessionBar, logoutCurrentUser, clearSessionTimer
} from './core/session.js';
import { t, setLanguage, restoreLanguage, updateAllI18nBindings } from './core/i18n.js';

import {
  ensureSyncedScheduleWindow, getRoomName, activeDayEntries,
  expandRecurringEntries, cleanExpiredWaitlist, deleteRecurringSeries,
  updateRecurringInstance, addToWaitlist, removeFromWaitlist,
  getWeeklyOccupancy, getTherapistStats, getNoShowRate, getResolutionTimeAvg
} from './calendar/state.js';
import {
  renderOccupancy, renderDayTabs, renderWeekHeader, renderStats,
  renderTagFilters, renderRequests, renderWaitlistPanel,
  renderStatsDashboard
} from './calendar/render.js';
import { initCalendarEvents } from './calendar/events.js';

import { DEFAULT_PERMISSIONS } from './staff/state.js';
import { renderAdminUsers, renderAdminStaff, renderAdminResetRequests, renderStaffDirectory, renderStaffAccordion } from './staff/render.js';
import { initStaffEvents } from './staff/events.js';

import { renderMeetingGroups, renderMeetingTimeline } from './meetings/render.js';
import { initMeetingsEvents } from './meetings/events.js';
import { autoMaintainMeetingWindow } from './meetings/state.js';

import { ISSUE_TYPES, STATUS_LABELS } from './issues/state.js';
import { renderIssuesBoard } from './issues/render.js';
import { initIssuesEvents } from './issues/events.js';

import { renderResourceBrowser, renderFolderTree } from './resources/render.js';
import { initResourcesEvents } from './resources/events.js';

/* ----------------------------------------------------------
   Shared UI
   ---------------------------------------------------------- */

function showTab(tabId) {
  const sidebarBtn = document.querySelector(`.sidebar-item[data-tab='${tabId}']`);
  if (!sidebarBtn || sidebarBtn.classList.contains("hidden")) return;

  state.activeTab = tabId;
  document.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
  document.querySelectorAll(".sidebar-item").forEach(b => b.classList.remove("active"));
  const panel = byId(tabId);
  if (panel) panel.classList.remove("hidden");
  sidebarBtn.classList.add("active");
}

function addNotification(text, critical = false) {
  if (!state.notifications) state.notifications = [];
  state.notifications.unshift({
    id: makeId("note"), text, critical,
    at: new Date().toLocaleString("he-IL")
  });
}

/* ----------------------------------------------------------
   Mode Management
   ---------------------------------------------------------- */

function applyTabMode(tabId) {
  const toolbar = document.querySelector(`#${tabId} .mode-toolbar`);
  if (!toolbar) return;

  let modeKey, targetMode;
  if (tabId === "dashboardTab") {
    targetMode = state.modes.calendar;
    modeKey = "calendar";
  } else if (tabId === "requestsTab") {
    targetMode = state.modes.requests;
    modeKey = "requests";
  } else if (tabId === "staffTab" || tabId === "adminTab") {
    targetMode = state.modes.staff;
    modeKey = "staff";
  } else if (tabId === "meetingsTab") {
    targetMode = state.modes.meetings;
    modeKey = "meetings";
  } else if (tabId === "resourcesTab") {
    targetMode = state.modes.resources;
    modeKey = "resources";
  } else if (tabId === "issuesTab") {
    targetMode = state.modes.issues;
    modeKey = "issues";
  }

  if (!targetMode) return;

  toolbar.querySelectorAll(".mode-tab").forEach(b => {
    b.classList.toggle("active", (b.dataset.mode || b.dataset.calendarMode) === targetMode);
  });

  if (tabId === "dashboardTab") {
    byId("scheduleView")?.classList.toggle("hidden", targetMode !== "schedule");
    byId("listView")?.classList.toggle("hidden", targetMode !== "list");
    byId("printView")?.classList.toggle("hidden", targetMode !== "print");
    byId("statsView")?.classList.toggle("hidden", targetMode !== "stats");
    if (targetMode === "list") renderBookingList();
    if (targetMode === "print") window.print();
    if (targetMode === "stats") renderStatsDashboard();
  } else if (tabId === "requestsTab") {
    byId("requestsViewMode")?.classList.toggle("hidden", targetMode !== "view");
    byId("requestsExportMode")?.classList.toggle("hidden", targetMode !== "export");
  } else if (tabId === "staffTab" || tabId === "adminTab") {
    byId("staffViewMode")?.classList.toggle("hidden", targetMode !== "view");
    byId("staffEditMode")?.classList.toggle("hidden", targetMode !== "edit");
    byId("staffExportMode")?.classList.toggle("hidden", targetMode !== "export");
    if (targetMode === "view") { renderStaffDirectory(); }
    if (targetMode === "edit") { renderStaffAccordion(); }
  } else if (tabId === "meetingsTab") {
    byId("meetingsViewMode")?.classList.toggle("hidden", targetMode !== "view");
    byId("meetingsEditMode")?.classList.toggle("hidden", targetMode !== "edit");
    byId("meetingsExportMode")?.classList.toggle("hidden", targetMode !== "export");
    if (targetMode === "view") { renderMeetingGroups(); renderMeetingTimeline(); }
  } else if (tabId === "resourcesTab") {
    byId("resourcesBrowseMode")?.classList.toggle("hidden", targetMode !== "browse");
    byId("resourcesUploadMode")?.classList.toggle("hidden", targetMode !== "upload");
    byId("resourcesDownloadMode")?.classList.toggle("hidden", targetMode !== "download");
  } else if (tabId === "issuesTab") {
    byId("issuesBoardMode")?.classList.toggle("hidden", targetMode !== "board");
    byId("issuesReportMode")?.classList.toggle("hidden", targetMode !== "report");
    byId("issuesSummaryMode")?.classList.toggle("hidden", targetMode !== "summary");
    if (targetMode === "summary") renderIssuesSummary();
  }
}

function initModeToolbars() {
  document.querySelectorAll(".mode-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const toolbar = btn.closest(".mode-toolbar");
      const tab = btn.closest(".card.tab-content, .tab-content");
      const mode = btn.dataset.mode || btn.dataset.calendarMode;
      if (!mode) return;

      toolbar.querySelectorAll(".mode-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const tabId = tab?.id;
      if (tabId === "dashboardTab") {
        byId("scheduleView")?.classList.toggle("hidden", mode !== "schedule");
        byId("listView")?.classList.toggle("hidden", mode !== "list");
        byId("printView")?.classList.toggle("hidden", mode !== "print");
        byId("statsView")?.classList.toggle("hidden", mode !== "stats");
        if (mode === "list") renderBookingList();
        if (mode === "print") window.print();
        if (mode === "stats") renderStatsDashboard();
        state.modes.calendar = mode;
      } else if (tabId === "requestsTab") {
        byId("requestsViewMode")?.classList.toggle("hidden", mode !== "view");
        byId("requestsExportMode")?.classList.toggle("hidden", mode !== "export");
        state.modes.requests = mode;
      } else if (tabId === "staffTab") {
        byId("staffViewMode")?.classList.toggle("hidden", mode !== "view");
        byId("staffEditMode")?.classList.toggle("hidden", mode !== "edit");
        byId("staffExportMode")?.classList.toggle("hidden", mode !== "export");
        state.modes.staff = mode;
        if (mode === "view") { renderStaffDirectory(); }
        if (mode === "edit") { renderStaffAccordion(); }
      } else if (tabId === "meetingsTab") {
        byId("meetingsViewMode")?.classList.toggle("hidden", mode !== "view");
        byId("meetingsEditMode")?.classList.toggle("hidden", mode !== "edit");
        byId("meetingsExportMode")?.classList.toggle("hidden", mode !== "export");
        state.modes.meetings = mode;
        if (mode === "view") { renderMeetingGroups(); renderMeetingTimeline(); }
      } else if (tabId === "resourcesTab") {
        byId("resourcesBrowseMode")?.classList.toggle("hidden", mode !== "browse");
        byId("resourcesUploadMode")?.classList.toggle("hidden", mode !== "upload");
        byId("resourcesDownloadMode")?.classList.toggle("hidden", mode !== "download");
        state.modes.resources = mode;
      } else if (tabId === "issuesTab") {
        byId("issuesBoardMode")?.classList.toggle("hidden", mode !== "board");
        byId("issuesReportMode")?.classList.toggle("hidden", mode !== "report");
        byId("issuesSummaryMode")?.classList.toggle("hidden", mode !== "summary");
        state.modes.issues = mode;
        if (mode === "summary") renderIssuesSummary();
      }
    });
  });
}

/* ----------------------------------------------------------
   Notifications
   ---------------------------------------------------------- */

function updateNotificationBell() {
  const badge = byId("notificationBadge");
  const bell = byId("notificationBell");
  if (!badge || !bell) return;
  const count = state.notifications?.length || 0;
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
  bell.classList.toggle("hidden", !state.currentUser);
}

function renderNotificationPanel() {
  const list = byId("notificationList");
  if (!list) return;
  const items = state.notifications?.slice(0, 20) || [];
  list.innerHTML = items.map(n =>
    `<div class="notif-item${n.critical ? " critical" : ""}">${n.text}<small>${n.at}</small></div>`
  ).join("") || '<div class="notif-item muted">אין התראות</div>';
}

/* ----------------------------------------------------------
   Booking List (calendar list mode)
   ---------------------------------------------------------- */

function renderBookingList() {
  const container = byId("bookingListView");
  if (!container) return;
  const query = (state.searchQuery || "").toLowerCase();
  let entries = state.schedule.filter(e => e.weekISO === state.weekISO).sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return timeToMin(a.start) - timeToMin(b.start);
  });
  if (query) {
    entries = entries.filter(e =>
      (e.clientName || "").toLowerCase().includes(query) ||
      (e.staff || "").toLowerCase().includes(query) ||
      (getRoomName(e.roomId) || "").toLowerCase().includes(query)
    );
  }
  container.innerHTML = entries.length ? entries.map(e => {
    const roomName = getRoomName(e.roomId);
    const endTime = minToTime(timeToMin(e.start) + e.duration);
    return `<div class="booking-list-item">
      <div><strong>${esc(e.clientName || e.staff)}</strong> · ${esc(e.staff)}<br><small>${esc(roomName)} · ${DAY_DEFS[e.day]?.label} · ${e.start}-${endTime}</small></div>
      <span class="badge">${esc(e.noteType || "")}</span>
      <span class="badge">${e.sessionStatus || ""}</span>
    </div>`;
  }).join("") : '<p class="empty-state">אין פגישות להצגה</p>';
}

/* ----------------------------------------------------------
   Issues Summary
   ---------------------------------------------------------- */

function renderIssuesSummary() {
  const container = byId("issuesSummary");
  if (!container) return;
  const total = state.issues.length;
  const resolved = state.issues.filter(i => i.status === "resolved" || i.status === "closed").length;
  const open = total - resolved;
  container.innerHTML = `
    <div class="dashboard-summary">
      <div class="dash-card warning"><span class="dash-value">${open}</span><span class="dash-label">פתוחות</span></div>
      <div class="dash-card"><span class="dash-value">${resolved}</span><span class="dash-label">נפתרו</span></div>
      <div class="dash-card"><span class="dash-value">${total}</span><span class="dash-label">סה"כ</span></div>
    </div>
    <div id="issuesSummaryDetail"></div>
  `;
}

/* ----------------------------------------------------------
   Bootstrap
   ---------------------------------------------------------- */

async function bootstrapAdmin() {
  if (state.users && state.users.length > 0) return;
  const rawPwd = "admin123";
  const { salt, passwordHash } = await passwordForUser(rawPwd);
  if (!state.users) state.users = [];
  state.users.push({
    id: makeId("user"),
    username: "admin",
    passwordHash,
    salt,
    role: "admin",
    staffId: "",
    active: true,
    createdAt: new Date().toLocaleString("he-IL")
  });
  if (!state.staff) state.staff = [];
  state.needsSetup = false;
  persistStateImmediate();
}

/* ----------------------------------------------------------
   Global render dispatch
   ---------------------------------------------------------- */

function renderActiveTab() {
  const tab = state.activeTab || "dashboardTab";
  showTab(tab);

  switch (tab) {
  case "dashboardTab":
    renderWeekHeader();
    renderDayTabs();
    renderStats();
    renderTagFilters();
    renderOccupancy();
    renderWaitlistPanel();
    break;
  case "stats":
    renderStatsDashboard();
    break;
  case "staffTab":
    renderStaffDirectory();
    break;
  case "adminTab":
    if (isAdmin()) {
      renderStaffAccordion();
    }
    break;
  case "meetingsTab":
    renderMeetingGroups();
    renderMeetingTimeline();
    break;
  case "issuesTab":
    renderIssuesBoard();
    break;
  case "resourcesTab":
    renderResourceBrowser();
    renderFolderTree();
    break;
  case "requestsTab":
    renderRequests();
    break;
  }

  updateNotificationBell();
  applyTabMode(tab);
  updateAllI18nBindings();
}

/* ----------------------------------------------------------
   Initialize
   ---------------------------------------------------------- */

async function initialize() {
  restoreLanguage();
  updateLangSwitchButton();

  /* Restore persisted state from localStorage */
  const stored = loadStoredState();
  if (stored) {
    state.auditLog        = stored.auditLog        || [];
    state.loginSecurity   = stored.loginSecurity   || { failures: [], lockUntil: 0 };
    state.activeTab       = stored.activeTab       || "dashboardTab";
    state.schedule        = stored.schedule        || [];
    state.rooms           = stored.rooms           || [];
    state.defaultTemplate = stored.defaultTemplate || [];
    state.weekTemplates   = stored.weekTemplates   || {};
    state.requests        = stored.requests        || [];
    state.selectedTags    = new Set(stored.selectedTags || []);
    state.weekISO         = stored.weekISO         || "";
    state.activeDay       = stored.activeDay       ?? 0;
    state.staff           = stored.staff           || [];
    state.users           = stored.users           || [];
    state.passwordResets  = stored.passwordResets  || [];
    state.folders         = stored.folders         || [];
    state.files           = stored.files           || [];
    state.meetingGroups   = stored.meetingGroups   || [];
    state.meetings        = stored.meetings        || [];
    state.issues          = stored.issues          || [];
    state.displaySettings = stored.displaySettings || {};
    state.waitlist        = stored.waitlist        || [];
    state.settings        = stored.settings        || state.settings;
  }
  if (!state.weekISO) state.weekISO = sundayISO();
  if (!state.activeDay && state.activeDay !== 0) state.activeDay = todayDayIdx();
  if (!state.rooms || !state.rooms.length) state.rooms = DEFAULT_ROOMS.map(r => ({ ...r }));
  if (!state.staff || !state.staff.length) state.staff = DEFAULT_STAFF.map(s => ({ ...s }));

  state.modes = state.modes || { staff: "view", meetings: "view", resources: "browse", issues: "board", requests: "view", calendar: "schedule" };

  state.sidebarCollapsed = localStorage.getItem("sidebar_collapsed") === "true";
  if (state.sidebarCollapsed) {
    document.querySelector(".app-layout")?.classList.add("sidebar-collapsed");
  }

  await bootstrapAdmin();
  cleanExpiredWaitlist();
  expandRecurringEntries(8);
  autoMaintainMeetingWindow();

  startAutoBackup();

  const loggedIn = restoreSession();
  if (loggedIn) {
    byId("loginSection").classList.add("hidden");
    byId("appSection").classList.remove("hidden");
    applyAccessControl();
    renderSessionBar();
    registerActivity();
  }

  if (state.currentUser) {
    const firstTab = state.activeTab === "adminTab" && !isAdmin()
      ? "dashboardTab"
      : (state.activeTab || "dashboardTab");
    state.activeTab = firstTab;
  }

  initCalendarEvents();
  initStaffEvents();
  initMeetingsEvents();
  initIssuesEvents();
  initResourcesEvents();
  initModeToolbars();
  initAdminSubTabs();
  initBackupHandlers();

  ensureSyncedScheduleWindow();
  runIntegrityAssistant();
  renderActiveTab();

  const demoCreds = byId("demoCreds");
  if (demoCreds) demoCreds.classList.toggle("hidden", !DEV_LOGIN_ENABLED);

  if (state.currentUser) {
    const firstTab = state.activeTab === "adminTab" && !isAdmin()
      ? "dashboardTab"
      : (state.activeTab || "dashboardTab");
    state.activeTab = firstTab;
    showTab(firstTab);
  }
}

/* ----------------------------------------------------------
   Tab navigation events
   ---------------------------------------------------------- */

function initNavigation() {
  document.querySelectorAll(".sidebar-item[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      if (!tabId) return;
      if ((tabId === "adminTab" || tabId === "staffTab") && !isAdmin()) return;
      showTab(tabId);
      renderActiveTab();
    });
  });

  byId("logoutBtn")?.addEventListener("click", () => {
    recordAudit("auth.logout", "התנתקות ידנית.", "info", false);
    logoutCurrentUser();
    byId("appSection").classList.add("hidden");
    byId("loginSection").classList.remove("hidden");
    renderSessionBar();
  });
}

/* ----------------------------------------------------------
   Login event
   ---------------------------------------------------------- */

function initLogin() {
  const form = byId("loginForm");
  if (!form) return;

  function isLoginLocked() {
    const nowTs = Date.now();
    if (!state.loginSecurity) return false;
    if (state.loginSecurity.lockUntil > nowTs) return true;
    if (state.loginSecurity.lockUntil) {
      state.loginSecurity.failures = [];
      state.loginSecurity.lockUntil = 0;
    }
    return false;
  }

  function resetLoginGuard() {
    if (!state.loginSecurity) state.loginSecurity = { failures: [], lockUntil: 0 };
    state.loginSecurity.failures = [];
    state.loginSecurity.lockUntil = 0;
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();

    if (isLoginLocked()) {
      const leftSec = Math.ceil((state.loginSecurity.lockUntil - Date.now()) / 1000);
      byId("loginError").textContent = `הכניסה חסומה זמנית. נסו שוב בעוד ${Math.max(1, leftSec)} שניות.`;
      byId("loginError").classList.remove("hidden");
      return;
    }

    const u = String(byId("username").value || "").trim().toLowerCase();
    const p = byId("password").value;
    if (!u || !p) {
      byId("loginError").textContent = "יש להזין שם משתמש וסיסמה.";
      byId("loginError").classList.remove("hidden");
      return;
    }

    const { users } = state;
    const sysUser = Array.isArray(users) ? users.find(x => x.username === u && x.active) : null;
    let role, label, staffId = "", verified = false;
    let effectiveUser = sysUser;

    // Dev auth bypass
    if (DEV_LOGIN_ENABLED) {
      const legacy = { admin: { pass: "admin123", role: "admin", label: "מנהל מערכת" }, staff: { pass: "staff123", role: "staff", label: "צוות" } };
      const match = legacy[u];
      if (match && match.pass === p) {
        role = match.role; label = match.label; verified = true;
        effectiveUser = effectiveUser || { role, staffId: "" };
        recordAudit("auth.login.legacy", `התחברות נתיב פיתוח: ${u}.`, "warn", false);
      }
    }

    if (!verified && sysUser) {
      const { verifyPassword, migrateUserPassword } = await import('./core/utils.js');
      if (sysUser.passwordHash && sysUser.salt) {
        verified = await verifyPassword(p, sysUser.passwordHash, sysUser.salt);
      } else if (sysUser.password) {
        if (sysUser.password === p) {
          await migrateUserPassword(sysUser, p);
          verified = true;
        }
      }
      if (verified) {
        role = sysUser.role;
        label = sysUser.username;
        staffId = sysUser.staffId || "";
      }
    }

    if (!verified) {
      if (!state.loginSecurity) state.loginSecurity = { failures: [], lockUntil: 0 };
      const nowTs = Date.now();
      state.loginSecurity.failures = state.loginSecurity.failures.filter(ts => (nowTs - ts) <= 10 * 60 * 1000);
      state.loginSecurity.failures.push(nowTs);
      if (state.loginSecurity.failures.length >= 5) {
        state.loginSecurity.lockUntil = nowTs + 15 * 60 * 1000;
        recordAudit("auth.lockout", "נחסמה כניסה זמנית.", "critical", false);
      }
      recordAudit("auth.login.failed", `ניסיון כניסה כושל: ${u}.`, "warn", false);
      byId("loginError").textContent = "שם משתמש או סיסמה שגויים";
      byId("loginError").classList.remove("hidden");
      return;
    }

    resetLoginGuard();
    state.currentUser = { username: u, role, label, staffId };
    sessionStorage.setItem("clinic_user", JSON.stringify({ username: u, role, staffId }));
    byId("loginSection").classList.add("hidden");
    byId("appSection").classList.remove("hidden");
    byId("loginError").classList.add("hidden");
    recordAudit("auth.login.success", `התחברות: ${u}.`, "info", false);
    applyAccessControl();
    renderSessionBar();
    registerActivity();

    state.activeTab = role === "admin" ? "dashboardTab" : "dashboardTab";
    renderActiveTab();
  });
}

/* ----------------------------------------------------------
   Language switch
   ---------------------------------------------------------- */

function updateLangSwitchButton() {
  const lang = window.__APP_LANG__ || restoreLanguage();
  const nextText = lang === "he" ? "English" : "עברית";
  const sidebarBtn = byId("langSwitchBtn");
  if (sidebarBtn) {
    const label = sidebarBtn.querySelector(".sidebar-label");
    if (label) label.textContent = nextText;
    else sidebarBtn.textContent = nextText;
  }
  const loginBtn = byId("langSwitchBtnLogin");
  if (loginBtn) loginBtn.textContent = nextText;
}

byId("langSwitchBtn")?.addEventListener("click", switchLang);
byId("langSwitchBtnLogin")?.addEventListener("click", switchLang);

function switchLang() {
  const current = window.__APP_LANG__ || restoreLanguage();
  const next = current === "he" ? "en" : "he";
  setLanguage(next);
  updateLangSwitchButton();
  showToast(next === "he" ? "השפה שונתה לעברית" : "Language switched to English", "info");
}

/* ----------------------------------------------------------
   Keyboard shortcuts
   ---------------------------------------------------------- */

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
  const key = e.key.toLowerCase();
  if (key === "n" && isAdmin()) {
    import('./calendar/render.js').then(m => m.openBookingModal({}));
  } else if (key === "t") {
    state.weekISO = sundayISO();
    state.activeDay = todayDayIdx();
    import('./calendar/state.js').then(m => m.ensureSyncedScheduleWindow());
    import('./calendar/render.js').then(m => { m.renderWeekHeader(); m.renderDayTabs(); m.renderOccupancy(); });
  } else if (key === "arrowright") {
    state.activeDay = clampDay(state.activeDay - 1);
    import('./calendar/render.js').then(m => { m.renderDayTabs(); m.renderOccupancy(); });
  } else if (key === "arrowleft") {
    state.activeDay = clampDay(state.activeDay + 1);
    import('./calendar/render.js').then(m => { m.renderDayTabs(); m.renderOccupancy(); });
  } else if (key === "escape") {
    import('./calendar/render.js').then(m => m.closeBookingModal());
  }
});

/* ----------------------------------------------------------
   Notification center events
   ---------------------------------------------------------- */

byId("notificationBell")?.addEventListener("click", () => {
  const panel = byId("notificationPanel");
  panel.classList.toggle("hidden");
  const expanded = !panel.classList.contains("hidden");
  byId("notificationBell").setAttribute("aria-expanded", String(expanded));
  if (!panel.classList.contains("hidden")) renderNotificationPanel();
});

document.querySelector(".notif-clear")?.addEventListener("click", () => {
  state.notifications = [];
  updateNotificationBell();
  renderNotificationPanel();
});

/* ----------------------------------------------------------
   Search events
   ---------------------------------------------------------- */

byId("bookingSearch")?.addEventListener("input", e => {
  state.searchQuery = e.target.value;
  if (state.modes?.calendar === "list") renderBookingList();
  else renderOccupancy();
});

/* ----------------------------------------------------------
   Sidebar toggle
   ---------------------------------------------------------- */

byId("sidebarToggle")?.addEventListener("click", () => {
  const layout = document.querySelector(".app-layout");
  layout.classList.toggle("sidebar-collapsed");
  const collapsed = layout.classList.contains("sidebar-collapsed");
  localStorage.setItem("sidebar_collapsed", collapsed);
  const btn = byId("sidebarToggle");
  if (btn) btn.textContent = collapsed ? "▶" : "◀";
});

/* ----------------------------------------------------------
   Admin sub-tabs
   ---------------------------------------------------------- */

function initAdminSubTabs() {
  document.querySelectorAll("[data-admin-subtab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const subtab = btn.dataset.adminSubtab;
      document.querySelectorAll("[data-admin-subtab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".admin-subtab-content").forEach(el => el.classList.add("hidden"));
      const content = document.querySelector(`.admin-subtab-content[data-admin-subtab="${subtab}"]`);
      if (content) content.classList.remove("hidden");
    });
  });
}

/* ----------------------------------------------------------
   Backup handlers
   ---------------------------------------------------------- */

function initBackupHandlers() {
  const exportBtn = byId("exportBackupBtn");
  if (exportBtn) exportBtn.addEventListener("click", () => { exportFullBackup(); });

  const exportEncBtn = byId("exportEncryptedBtn");
  if (exportEncBtn) exportEncBtn.addEventListener("click", () => { exportEncryptedBackup(); });

  const backupNowBtn = byId("backupNowBtn");
  if (backupNowBtn) {
    backupNowBtn.addEventListener("click", () => {
      const b = saveManagedBackup("");
      showToast(`גיבוי נשמר: ${b.label}`, "info");
      renderManagedBackups();
    });
  }

  const restoreBtn = byId("restoreBackupBtn");
  if (restoreBtn) {
    restoreBtn.addEventListener("click", () => {
      const sel = byId("savedBackupSelect");
      if (!sel || !sel.value) return;
      if (!confirm("שחזור גיבוי יחליף את כל הנתונים. להמשיך?")) return;
      try {
        restoreManagedBackup(sel.value);
        showToast("גיבוי שוחזר, טוען מחדש...", "info");
        setTimeout(() => window.location.reload(), 800);
      } catch (err) { showToast(err.message, "error"); }
    });
  }

  const deleteBtn = byId("deleteBackupBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      const sel = byId("savedBackupSelect");
      if (!sel || !sel.value) return;
      if (!confirm("למחוק את הגיבוי?")) return;
      deleteManagedBackup(sel.value);
      showToast("גיבוי נמחק.", "info");
      renderManagedBackups();
    });
  }

  const backupUpload = byId("backupUpload");
  if (backupUpload) {
    backupUpload.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!confirm("שחזור גיבוי יחליף את כל הנתונים. להמשיך?")) { e.target.value = ""; return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          applyImportedState(JSON.parse(reader.result));
          showToast("גיבוי שוחזר, טוען מחדש...", "info");
          setTimeout(() => window.location.reload(), 800);
        } catch (err) { showToast("שגיאה בקובץ הגיבוי.", "error"); }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  const encUpload = byId("encryptedUpload");
  if (encUpload) {
    encUpload.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (!file) return;
      importEncryptedBackup(file).then(() => {
        setTimeout(() => window.location.reload(), 800);
      });
      e.target.value = "";
    });
  }

  const clearAudit = byId("clearAuditBtn");
  if (clearAudit) {
    clearAudit.addEventListener("click", () => {
      if (!confirm("לנקות את יומן הבקרה?")) return;
      state.auditLog = [];
      persistStateImmediate();
      renderAuditLog();
      renderManagedBackups();
    });
  }

  renderManagedBackups();
}

function renderManagedBackups() {
  const sel = byId("savedBackupSelect");
  const list = byId("savedBackupsList");
  const backups = getManagedBackups();

  if (sel) {
    sel.innerHTML = '<option value="">-- בחר גיבוי --</option>' +
      backups.map(b => `<option value="${b.id}">${esc(b.label)} (${esc(b.createdAt)})</option>`).join("");
  }

  if (list) {
    list.innerHTML = backups.length ? backups.map(b => `
      <div class="admin-row">
        <div class="admin-row-info">
          <strong>${esc(b.label)}</strong>
          <span class="muted small">${esc(b.createdAt)} · ${Math.round(b.size / 1024)}KB · ${b.rooms} חדרים · ${b.entries} הזמנות · ${b.meetings} ישיבות</span>
        </div>
        <div class="admin-row-acts">
          <span class="user-role-badge role-admin">${Math.round(b.size / 1024)}KB</span>
        </div>
      </div>
    `).join("") : '<p class="empty-state">אין גיבויים שמורים.</p>';
  }
}

function renderAuditLog() {
  const list = byId("adminAuditList");
  if (!list) return;
  list.innerHTML = (state.auditLog || []).slice(0, 50).map(a => `
    <div class="admin-row">
      <div class="admin-row-info">
        <strong>${esc(a.action)}</strong>
        <span class="muted small">${esc(a.user)} · ${esc(a.at)}</span>
        ${a.detail ? `<span class="muted small">${esc(a.detail)}</span>` : ""}
      </div>
    </div>
  `).join("") || '<p class="empty-state">אין רשומות.</p>';
}

/* ----------------------------------------------------------
   Boot
   ---------------------------------------------------------- */

window.addEventListener("beforeunload", persistStateImmediate);

initNavigation();
initLogin();
await initialize();
startAutoBackup();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export { showTab, renderActiveTab, addNotification, renderBookingList, renderIssuesSummary, updateNotificationBell };
