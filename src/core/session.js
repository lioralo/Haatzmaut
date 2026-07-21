/* ============================================================
   SESSION - authentication & session management module
   ============================================================ */

import {
  DEV_LOGIN_ENABLED,
  SESSION_TIMEOUT_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MS,
  LOGIN_WINDOW_MS
} from './constants.js';

import {
  state,
  isAdmin,
  getStaffById,
  persistState,
  recordAudit
} from './store.js';

import {
  byId,
  normalizeUsernameInput,
  verifyPassword,
  migrateUserPassword,
  showToast
} from './utils.js';

/* ----------------------------------------------------------
   Session timer
   ---------------------------------------------------------- */

let sessionTimeoutId = null;

function registerActivity() {
  if (!state.currentUser) return;
  clearTimeout(sessionTimeoutId);
  sessionTimeoutId = setTimeout(() => {
    if (!state.currentUser) return;
    recordAudit("session.timeout", "פג תוקף התחברות עקב חוסר פעילות.", "warn", false);
    logoutCurrentUser("ההתחברות פגה עקב חוסר פעילות. יש להתחבר מחדש.");
  }, SESSION_TIMEOUT_MS);
}

function clearSessionTimer() {
  clearTimeout(sessionTimeoutId);
  sessionTimeoutId = null;
}

/* ----------------------------------------------------------
   Login security
   ---------------------------------------------------------- */

function pruneLoginFailures(nowTs = Date.now()) {
  state.loginSecurity.failures = state.loginSecurity.failures.filter(ts => (nowTs - ts) <= LOGIN_WINDOW_MS);
}

function resetLoginGuard(shouldPersist = true) {
  state.loginSecurity.failures = [];
  state.loginSecurity.lockUntil = 0;
  if (shouldPersist) persistState();
}

function registerFailedLogin() {
  const nowTs = Date.now();
  pruneLoginFailures(nowTs);
  state.loginSecurity.failures.push(nowTs);
  if (state.loginSecurity.failures.length >= LOGIN_MAX_ATTEMPTS) {
    state.loginSecurity.lockUntil = nowTs + LOGIN_LOCKOUT_MS;
    recordAudit("auth.lockout", "נחסמה כניסה זמנית עקב ניסיונות כושלים.", "critical", false);
  }
  persistState();
}

function isLoginLocked() {
  const nowTs = Date.now();
  if (state.loginSecurity.lockUntil > nowTs) {
    return true;
  }
  if (state.loginSecurity.lockUntil) {
    resetLoginGuard();
  }
  return false;
}

/* ----------------------------------------------------------
   Login / Logout
   ---------------------------------------------------------- */

async function handleLogin(username, password) {
  pruneLoginFailures();
  if (isLoginLocked()) {
    const remaining = state.loginSecurity.lockUntil - Date.now();
    const minutes = Math.max(1, Math.ceil(remaining / 60000));
    return { success: false, error: `המערכת נעולה. נסה שוב בעוד ${minutes} דקות.` };
  }

  let user = null;
  try {
    const normalized = normalizeUsernameInput(username);
    user = state.users.find(u => u.username === normalized && u.active !== false);
  } catch (err) {
    return { success: false, error: err.message };
  }

  if (!user && DEV_LOGIN_ENABLED) {
    const normalized = String(username).trim().toLowerCase();
    if (normalized === "admin" && password === "admin123") {
      state.currentUser = { username: "admin", role: "admin", label: "admin", staffId: "" };
      sessionStorage.setItem("clinic_user", JSON.stringify(state.currentUser));
      resetLoginGuard();
      recordAudit("auth.login", "מנהל התחבר (dev)", "info", true);
      return { success: true, role: "admin", label: "admin", staffId: "" };
    }
  }

  if (!user) {
    registerFailedLogin();
    return { success: false, error: "שם משתמש או סיסמה שגויים." };
  }

  let valid = false;
  if (user.passwordHash && user.salt) {
    valid = await verifyPassword(password, user.passwordHash, user.salt);
  }

  if (!valid && user.password) {
    if (password === user.password) {
      await migrateUserPassword(user, password);
      persistState();
      valid = true;
    }
  }

  if (!valid) {
    registerFailedLogin();
    return { success: false, error: "שם משתמש או סיסמה שגויים." };
  }

  const staffRecord = user.staffId ? getStaffById(user.staffId) : null;
  const label = staffRecord ? staffRecord.fullName : user.username;
  state.currentUser = { username: user.username, role: user.role, label, staffId: user.staffId || "" };
  sessionStorage.setItem("clinic_user", JSON.stringify(state.currentUser));
  resetLoginGuard();
  recordAudit("auth.login", `${user.username} התחבר.`, "info", true);
  return { success: true, role: user.role, label, staffId: user.staffId || "" };
}

function logoutCurrentUser(message = "") {
  state.currentUser = null;
  clearSessionTimer();
  sessionStorage.removeItem("clinic_user");
  if (message) showToast(message, "warn");
}

/* ----------------------------------------------------------
   Access control
   ---------------------------------------------------------- */

function applyAccessControl() {
  const admin = isAdmin();
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !admin));
}

/* ----------------------------------------------------------
   Session bar
   ---------------------------------------------------------- */

function renderSessionBar() {
  const bar = document.getElementById("sessionBar");
  if (!bar) return;
  if (!state.currentUser) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  document.getElementById("activeUser").textContent = `מחובר: ${state.currentUser.username}`;
  document.getElementById("activeRole").textContent = state.currentUser.role === "admin" ? "מנהל מערכת" : "צוות";
}

/* ----------------------------------------------------------
   Session restore
   ---------------------------------------------------------- */

function restoreSession() {
  const stored = sessionStorage.getItem("clinic_user");
  if (!stored) return false;
  try {
    const parsed = JSON.parse(stored);
    state.currentUser = { username: parsed.username, role: parsed.role, label: parsed.username, staffId: parsed.staffId || "" };
    return true;
  } catch {
    state.currentUser = { username: stored, role: stored === "admin" ? "admin" : "staff", label: stored };
    return true;
  }
}

/* ----------------------------------------------------------
   Exports
   ---------------------------------------------------------- */

export {
  registerActivity,
  clearSessionTimer,
  handleLogin,
  logoutCurrentUser,
  applyAccessControl,
  renderSessionBar,
  restoreSession,
  isLoginLocked,
  resetLoginGuard,
  registerFailedLogin,
  isAdmin
};
