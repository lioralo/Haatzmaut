import {
  byId,
  esc,
  normalizeUsernameInput,
  showToast,
  validatePhoneIL
} from '../core/index.js';
import {
  state,
  isAdmin,
  persistState
} from '../core/index.js';
import { addNotification } from '../ui/notifications.js';
import {
  createStaff,
  updateStaff,
  deleteStaff,
  createUser,
  requestPasswordReset
} from './state.js';
import {
  renderAdminUsers,
  renderAdminStaff,
  renderStaffDirectory,
  showNewPassword
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
      team:     byId("adminStaffTeam").value,
      color:    byId("adminStaffColor")?.value || "#0072BC",
      maxSessionsPerDay: Math.max(1, Number(byId("adminStaffMaxSessions")?.value || 8)),
      workStart: byId("adminStaffWorkStart")?.value || "08:00",
      workEnd:   byId("adminStaffWorkEnd")?.value   || "20:00"
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

function repopulateSelects() {
  const userStaffSel = byId("adminUserStaff");
  if (userStaffSel) {
    const cur = userStaffSel.value;
    userStaffSel.innerHTML = `<option value="">ללא שיוך</option>${state.staff.map(p => `<option value="${p.id}">${esc(p.fullName)}</option>`).join("")}`;
    if (state.staff.some(s => s.id === cur)) userStaffSel.value = cur;
  }
}

export function editStaff(staffId) {
  const person = state.staff.find(p => p.id === staffId);
  if (!person) return;
  const staffIdEl = byId("adminStaffId");
  const nameEl = byId("adminStaffName");
  const phoneEl = byId("adminStaffPhone");
  const emailEl = byId("adminStaffEmail");
  const roleEl = byId("adminStaffRole");
  const teamEl = byId("adminStaffTeam");
  const colorEl = byId("adminStaffColor");
  const maxEl = byId("adminStaffMaxSessions");
  const startEl = byId("adminStaffWorkStart");
  const endEl = byId("adminStaffWorkEnd");
  const saveBtn = byId("adminStaffSaveBtn");
  const clearBtn = byId("adminStaffClearBtn");

  if (staffIdEl) staffIdEl.value = person.id;
  if (nameEl) nameEl.value = person.fullName;
  if (phoneEl) phoneEl.value = person.phone || "";
  if (emailEl) emailEl.value = person.email || "";
  if (roleEl) roleEl.value = person.role || "";
  if (teamEl) teamEl.value = person.team || "";
  if (colorEl) colorEl.value = person.color || "#0072BC";
  if (maxEl) maxEl.value = person.maxSessionsPerDay || 8;
  if (startEl) startEl.value = person.workStart || "08:00";
  if (endEl) endEl.value = person.workEnd || "20:00";
  if (saveBtn) saveBtn.textContent = "עדכון איש צוות";
  if (clearBtn) clearBtn.classList.remove("hidden");
  nameEl?.focus();
}

export function deleteStaffById(staffId) {
  const person = state.staff.find(p => p.id === staffId);
  if (!person) return;
  if (!confirm(`למחוק את ${person.fullName}?`)) return;
  deleteStaff(staffId);
  renderAdminStaff();
  renderStaffDirectory();
  renderAdminUsers();
  repopulateSelects();
  addNotification(`${person.fullName} הוסר/ה.`);
}
