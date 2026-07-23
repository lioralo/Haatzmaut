import {
  byId,
  makeId,
  esc,
  generatePassword,
  passwordForUser,
  normalizeUser,
  enforceMaxLength,
  normalizeUsernameInput,
  showToast,
  validatePhoneIL,
  formatPhoneForDisplay
} from '../core/index.js';
import {
  state,
  isAdmin,
  persistState,
  recordAudit
} from '../core/index.js';
import {
  normalizeStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  createUser,
  toggleUserActive,
  resetUserPassword,
  requestPasswordReset,
  resolvePasswordReset,
  dismissPasswordReset,
  DEFAULT_PERMISSIONS
} from './state.js';
import {
  renderAdminUsers,
  renderAdminStaff,
  renderAdminResetRequests,
  showNewPassword,
  renderStaffProfile,
  renderPermissionMatrix
} from './render.js';

export function initStaffEvents() {

  /* Admin – user form */
  byId("adminUserForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!isAdmin()) return;
    const editId = byId("adminUserId").value;
    let uname;
    try {
      uname = normalizeUsernameInput(byId("adminUserName").value);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }
    const role = byId("adminUserRole").value;
    const staffId = byId("adminUserStaff").value;
    const fullName = (byId("adminUserFullName")?.value || "").trim();
    const email = (byId("adminUserEmail")?.value || "").trim();
    const phone = (byId("adminUserPhone")?.value || "").trim();

    if (editId) {
      const existing = state.users.find(u => u.id === editId);
      if (!existing) { showToast("משתמש לא נמצא.", "error"); return; }
      const dupName = state.users.find(u => u.username === uname && u.id !== editId);
      if (dupName) { showToast("שם משתמש תפוס.", "error"); return; }
      if (role === "staff" && !staffId) { showToast("יש לשייך משתמש צוות לאיש צוות.", "error"); return; }
      if (staffId && state.users.some(u => u.staffId === staffId && u.id !== editId)) {
        showToast("איש צוות זה כבר משויך למשתמש אחר.", "error"); return;
      }
      existing.username = uname;
      existing.role = role;
      existing.staffId = staffId;
      existing.fullName = fullName;
      existing.email = email;
      existing.phone = phone;
      persistState();
      showToast(`משתמש ${uname} עודכן.`, "info");
      byId("adminUserForm").reset();
      byId("adminUserId").value = "";
      byId("adminUserSaveBtn").textContent = "צור משתמש";
      byId("adminUserClearBtn").classList.add("hidden");
      renderAdminUsers();
      addNotification(`משתמש ${uname} עודכן.`);
      return;
    }

    if (!uname) { showToast("יש להזין שם משתמש.", "error"); return; }
    if (state.users.find(u => u.username === uname)) { showToast("שם משתמש תפוס.", "error"); return; }
    if (role === "staff" && !staffId) { showToast("יש לשייך משתמש צוות לאיש צוות.", "error"); return; }
    if (staffId && state.users.some(u => u.staffId === staffId)) { showToast("איש צוות זה כבר משויך למשתמש אחר.", "error"); return; }

    try {
      const { rawPassword } = await createUser({
        username: uname,
        role,
        staffId,
        fullName,
        email,
        phone
      });
      showNewPassword(uname, rawPassword);
      byId("adminUserForm").reset();
      renderAdminUsers();
      addNotification(`משתמש ${uname} נוצר.`);
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  byId("adminUserClearBtn")?.addEventListener("click", () => {
    byId("adminUserForm").reset();
    byId("adminUserNewPwd").classList.add("hidden");
  });

  /* Admin – staff form */
  byId("adminStaffForm")?.addEventListener("submit", e => {
    e.preventDefault();
    if (!isAdmin()) return;
    const id     = byId("adminStaffId").value;
    const formData = {
      fullName: byId("adminStaffName").value,
      phone:    byId("adminStaffPhone").value,
      email:    byId("adminStaffEmail").value,
      role:     byId("adminStaffRole").value,
      team:     byId("adminStaffTeam").value
    };

    const phoneValidation = validatePhoneIL(formData.phone);
    if (formData.phone && !phoneValidation.valid) {
      showToast(`טלפון: ${phoneValidation.error}`, "error");
      return;
    }
    if (phoneValidation.valid) {
      formData.phone = phoneValidation.localized;
    }

    try {
      const person = id
        ? updateStaff(id, formData)
        : createStaff(formData);
      renderAdminStaff();
      repopulateSelects();
      renderAdminUsers();
      addNotification(`${person.fullName} ${id ? "עודכן" : "נוסף"}.`);
      byId("adminStaffForm").reset();
      byId("adminStaffId").value = "";
      byId("adminStaffSaveBtn").textContent = "הוסף איש צוות";
      byId("adminStaffClearBtn").classList.add("hidden");
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  byId("adminStaffClearBtn")?.addEventListener("click", () => {
    byId("adminStaffForm").reset();
    byId("adminStaffId").value = "";
    byId("adminStaffSaveBtn").textContent = "הוסף איש צוות";
    byId("adminStaffClearBtn").classList.add("hidden");
  });

  /* Password reset request (login page) */
  byId("submitResetRequest")?.addEventListener("click", () => {
    let uname;
    try {
      uname = normalizeUsernameInput(byId("resetUsername").value);
    } catch (err) {
      showToast(err.message, "error");
      return;
    }
    if (!uname) { showToast("יש להזין שם משתמש.", "error"); return; }
    try {
      requestPasswordReset(uname);
      byId("resetRequestForm").classList.add("hidden");
      byId("resetUsername").value = "";
      showToast("בקשת איפוס נשלחה למנהל.", "info");
    } catch (err) {
      showToast(err.message, "info");
    }
  });

  byId("requestResetBtn")?.addEventListener("click", () => {
    byId("resetRequestForm").classList.toggle("hidden");
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
