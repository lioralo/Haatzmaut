import { state, persistState } from '../core/store.js';
import { byId, makeId, showToast } from '../core/utils.js';

export function addNotification(text, critical = false) {
  state.notifications = state.notifications || [];
  state.notifications.unshift({ id: makeId("note"), text, critical, at: new Date().toLocaleString("he-IL") });
  persistState();
  showToast(text, critical ? "warn" : "info");
  updateNotificationBell();
}

export function updateNotificationBell() {
  const badge = byId("notificationBadge");
  const bell = byId("notificationBell");
  if (!badge || !bell) return;
  const count = state.notifications?.length || 0;
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
  bell.classList.toggle("hidden", !state.currentUser);
}

export function renderNotificationPanel() {
  const list = byId("notificationList");
  if (!list) return;
  const items = state.notifications?.slice(0, 20) || [];
  list.innerHTML = items.map(n =>
    `<div class="notif-item${n.critical ? " critical" : ""}">${n.text}<small>${n.at}</small></div>`
  ).join("") || '<div class="notif-item muted">אין התראות</div>';
}

export function initNotificationCenter() {
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
}
