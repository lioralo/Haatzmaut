import { TEAMS } from '../core/constants.js';
import { state, persistState, recordAudit } from '../core/store.js';
import {
  makeId,
  generatePassword,
  passwordForUser,
  normalizeUser,
  showToast,
  timeToMin
} from '../core/utils.js';

export const DEFAULT_PERMISSIONS = {
  admin: {
    canEditSchedule: true, canManageStaff: true, canManageUsers: true,
    canManageResources: true, canApproveRequests: true, canReportIssues: true,
    canManageRooms: true, canViewAudit: true
  },
  staff: {
    canEditSchedule: false, canManageStaff: false, canManageUsers: false,
    canManageResources: false, canApproveRequests: false, canReportIssues: true,
    canManageRooms: false, canViewAudit: false
  }
};

export function normalizeStaff(s) {
  return {
    id:       s.id       || makeId("staff"),
    fullName: String(s.fullName || "").trim(),
    phone:    String(s.phone    || "").trim(),
    email:    String(s.email    || "").trim(),
    role:     String(s.role     || "").trim(),
    team:     String(s.team     || TEAMS[0]),
    workDays: Array.isArray(s.workDays) ? s.workDays : [0,1,2,3,4],
    workStart: s.workStart || "08:00",
    workEnd: s.workEnd || "20:00",
    maxSessionsPerDay: Number(s.maxSessionsPerDay) || 8,
    active: s.active !== false,
    specialties: Array.isArray(s.specialties) ? s.specialties : [],
  };
}

export function isStaffAvailable(staffName, day, startTime) {
  const person = state.staff.find(s => s.fullName === staffName);
  if (!person) return true;
  if (!person.active) return false;
  if (!person.workDays.includes(day)) return false;
  const startMin = timeToMin(startTime);
  const workStartMin = timeToMin(person.workStart);
  const workEndMin = timeToMin(person.workEnd);
  if (startMin < workStartMin || startMin >= workEndMin) return false;
  const daySessions = state.schedule.filter(e =>
    e.weekISO === state.weekISO && e.day === day && e.staff === staffName
  ).length;
  if (daySessions >= person.maxSessionsPerDay) return false;
  return true;
}

export function createStaff(formData) {
  const person = normalizeStaff({
    fullName: formData.fullName,
    phone:    formData.phone,
    email:    formData.email,
    role:     formData.role,
    team:     formData.team
  });
  if (!person.fullName) throw new Error("יש להזין שם מלא.");
  state.staff.push(person);
  persistState();
  recordAudit("staff.create", `${person.fullName}`, "warn");
  return person;
}

export function updateStaff(id, formData) {
  const idx = state.staff.findIndex(p => p.id === id);
  if (idx < 0) throw new Error("איש צוות לא נמצא.");
  const person = normalizeStaff({
    id,
    fullName: formData.fullName,
    phone:    formData.phone,
    email:    formData.email,
    role:     formData.role,
    team:     formData.team
  });
  if (!person.fullName) throw new Error("יש להזין שם מלא.");
  state.staff[idx] = person;
  persistState();
  recordAudit("staff.update", `${person.fullName}`, "warn");
  return person;
}

export function deleteStaff(id) {
  const idx = state.staff.findIndex(p => p.id === id);
  if (idx < 0) throw new Error("איש צוות לא נמצא.");
  const person = state.staff[idx];
  state.staff.splice(idx, 1);
  state.users = state.users.map(u => u.staffId === id ? { ...u, staffId: "" } : u);
  persistState();
  recordAudit("staff.delete", `${person.fullName}`, "warn");
  return person;
}

export async function createUser(formData) {
  const username = formData.username;
  const role = formData.role || "staff";
  const staffId = formData.staffId || "";
  const rawPwd = generatePassword();
  const { salt, passwordHash } = await passwordForUser(rawPwd);
  const newUser = normalizeUser({
    username,
    passwordHash,
    salt,
    role,
    staffId,
    active: true
  });
  state.users.push(newUser);
  state.needsSetup = false;
  persistState();
  recordAudit("user.create", `נוצר משתמש ${username} (${role}).`, "critical");
  return { user: newUser, rawPassword: rawPwd };
}

export function toggleUserActive(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) throw new Error("משתמש לא נמצא.");
  user.active = !user.active;
  persistState();
  recordAudit("user.status.toggle", `${user.username} => ${user.active ? "active" : "inactive"}`, "critical");
  return user;
}

export async function resetUserPassword(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) throw new Error("משתמש לא נמצא.");
  const rawPwd = generatePassword();
  const { salt, passwordHash } = await passwordForUser(rawPwd);
  user.passwordHash = passwordHash;
  user.salt = salt;
  persistState();
  recordAudit("user.password.reset", `בוצע איפוס סיסמה למשתמש ${user.username}.`, "critical");
  return { user, rawPassword: rawPwd };
}

export function requestPasswordReset(username) {
  if (state.passwordResets.some(r => r.username === username)) {
    throw new Error("בקשה כבר נשלחה.");
  }
  const req = { id: makeId("rst"), username, requestedAt: new Date().toLocaleString("he-IL") };
  state.passwordResets.push(req);
  persistState();
  recordAudit("password.reset.request", `בקשת איפוס עבור ${username}.`, "warn");
  return req;
}

export async function resolvePasswordReset(requestId) {
  const reqIdx = state.passwordResets.findIndex(r => r.id === requestId);
  if (reqIdx < 0) throw new Error("בקשת איפוס לא נמצאה.");
  const req = state.passwordResets[reqIdx];
  const user = state.users.find(u => u.username === req.username);
  if (!user) {
    state.passwordResets.splice(reqIdx, 1);
    persistState();
    throw new Error("משתמש לא נמצא.");
  }
  const rawPwd = generatePassword();
  const { salt, passwordHash } = await passwordForUser(rawPwd);
  user.passwordHash = passwordHash;
  user.salt = salt;
  state.passwordResets.splice(reqIdx, 1);
  persistState();
  recordAudit("user.password.reset.requested", `אופסה סיסמה לפי בקשה עבור ${user.username}.`, "critical");
  return { user, rawPassword: rawPwd };
}

export function dismissPasswordReset(requestId) {
  const reqIdx = state.passwordResets.findIndex(r => r.id === requestId);
  if (reqIdx < 0) return null;
  const req = state.passwordResets[reqIdx];
  state.passwordResets.splice(reqIdx, 1);
  persistState();
  recordAudit("password.reset.dismiss", `נדחתה בקשת איפוס עבור ${req.username}.`, "warn");
  return req;
}
