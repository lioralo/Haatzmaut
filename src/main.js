/* ============================================================
   HAATZMAUT — Main Entry Point
   Bootstraps core store, restores session, initializes all modules.
   ============================================================ */

import { state, isAdmin, persistStateImmediate, recordAudit, runIntegrityAssistant, loadStoredState, hydrateState } from './core/store.js';
import { DEV_LOGIN_ENABLED, DEFAULT_ROOMS, DEFAULT_STAFF, DAY_DEFS } from './core/constants.js';
import {
  byId, showToast, passwordForUser, makeId,
  minToTime, timeToMin, sundayISO, todayDayIdx, clampDay, esc
} from './core/utils.js';
import {
  restoreSession, registerActivity, applyAccessControl,
  renderSessionBar, logoutCurrentUser
} from './core/session.js';
import { setLanguage, restoreLanguage, updateAllI18nBindings } from './core/i18n.js';
import {
  setEncryptionPassword, restoreEncryptionKey, initCloudSync
} from './core/cloudSync.js';

import {
  ensureSyncedScheduleWindow, getRoomName,
  expandRecurringEntries, cleanExpiredWaitlist
} from './calendar/state.js';
import {
  renderOccupancy, renderDayTabs, renderWeekHeader, renderStats,
  renderRequests, renderWaitlistPanel,
  renderStatsDashboard
} from './calendar/render.js';
import { initCalendarEvents } from './calendar/events.js';

import { renderStaffDirectory, renderStaffAccordion, renderStaffList } from './staff/render.js';
import { initStaffEvents } from './staff/events.js';

import { renderMeetingGroups, renderMeetingTimeline } from './meetings/render.js';
import { initMeetingsEvents } from './meetings/events.js';
import { autoMaintainMeetingWindow } from './meetings/state.js';

import { renderIssuesBoard } from './issues/render.js';
import { initIssuesEvents } from './issues/events.js';

import { renderResourceBrowser, renderFolderTree } from './resources/render.js';
import { initResourcesEvents } from './resources/events.js';

import { initAdminSubTabs, initBackupHandlers, initCloudSyncButtons } from './admin/audit.js';
import { updateNotificationBell, initNotificationCenter } from './ui/notifications.js';
import { initMobileNav, syncMobileState } from './ui/mobileNav.js';

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

/* ----------------------------------------------------------
   Mode Management
   ---------------------------------------------------------- */

function getModeKey(tabId) {
  if (tabId === "dashboardTab") return "calendar";
  if (tabId === "requestsTab") return "requests";
  if (tabId === "staffTab" || tabId === "adminTab") return "staff";
  if (tabId === "meetingsTab") return "meetings";
  if (tabId === "resourcesTab") return "resources";
  if (tabId === "issuesTab") return "issues";
  return null;
}

const MODE_DEFAULTS = {
  calendar: "schedule", requests: "view", staff: "view",
  meetings: "view", resources: "browse", issues: "board"
};

function setTabMode(tabId, mode) {
  if (tabId === "dashboardTab") {
    byId("scheduleView")?.classList.toggle("hidden", mode !== "schedule");
    byId("listView")?.classList.toggle("hidden", mode !== "list");
    byId("printView")?.classList.toggle("hidden", mode !== "print");
    byId("statsDashboard")?.classList.toggle("hidden", mode !== "stats");
    if (mode === "list") renderBookingList();
    if (mode === "print") window.print();
    if (mode === "stats") renderStatsDashboard();
  } else if (tabId === "requestsTab") {
    byId("requestsViewMode")?.classList.toggle("hidden", mode !== "view");
    byId("requestsExportMode")?.classList.toggle("hidden", mode !== "export");
  } else if (tabId === "staffTab" || tabId === "adminTab") {
    byId("staffViewMode")?.classList.toggle("hidden", mode !== "view");
    byId("staffListMode")?.classList.toggle("hidden", mode !== "list");
    byId("staffEditMode")?.classList.toggle("hidden", mode !== "edit");
    byId("staffExportMode")?.classList.toggle("hidden", mode !== "export");
    if (mode === "view") renderStaffDirectory();
    if (mode === "list") renderStaffList();
    if (mode === "edit") renderStaffAccordion();
  } else if (tabId === "meetingsTab") {
    byId("meetingsViewMode")?.classList.toggle("hidden", mode !== "view");
    byId("meetingsEditMode")?.classList.toggle("hidden", mode !== "edit");
    byId("meetingsExportMode")?.classList.toggle("hidden", mode !== "export");
    if (mode === "view") { renderMeetingGroups(); renderMeetingTimeline(); }
  } else if (tabId === "resourcesTab") {
    byId("resourcesBrowseMode")?.classList.toggle("hidden", mode !== "browse");
    byId("resourcesUploadMode")?.classList.toggle("hidden", mode !== "upload");
    byId("resourcesDownloadMode")?.classList.toggle("hidden", mode !== "download");
  } else if (tabId === "issuesTab") {
    byId("issuesBoardMode")?.classList.toggle("hidden", mode !== "board");
    byId("issuesReportMode")?.classList.toggle("hidden", mode !== "report");
    byId("issuesSummaryMode")?.classList.toggle("hidden", mode !== "summary");
    if (mode === "summary") renderIssuesSummary();
  }
}

function applyTabMode(tabId) {
  state.modes = state.modes || {};
  const modeKey = getModeKey(tabId);
  if (!modeKey) return;

  if (!state.modes[modeKey]) state.modes[modeKey] = MODE_DEFAULTS[modeKey];
  const targetMode = state.modes[modeKey];

  const toolbar = document.querySelector(`#${tabId} .mode-toolbar`);
  if (toolbar) {
    toolbar.querySelectorAll(".mode-tab").forEach(b => {
      b.classList.toggle("active", (b.dataset.mode || b.dataset.calendarMode) === targetMode);
    });
  }

  setTabMode(tabId, targetMode);
}

function initModeToolbars() {
  document.querySelectorAll(".mode-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.closest(".card.tab-content, .tab-content");
      const mode = btn.dataset.mode || btn.dataset.calendarMode;
      if (!mode || !tab?.id) return;

      const tabId = tab.id;
      const modeKey = getModeKey(tabId);
      if (!modeKey) return;

      state.modes = state.modes || {};
      state.modes[modeKey] = mode;

      const toolbar = btn.closest(".mode-toolbar");
      if (toolbar) {
        toolbar.querySelectorAll(".mode-tab").forEach(b => b.classList.remove("active"));
      }
      btn.classList.add("active");

      setTabMode(tabId, mode);
    });
  });
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
    fullName: "מנהל מערכת",
    email: "",
    phone: "",
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
    // Always show schedule view when rendering dashboard
    byId("scheduleView")?.classList.remove("hidden");
    byId("listView")?.classList.add("hidden");
    renderWeekHeader();
    renderDayTabs();
    renderStats();
    renderOccupancy();
    renderWaitlistPanel();
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

  applyTabMode(tab);
  updateNotificationBell();
  updateAllI18nBindings();
  syncMobileState();
}

/* ----------------------------------------------------------
   Initialize
   ---------------------------------------------------------- */

async function initialize() {
  restoreLanguage();
  updateLangSwitchButton();

  const stored = await loadStoredState();
  hydrateState(stored);

  if (!state.weekISO) state.weekISO = sundayISO();
  state.activeDay = todayDayIdx();
  if (!state.rooms || !state.rooms.length) state.rooms = DEFAULT_ROOMS.map(r => ({ ...r }));
  if (!state.staff || !state.staff.length) state.staff = DEFAULT_STAFF.map(s => ({ ...s }));
  if (!state.defaultTemplate || !state.defaultTemplate.length) {
    const { buildDefaultSchedule, templateFromEntries } = await import('./calendar/state.js');
    state.defaultTemplate = templateFromEntries(buildDefaultSchedule(state.weekISO, state.rooms), state.rooms);
  }

  state.modes = state.modes || { staff: "view", meetings: "view", resources: "browse", issues: "board", requests: "view", calendar: "schedule" };
  state._meetingsSeeded = state._meetingsSeeded || (state.meetings && state.meetings.length > 0);

  state.sidebarCollapsed = localStorage.getItem("sidebar_collapsed") === "true";
  if (state.sidebarCollapsed) {
    document.querySelector(".app-layout")?.classList.add("sidebar-collapsed");
  }

  await bootstrapAdmin();
  cleanExpiredWaitlist();
  expandRecurringEntries(8);
  autoMaintainMeetingWindow();

  initCloudSync();

  const loggedIn = restoreSession();
  if (loggedIn) {
    byId("loginSection").classList.add("hidden");
    byId("appSection").classList.remove("hidden");
    byId("appSection").style.display = "";
    applyAccessControl();
    renderSessionBar();
    registerActivity();
    restoreEncryptionKey().catch(() => {});
  }

  if (state.currentUser) {
    const firstTab = state.activeTab === "adminTab" && !isAdmin()
      ? "dashboardTab"
      : (state.activeTab || "dashboardTab");
    state.activeTab = firstTab;
  }

  initCalendarEvents();
  initStaffEvents();
  await initMeetingsEvents();
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
    byId("appSection").style.display = "none";
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

    // Dev auth bypass
    if (DEV_LOGIN_ENABLED) {
      const legacy = { admin: { pass: "admin123", role: "admin", label: "מנהל מערכת" }, staff: { pass: "staff123", role: "staff", label: "צוות" } };
      const match = legacy[u];
      if (match && match.pass === p) {
        role = match.role; label = match.label; verified = true;
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
    localStorage.setItem("clinic_session", JSON.stringify({ username: u, role, staffId }));
    setEncryptionPassword(p).catch(() => {});
    byId("loginSection").classList.add("hidden");
    byId("appSection").classList.remove("hidden");
    byId("appSection").style.display = "";
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
  if (state.currentUser) renderActiveTab();
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
    Boot
    ---------------------------------------------------------- */

window.addEventListener("beforeunload", persistStateImmediate);

initNavigation();
initLogin();
await initialize();
initNotificationCenter();
initMobileNav({ showTab, renderActiveTab, switchLang });
initCloudSyncButtons();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export { showTab, renderActiveTab, renderBookingList };

