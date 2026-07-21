import { byId, esc, generatePassword, passwordForUser, showToast, makeId } from '../core/index.js';
import { state, isAdmin, getStaffById, persistState, recordAudit } from '../core/index.js';
import { DEFAULT_PERMISSIONS } from './state.js';

export function renderAdminUsers() {
  const list = byId("adminUserList");
  if (!list) return;
  list.innerHTML = state.users.map(u => `
    <div class="admin-row">
      <div class="admin-row-info">
        <strong>${esc(u.username)}</strong>
        <span class="user-role-badge ${u.role === "admin" ? "role-admin" : "role-staff"}">${u.role === "admin" ? "מנהל" : "צוות"}</span>
        <span class="muted small">${u.staffId ? `משויך: ${esc(getStaffById(u.staffId)?.fullName || "לא נמצא")}` : "ללא שיוך לאיש צוות"}</span>
        ${!u.active ? `<span class="muted small">מושבת פעולה</span>` : ""}
      </div>
      <div class="admin-row-acts">
        <button class="btn-sm" data-action="reset-pwd" data-user-id="${u.id}">איפוס סיסמה</button>
        <button class="btn-sm ${u.active ? "secondary" : ""}" data-action="toggle-user" data-user-id="${u.id}">${u.active ? "השבת" : "אפשר"}</button>
      </div>
    </div>
  `).join("") || `<p class="empty-state">אין משתמשים.</p>`;

  list.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const user = state.users.find(u => u.id === btn.dataset.userId);
      if (!user) return;
      if (btn.dataset.action === "reset-pwd") {
        const rawPwd = generatePassword();
        passwordForUser(rawPwd).then(({ salt, passwordHash }) => {
          user.passwordHash = passwordHash;
          user.salt = salt;
          persistState();
        });
        showNewPassword(user.username, rawPwd);
        recordAudit("user.password.reset", `בוצע איפוס סיסמה למשתמש ${user.username}.`, "critical", false);
        addNotification(`סיסמת ${user.username} אופסה.`);
      } else if (btn.dataset.action === "toggle-user") {
        user.active = !user.active;
        persistState();
        recordAudit("user.status.toggle", `${user.username} => ${user.active ? "active" : "inactive"}`, "critical", false);
        renderAdminUsers();
      }
    });
  });
}

export function renderAdminStaff() {
  const list = byId("adminStaffList");
  if (!list) return;
  list.innerHTML = state.staff.map(p => `
    <div class="admin-row">
      <div class="admin-row-info">
        <strong>${esc(p.fullName)}</strong>
        <span class="muted small">${esc(p.role)} · ${esc(p.team)}</span>
        <span class="muted small">${esc(p.phone)} | ${esc(p.email)}</span>
      </div>
      <div class="admin-row-acts">
        <button class="btn-sm" data-action="edit-staff" data-staff-id="${p.id}">עריכה</button>
        <button class="btn-sm danger" data-action="del-staff" data-staff-id="${p.id}">מחיקה</button>
      </div>
    </div>
  `).join("") || `<p class="empty-state">אין צוות.</p>`;

  list.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const person = state.staff.find(p => p.id === btn.dataset.staffId);
      if (!person) return;
      if (btn.dataset.action === "edit-staff") {
        byId("adminStaffId").value    = person.id;
        byId("adminStaffName").value  = person.fullName;
        byId("adminStaffPhone").value = person.phone;
        byId("adminStaffEmail").value = person.email;
        byId("adminStaffRole").value  = person.role;
        byId("adminStaffTeam").value  = person.team;
        byId("adminStaffSaveBtn").textContent = "עדכון איש צוות";
        byId("adminStaffClearBtn").classList.remove("hidden");
        byId("adminStaffName").focus();
      } else {
        if (!confirm(`למחוק את ${person.fullName}?`)) return;
        state.staff = state.staff.filter(p => p.id !== person.id);
        state.users = state.users.map(u => u.staffId === person.id ? { ...u, staffId: "" } : u);
        persistState();
        renderAdminStaff();
        renderAdminUsers();
        repopulateSelects();
        addNotification(`${person.fullName} הוסר/ה.`);
      }
    });
  });
}

export function renderAdminResetRequests() {
  const box = byId("adminResetRequests");
  if (!box) return;
  if (!state.passwordResets.length) {
    box.innerHTML = `<p class="empty-state">אין בקשות.</p>`;
    return;
  }
  box.innerHTML = state.passwordResets.map(r => `
    <div class="reset-req-banner">
      <strong>${esc(r.username)}</strong> בקש/ה איפוס סיסמה &middot; <small>${esc(r.requestedAt)}</small>
      <div class="notice-actions">
        <button class="btn-sm" data-req-reset-id="${r.id}" data-action="do-reset">אפס והצג סיסמא</button>
        <button class="btn-sm secondary" data-req-reset-id="${r.id}" data-action="dismiss-reset">בטל</button>
      </div>
    </div>
  `).join("");

  box.querySelectorAll("[data-req-reset-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const req = state.passwordResets.find(r => r.id === btn.dataset.reqResetId);
      if (!req) return;
      if (btn.dataset.action === "do-reset") {
        const user = state.users.find(u => u.username === req.username);
        if (!user) { showToast("משתמש לא נמצא.", "error"); }
        else {
          const rawPwd = generatePassword();
          passwordForUser(rawPwd).then(({ salt, passwordHash }) => {
            user.passwordHash = passwordHash;
            user.salt = salt;
            persistState();
          });
          showNewPassword(user.username, rawPwd);
          recordAudit("user.password.reset.requested", `אופסה סיסמה לפי בקשה עבור ${user.username}.`, "critical", false);
          addNotification(`סיסמת ${user.username} אופסה לפי בקשה.`);
        }
      }
      if (btn.dataset.action === "dismiss-reset") {
        recordAudit("password.reset.dismiss", `נדחתה בקשת איפוס עבור ${req.username}.`, "warn", false);
      }
      state.passwordResets = state.passwordResets.filter(r => r.id !== req.id);
      persistState();
      renderAdminResetRequests();
    });
  });
}

export function showNewPassword(username, pwd) {
  const box = byId("adminUserNewPwd");
  if (!box) return;
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="generated-pwd">
      <span>משתמש: <strong>${esc(username)}</strong> &nbsp;&nbsp; סיסמא חדשה:</span>
      <strong class="pwd-display">${esc(pwd)}</strong>
      <button class="btn-sm pwd-copy" data-pwd="${esc(pwd)}">העתק</button>
    </div>
    <p class="muted small">חשוף סיסמא זו למשתמש בלבד – לא תוצג שוב.</p>
  `;
  const copyBtn = box.querySelector(".pwd-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const pwdText = copyBtn.dataset.pwd;
      navigator.clipboard.writeText(pwdText).then(() => {
        copyBtn.textContent = "הועתק";
      }).catch(() => {});
    });
  }
}

export function renderStaffProfile() {
  const container = byId("staffProfileContainer");
  if (!container) return;
  const currentUser = state.currentUser;
  if (!currentUser) {
    container.innerHTML = `<p class="empty-state">לא מחובר.</p>`;
    return;
  }
  const staffRecord = currentUser.staffId ? getStaffById(currentUser.staffId) : null;
  const perms = DEFAULT_PERMISSIONS[currentUser.role] || DEFAULT_PERMISSIONS.staff;
  const permLabels = {
    canEditSchedule: "ניהול לו\"ז",
    canManageStaff: "ניהול צוות",
    canManageUsers: "ניהול משתמשים",
    canManageResources: "ניהול משאבים",
    canApproveRequests: "אישור בקשות",
    canReportIssues: "דיווח תקלות",
    canManageRooms: "ניהול חדרים",
    canViewAudit: "צפייה ביומן בקרה"
  };

  container.innerHTML = `
    <div class="staff-profile">
      <div class="profile-header">
        <h3>פרופיל ${currentUser.role === "admin" ? "מנהל" : "צוות"}</h3>
        <strong>${esc(currentUser.username)}</strong>
        ${staffRecord ? `<span class="muted"> · ${esc(staffRecord.fullName)}</span>` : ""}
        <span class="user-role-badge ${currentUser.role === "admin" ? "role-admin" : "role-staff"}">${currentUser.role === "admin" ? "מנהל" : "צוות"}</span>
      </div>
      <div class="profile-permissions">
        <h4>הרשאות</h4>
        <ul class="perm-list">
          ${Object.entries(permLabels).map(([key, label]) => `
            <li class="perm-item${perms[key] ? " perm-granted" : " perm-denied"}">
              <span class="perm-icon">${perms[key] ? "&#10003;" : "&#10007;"}</span>
              <span>${label}</span>
            </li>
          `).join("")}
        </ul>
      </div>
    </div>
  `;
}

export function renderPermissionMatrix() {
  const container = byId("permissionMatrixContainer");
  if (!container) return;
  const roles = ["admin", "staff"];
  const permKeys = Object.keys(DEFAULT_PERMISSIONS.admin);
  const permLabels = {
    canEditSchedule: "ניהול לו\"ז",
    canManageStaff: "ניהול צוות",
    canManageUsers: "ניהול משתמשים",
    canManageResources: "ניהול משאבים",
    canApproveRequests: "אישור בקשות",
    canReportIssues: "דיווח תקלות",
    canManageRooms: "ניהול חדרים",
    canViewAudit: "צפייה ביומן בקרה"
  };

  container.innerHTML = `
    <table class="perm-matrix">
      <thead>
        <tr>
          <th>הרשאה</th>
          ${roles.map(r => `<th>${r === "admin" ? "מנהל" : "צוות"}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${permKeys.map(key => `
          <tr>
            <td>${permLabels[key] || key}</td>
            ${roles.map(role => `
              <td>
                <input type="checkbox"
                  data-role="${role}"
                  data-perm="${key}"
                  ${DEFAULT_PERMISSIONS[role][key] ? " checked" : ""}
                  ${role === "admin" ? " disabled" : ""} />
              </td>
            `).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  container.querySelectorAll("input[type='checkbox']:not([disabled])").forEach(cb => {
    cb.addEventListener("change", () => {
      const role = cb.dataset.role;
      const perm = cb.dataset.perm;
      if (DEFAULT_PERMISSIONS[role]) {
        DEFAULT_PERMISSIONS[role][perm] = cb.checked;
        renderPermissionMatrix();
      }
    });
  });
}

function addNotification(text, critical = false) {
  state.notifications.unshift({ id: makeId("note"), text, critical, at: new Date().toLocaleString("he-IL") });
  persistState();
}

function repopulateSelects() {
  const userStaffSel = byId("adminUserStaff");
  if (userStaffSel) {
    const cur = userStaffSel.value;
    userStaffSel.innerHTML = `<option value="">ללא שיוך</option>${state.staff.map(p => `<option value="${p.id}">${esc(p.fullName)}</option>`).join("")}`;
    if (state.staff.some(s => s.id === cur)) userStaffSel.value = cur;
  }
}

/* ----------------------------------------------------------
   STAFF DIRECTORY (view mode)
   ---------------------------------------------------------- */
export function renderStaffDirectory() {
  const container = document.getElementById("staffViewMode");
  if (!container) return;
  const search = (state.staffSearch || "").toLowerCase();
  let staff = state.staff || [];
  if (search) staff = staff.filter(s => s.fullName.toLowerCase().includes(search) || s.role.toLowerCase().includes(search));

  container.innerHTML = `
    <div class="section-head"><h2>צוות המרפאה</h2></div>
    <input id="staffSearchInput" class="search-input" placeholder="חיפוש בצוות..." value="${esc(search || "")}" style="width:100%;margin-bottom:.75rem" />
    <div class="table-scroll" style="border-radius:8px">
      <table class="occ-table" style="font-size:.84rem;width:100%">
        <thead><tr>
          <th>שם מלא</th><th>טלפון</th><th>דוא"ל</th><th>תפקיד</th><th>צוות</th><th>סטטוס</th>
          ${isAdmin() ? '<th style="width:100px">פעולות</th>' : ''}
        </tr></thead>
        <tbody>${staff.length ? staff.map(s => `
          <tr data-staff-id="${s.id}">
            <td><strong>${esc(s.fullName)}</strong></td>
            <td dir="ltr">${esc(s.phone)}</td>
            <td>${esc(s.email)}</td>
            <td>${esc(s.role)}</td>
            <td>${esc(s.team)}</td>
            <td>${s.active !== false ? 'פעיל' : 'מושבת'}</td>
            ${isAdmin() ? `<td>
              <button class="btn-sm" data-edit-staff="${s.id}">עריכה</button>
              <button class="btn-sm secondary" data-del-staff="${s.id}">מחיקה</button>
            </td>` : ''}
          </tr>
        `).join("") : '<tr><td colspan="7" class="empty-state">לא נמצאו אנשי צוות</td></tr>'}</tbody>
      </table>
    </div>
  `;

  document.getElementById("staffSearchInput")?.addEventListener("input", e => {
    state.staffSearch = e.target.value;
    renderStaffDirectory();
  });

  container.querySelectorAll("[data-edit-staff]").forEach(btn => {
    btn.addEventListener("click", () => {
      import('./events.js').then(m => m.editStaff(btn.dataset.editStaff));
    });
  });
  container.querySelectorAll("[data-del-staff]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("למחוק את איש הצוות?")) {
        import('./events.js').then(m => m.deleteStaffById(btn.dataset.delStaff));
      }
    });
  });
}

/* ----------------------------------------------------------
   STAFF ACCORDION (edit mode)
   ---------------------------------------------------------- */
export function renderStaffAccordion() {
  const container = document.getElementById("staffEditMode");
  if (!container) return;
  container.innerHTML = `
    <div class="admin-two-col">
      <article class="panel">
        <h3 class="panel-title">פרטי איש צוות</h3>
        <form id="adminStaffForm" class="grid-form compact-form">
          <input type="hidden" id="adminStaffId" />
          <label>שם מלא <input id="adminStaffName" required /></label>
          <label>טלפון <input id="adminStaffPhone" type="tel" /></label>
          <label>דוא"ל <input id="adminStaffEmail" type="email" /></label>
          <label>תפקיד <input id="adminStaffRole" /></label>
          <label>צוות <select id="adminStaffTeam"></select></label>
          <div class="form-actions">
            <button id="adminStaffSaveBtn" type="submit">הוסף</button>
            <button id="adminStaffClearBtn" type="button" class="secondary hidden">ניקוי</button>
          </div>
        </form>
        <div class="template-links">
          <a href="templates/staff_template.csv" download>תבנית CSV</a>
          <button id="exportStaffBtn" class="btn-link">הורד CSV</button>
          <label class="file-upload-label">יבוא <input type="file" id="staffUpload" accept=".csv,.json" /></label>
        </div>
        <div id="adminStaffList" class="admin-list"></div>
      </article>
      <article class="panel">
        <h3 class="panel-title">משתמשים</h3>
        <form id="adminUserForm" class="grid-form compact-form">
          <input type="hidden" id="adminUserId" />
          <label>שם משתמש <input id="adminUserName" required /></label>
          <label>תפקיד <select id="adminUserRole"><option value="staff">צוות</option><option value="admin">מנהל</option></select></label>
          <label>שיוך <select id="adminUserStaff"><option value="">ללא</option></select></label>
          <div class="form-actions">
            <button id="adminUserSaveBtn" type="submit">צור משתמש</button>
            <button id="adminUserClearBtn" type="button" class="secondary hidden">ניקוי</button>
          </div>
        </form>
        <div id="adminUserNewPwd" class="hidden"></div>
        <h4>בקשות איפוס</h4>
        <div id="adminResetRequests"></div>
        <h4>משתמשים</h4>
        <div id="adminUserList" class="admin-list"></div>
      </article>
    </div>
  `;
  renderAdminUsers();
  renderAdminStaff();
  renderAdminResetRequests();
  repopulateSelects();
  import('./events.js').then(m => m.initStaffEvents());
}
