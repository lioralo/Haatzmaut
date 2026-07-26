import { byId, esc, generatePassword, passwordForUser, showToast, makeId } from '../core/index.js';
import { state, isAdmin, getStaffById, persistState, recordAudit } from '../core/index.js';
import { t } from '../core/i18n.js';
import { DEFAULT_PERMISSIONS } from './state.js';

export function renderAdminUsers() {
  const list = byId("adminUserList");
  if (!list) return;
  list.innerHTML = state.users.map(u => `
    <div class="admin-row">
      <div class="admin-row-info">
        <strong>${esc(u.username)}</strong>
        <span class="muted small">${esc(u.fullName || "—")} · ${esc(u.email || "—")} · ${esc(u.phone || "—")}</span>
        <span class="user-role-badge ${u.role === "admin" ? "role-admin" : "role-staff"}">${u.role === "admin" ? "מנהל" : "צוות"}</span>
        <span class="muted small">${u.staffId ? `משויך: ${esc(getStaffById(u.staffId)?.fullName || "לא נמצא")}` : "ללא שיוך לאיש צוות"}</span>
        ${!u.active ? `<span class="muted small">מושבת פעולה</span>` : ""}
      </div>
      <div class="admin-row-acts">
        <button class="btn-sm" data-action="edit-user" data-user-id="${u.id}">עריכה</button>
        <button class="btn-sm" data-action="reset-pwd" data-user-id="${u.id}">איפוס סיסמה</button>
        <button class="btn-sm ${u.active ? "secondary" : ""}" data-action="toggle-user" data-user-id="${u.id}">${u.active ? "השבת" : "אפשר"}</button>
      </div>
    </div>
  `).join("") || `<p class="empty-state">אין משתמשים.</p>`;

  list.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const user = state.users.find(u => u.id === btn.dataset.userId);
      if (!user) return;
      if (btn.dataset.action === "edit-user") {
        byId("adminUserId").value = user.id;
        byId("adminUserName").value = user.username;
        byId("adminUserRole").value = user.role;
        byId("adminUserStaff").value = user.staffId || "";
        const fn = byId("adminUserFullName");
        if (fn) fn.value = user.fullName || "";
        const em = byId("adminUserEmail");
        if (em) em.value = user.email || "";
        const ph = byId("adminUserPhone");
        if (ph) ph.value = user.phone || "";
        byId("adminUserSaveBtn").textContent = "עדכן משתמש";
        byId("adminUserClearBtn").classList.remove("hidden");
        return;
      }
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

  const currentUser = state.currentUser;
  const selfUser = currentUser ? state.users.find(u => u.username === currentUser.username) : null;

  container.innerHTML = `
    <div class="section-head"><h2>${t("staff.title")}</h2></div>
    ${/* Staff stats bar matching prototype */ ''}
    <div class="staff-stats-bar">
      <div class="staff-stat-item" style="background:rgba(46,125,50,.06);border-color:rgba(46,125,50,.15)">
        <span class="material-symbols-outlined staff-stat-icon" style="color:var(--success)">check_circle</span>
        <div>
          <div class="staff-stat-val">${staff.filter(s => s.active !== false).length}</div>
          <div class="staff-stat-label">בתפקיד</div>
        </div>
      </div>
      <div class="staff-stat-item" style="background:rgba(75,98,100,.06);border-color:rgba(75,98,100,.15)">
        <span class="material-symbols-outlined staff-stat-icon" style="color:var(--secondary)">pause_circle</span>
        <div>
          <div class="staff-stat-val">0</div>
          <div class="staff-stat-label">בהפסקה</div>
        </div>
      </div>
      <div class="staff-stat-item" style="background:rgba(111,121,122,.06);border-color:rgba(111,121,122,.15)">
        <span class="material-symbols-outlined staff-stat-icon" style="color:var(--outline)">event_busy</span>
        <div>
          <div class="staff-stat-val">${staff.filter(s => s.active === false).length}</div>
          <div class="staff-stat-label">חופשה</div>
        </div>
      </div>
      <div class="staff-stat-item" style="background:rgba(186,26,26,.06);border-color:rgba(186,26,26,.15)">
        <span class="material-symbols-outlined staff-stat-icon" style="color:var(--urgent)">notification_important</span>
        <div>
          <div class="staff-stat-val">${(state.requests || []).filter(r => r.status === 'pending').length}</div>
          <div class="staff-stat-label">בקשות ממתינות</div>
        </div>
      </div>
    </div>
    ${selfUser ? `
    <details class="filter-collapsible" id="profileEditSection">
      <summary>${t("profile.myProfile")} (${esc(selfUser.username)})</summary>
      <form id="profileEditForm" class="grid-form compact-form" style="margin-top:.5rem">
        <label>${t("profile.fullName")} <input id="profileFullName" value="${esc(selfUser.fullName || '')}" /></label>
        <label>${t("staff.email")} <input id="profileEmail" type="email" value="${esc(selfUser.email || '')}" /></label>
        <label>${t("staff.phone")} <input id="profilePhone" type="tel" value="${esc(selfUser.phone || '')}" /></label>
        <label>${t("profile.newPassword")} <input id="profileNewPassword" type="password" placeholder="${t("profile.passwordPlaceholder")}" /></label>
        <div class="form-actions">
          <button type="submit" class="btn-sm">${t("profile.saveProfile")}</button>
        </div>
      </form>
    </details>
    ` : ""}
    <input id="staffSearchInput" class="search-input" placeholder="${t("staff.search")}" value="${esc(search || "")}" style="width:100%;margin-bottom:.75rem" />
    ${/* Stats bar */''}
    <div class="stats-row">
      <div class="stat-card">
        <span>בתפקיד</span>
        <strong>${staff.filter(s => s.active !== false).length}</strong>
      </div>
      <div class="stat-card">
        <span>סה"כ צוות</span>
        <strong>${staff.length}</strong>
      </div>
      <div class="stat-card">
        <span>צוותים</span>
        <strong>${new Set(staff.map(s => s.team).filter(Boolean)).size}</strong>
      </div>
      <div class="stat-card" style="border-color:var(--urgent);background:rgba(198,40,40,.05)">
        <span style="color:var(--urgent)">לא פעילים</span>
        <strong style="color:var(--urgent)">${staff.filter(s => s.active === false).length}</strong>
      </div>
    </div>
    ${/* Staff grid — glass cards */ ''}
    <div class="staff-glass-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;margin-top:.5rem">
      ${staff.length ? staff.map(s => {
        const initials = (s.fullName || "").split(" ").map(w => w[0] || "").join("").slice(0, 2) || "?";
        const isActive = s.active !== false;
        const statusColor = isActive ? "var(--success)" : "var(--outline)";
        const statusLabel = isActive ? "פעיל" : "לא פעיל";
        const avatarBg = s.color || `hsl(${(s.fullName || "").length * 47 % 360}, 25%, 85%)`;
        return `<div class="glass-staff-card" style="background:rgba(255,255,255,0.92);backdrop-filter:blur(10px);border:1px solid var(--line);border-radius:16px;padding:1.2rem;display:flex;flex-direction:column;gap:.6rem;transition:box-shadow 150ms">
          <div style="display:flex;align-items:flex-start;gap:1rem">
            <div style="position:relative;flex-shrink:0">
              <div style="width:56px;height:56px;border-radius:16px;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;color:var(--primary);border:2px solid var(--line)">${esc(initials)}</div>
              <div style="position:absolute;bottom:-2px;inset-inline-end:-2px;width:16px;height:16px;border-radius:50%;background:${statusColor};border:3px solid #fff" title="${statusLabel}"></div>
            </div>
            <div style="flex:1;min-width:0">
              <h3 style="font-family:'Manrope',sans-serif;font-weight:700;font-size:1.05rem;color:var(--primary);margin:0">${esc(s.fullName)}</h3>
              <div style="font-size:.82rem;color:var(--muted);margin-top:2px">${esc(s.role || "—")}</div>
              <div style="display:flex;gap:.3rem;margin-top:4px;flex-wrap:wrap">
                ${s.team ? `<span style="font-size:.7rem;padding:2px 8px;border-radius:999px;background:var(--secondary-soft);color:var(--secondary);font-weight:600">${esc(s.team)}</span>` : ""}
                <span style="font-size:.7rem;padding:2px 8px;border-radius:999px;background:${isActive ? 'var(--primary-soft)' : 'var(--danger-soft)'};color:${isActive ? 'var(--primary)' : 'var(--danger)'};font-weight:600">${statusLabel}</span>
              </div>
            </div>
          </div>
          ${s.phone ? `<div style="font-size:.82rem;color:var(--muted);display:flex;align-items:center;gap:.35rem"><span class="material-symbols-outlined" style="font-size:16px">call</span><span dir="ltr">${esc(s.phone)}</span></div>` : ""}
          ${s.email ? `<div style="font-size:.82rem;color:var(--primary);display:flex;align-items:center;gap:.35rem"><span class="material-symbols-outlined" style="font-size:16px">mail</span>${esc(s.email)}</div>` : ""}
          ${isAdmin() ? `<div style="margin-top:.4rem;display:flex;gap:.4rem;padding-top:.6rem;border-top:1px solid var(--line)">
            <button class="btn-sm" data-edit-staff="${s.id}" style="flex:1;border:1px solid var(--primary);background:transparent;color:var(--primary)">עריכה</button>
            <button class="btn-sm danger" data-del-staff="${s.id}" style="flex-shrink:0">מחיקה</button>
          </div>` : ""}
        </div>`;
      }).join("") : '<div class="empty-state" style="grid-column:1/-1">לא נמצאו אנשי צוות</div>'}
    </div>
    <div class="section-head" style="margin-top:1.5rem"><h2>${t("staff.users")}</h2></div>
    <div class="users-card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.75rem;margin-top:.5rem">
      ${(state.users || []).length
        ? state.users.map(u => {
            const linkedStaff = u.staffId ? getStaffById(u.staffId) : null;
            return `<div class="staff-card" style="display:flex;flex-direction:column;gap:.3rem;padding:.75rem">
              <strong>${esc(u.username)}</strong>
              <span class="user-role-badge ${u.role === 'admin' ? 'role-admin' : 'role-staff'}">${u.role === 'admin' ? 'מנהל' : 'צוות'}</span>
              ${linkedStaff ? `<span class="muted small">משויך: ${esc(linkedStaff.fullName)}</span>` : `<span class="muted small">ללא שיוך</span>`}
              <div style="margin-top:.25rem">
                <button class="btn-sm" data-action="toggle-user-card" data-user-id="${u.id}">${u.active !== false ? t("staff.disable") : t("staff.enable")}</button>
              </div>
            </div>`;
          }).join("")
        : '<p class="empty-state">אין משתמשים.</p>'
      }
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

  container.querySelectorAll("[data-action='toggle-user-card']").forEach(btn => {
    btn.addEventListener("click", () => {
      const user = state.users.find(u => u.id === btn.dataset.userId);
      if (!user) return;
      user.active = !user.active;
      persistState();
      recordAudit("user.status.toggle", `${user.username} => ${user.active ? "active" : "inactive"}`, "critical", false);
      renderStaffDirectory();
    });
  });

  const profileForm = container.querySelector("#profileEditForm");
  if (profileForm) {
    profileForm.addEventListener("submit", async e => {
      e.preventDefault();
      if (!selfUser) return;
      selfUser.fullName = byId("profileFullName")?.value?.trim() || "";
      selfUser.email = byId("profileEmail")?.value?.trim() || "";
      selfUser.phone = byId("profilePhone")?.value?.trim() || "";
      const newPwd = byId("profileNewPassword")?.value || "";
      if (newPwd) {
        const { passwordForUser } = await import('../core/index.js');
        const { salt, passwordHash } = await passwordForUser(newPwd);
        selfUser.passwordHash = passwordHash;
        selfUser.salt = salt;
      }
      persistState();
      showToast("פרופיל עודכן.", "info");
      recordAudit("user.profile.edit", `${selfUser.username} ערך/ערכה את הפרופיל.`, "info", false);
      addNotification("פרופיל עודכן בהצלחה.");
      renderStaffDirectory();
    });
  }
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
        </div>
        <div class="staff-upload-row" style="margin-top:.35rem">
          <label class="file-upload-label">בחר קובץ <input type="file" id="staffUpload" accept=".csv,.json" /></label>
          <span id="staffFileSelected" class="small muted"></span>
          <button id="staffUploadStartBtn" class="btn-sm" disabled>העלה</button>
        </div>
        <div id="adminStaffList" class="admin-list"></div>
      </article>
      <article class="panel">
        <h3 class="panel-title">משתמשים</h3>
        <form id="adminUserForm" class="grid-form compact-form">
          <input type="hidden" id="adminUserId" />
          <label>שם משתמש <input id="adminUserName" required /></label>
          <label>שם מלא <input id="adminUserFullName" /></label>
          <label>דוא"ל <input id="adminUserEmail" type="email" /></label>
          <label>טלפון <input id="adminUserPhone" type="tel" /></label>
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
