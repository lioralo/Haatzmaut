import { state, persistStateImmediate, recordAudit, isAdmin } from '../core/store.js';
import { byId, esc, makeId, enforceMaxLength, showToast, normalizeDisplayMessage, activeDisplayMessages } from '../core/utils.js';
import { addNotification } from './notifications.js';

export function renderAdminDisplayControls() {
  const settings = state.displaySettings;
  const ds = byId("displaySwitchSeconds");
  const hb = byId("displayHoursBefore");
  const ha = byId("displayHoursAfter");
  const rp = byId("displayRoomsPerPage");
  if (ds) ds.value = String(settings.switchSeconds);
  if (hb) hb.value = String(settings.hoursBefore);
  if (ha) ha.value = String(settings.hoursAfter);
  if (rp) rp.value = String(settings.roomsPerPage);

  const messagesBox = byId("displayMessagesList");
  if (messagesBox) {
    const active = activeDisplayMessages(settings);
    messagesBox.innerHTML = active.length
      ? active.map(msg => {
          const expiry = msg.expiresAt
            ? `עד ${esc(new Date(msg.expiresAt).toLocaleString("he-IL"))}`
            : "ללא הגבלת זמן";
          return `<div class="notice">
            <strong>${esc(msg.text)}</strong>
            <div class="notice-sub">${expiry} · ${msg.durationMinutes === "unlimited" ? "ללא הגבלה" : msg.durationMinutes + "דק'"}</div>
            <div class="notice-actions">
              <button type="button" class="btn-sm" data-msg-edit="${msg.id}">ערוך</button>
              <button type="button" class="btn-sm danger" data-msg-del="${msg.id}">הסר</button>
            </div>
          </div>`;
        }).join("")
      : '<p class="empty-state">אין הודעות פעילות למסך התצוגה.</p>';

    messagesBox.querySelectorAll("[data-msg-del]").forEach(btn => {
      btn.addEventListener("click", () => { deleteDisplayMessage(btn.dataset.msgDel); });
    });
    messagesBox.querySelectorAll("[data-msg-edit]").forEach(btn => {
      btn.addEventListener("click", () => { startEditDisplayMessage(btn.dataset.msgEdit); });
    });
  }

  const logBox = byId("displayMessagesLog");
  if (logBox) {
    const log = [...(state.displaySettings.messagesLog || [])];
    const activeIds = new Set((state.displaySettings.messages || []).map(m => m.id));
    log.sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));
    logBox.innerHTML = log.length
      ? log.map(entry => {
          const isActive = activeIds.has(entry.messageId);
          const removedAt = entry.action === "removed" ? `<br><span class="muted small">הוסר: ${esc(entry.timestamp || entry.createdAt)}</span>` : "";
          return `<div class="admin-row" style="opacity:${isActive ? '1' : '0.7'}">
            <div class="admin-row-info">
              <strong>${esc(entry.text)}</strong>
              <span class="muted small">
                ${entry.action === "created" ? "נוצר" : entry.action === "edited" ? "נערך" : entry.action === "removed" ? "הוסר" : "פג תוקף"} ·
                ${esc(entry.author)} · ${esc(entry.createdAt)}
                ${entry.expiredAt ? ` · הוצג עד: ${esc(new Date(entry.expiredAt).toLocaleString("he-IL"))}` : ""}
                ${entry.displayedDuration ? ` · הוצג ${entry.displayedDuration}דק'` : ""}
              </span>${removedAt}
            </div>
            <div class="admin-row-acts">
              <span class="user-role-badge ${isActive ? 'role-admin' : ''}">${isActive ? 'פעיל' : entry.action === "removed" ? 'הוסר' : 'תם'}</span>
            </div>
          </div>`;
        }).join("")
      : '<p class="empty-state">אין רישומי הודעות.</p>';
  }
}

function _logMessageEntry(action, msg, extra = {}) {
  const log = state.displaySettings.messagesLog = state.displaySettings.messagesLog || [];
  log.push({
    id: makeId("msglog"),
    messageId: msg.id,
    text: msg.text,
    action,
    author: state.currentUser?.username || "מערכת",
    createdAt: new Date().toLocaleString("he-IL"),
    timestamp: new Date().toISOString(),
    durationMinutes: msg.durationMinutes,
    ...extra
  });
}

function deleteDisplayMessage(id) {
  const msg = (state.displaySettings.messages || []).find(m => m.id === id);
  if (!msg) return;
  const now = Date.now();
  const createdTs = msg.createdAt ? Date.parse(msg.createdAt.split("/").reverse().join("-")) : now;
  const displayedFor = Math.round((now - createdTs) / 60000);
  const expiredAt = new Date().toISOString();
  _logMessageEntry("removed", msg, { expiredAt, displayedDuration: displayedFor });
  state.displaySettings.messages = state.displaySettings.messages.filter(m => m.id !== id);
  persistStateImmediate();
  renderAdminDisplayControls();
  addNotification("ההודעה הוסרה ונשמרה ביומן.");
}

function startEditDisplayMessage(id) {
  const msg = (state.displaySettings.messages || []).find(m => m.id === id);
  if (!msg) return;
  const textEl = byId("displayMessageText");
  const durEl = byId("displayMessageDuration");
  const idEl = byId("displayMessageEditId");
  const submitBtn = byId("displayMessageSubmitBtn");
  const cancelBtn = byId("displayMessageCancelBtn");
  if (textEl) textEl.value = msg.text;
  if (durEl) durEl.value = msg.durationMinutes || "5";
  if (idEl) idEl.value = msg.id;
  if (submitBtn) submitBtn.textContent = "עדכן";
  if (cancelBtn) cancelBtn.classList.remove("hidden");
  textEl?.focus();
}

function cancelEditDisplayMessage() {
  const form = byId("displayMessageForm");
  const idEl = byId("displayMessageEditId");
  const submitBtn = byId("displayMessageSubmitBtn");
  const cancelBtn = byId("displayMessageCancelBtn");
  if (form) form.reset();
  if (idEl) idEl.value = "";
  if (submitBtn) submitBtn.textContent = "הוסף";
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

export function initDisplayManagement() {
  const saveBtn = byId("displaySettingsSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (!isAdmin()) return;
      const ds = state.displaySettings;
      ds.switchSeconds = Math.max(5, Number(byId("displaySwitchSeconds").value) || 30);
      ds.hoursBefore   = Math.max(0, Number(byId("displayHoursBefore").value) || 0);
      ds.hoursAfter    = Math.max(1, Number(byId("displayHoursAfter").value)  || 3);
      ds.roomsPerPage  = Math.max(1, Number(byId("displayRoomsPerPage").value) || 10);
      ds.messages      = ds.messages || [];
      ds.messagesLog   = ds.messagesLog || [];
      persistStateImmediate();
      showToast(`נשמר: החלפה ${ds.switchSeconds}ש', אחורה ${ds.hoursBefore}ש', קדימה ${ds.hoursAfter}ש', ${ds.roomsPerPage} חדרים`, "info");
      recordAudit("display.settings.update", `עודכנו: ${ds.switchSeconds}s, ${ds.hoursBefore}h ←, ${ds.hoursAfter}h →, ${ds.roomsPerPage}`, "warn", false);
    });
  }

  const cancelBtn = byId("displayMessageCancelBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", cancelEditDisplayMessage);

  const messageForm = byId("displayMessageForm");
  if (messageForm) {
    messageForm.addEventListener("submit", e => {
      e.preventDefault();
      if (!isAdmin()) return;
      const text = byId("displayMessageText").value.trim();
      try { enforceMaxLength("הודעה למסך", text, 300); } catch (err) {
        showToast(err.message, "error"); return;
      }
      if (!text) { showToast("יש להזין הודעה.", "error"); return; }
      const duration = byId("displayMessageDuration").value;
      const editId = byId("displayMessageEditId").value;
      const expiresAt = duration === "unlimited"
        ? ""
        : new Date(Date.now() + (Number(duration) * 60000)).toISOString();

      state.displaySettings.messages = state.displaySettings.messages || [];
      state.displaySettings.messagesLog = state.displaySettings.messagesLog || [];

      if (editId) {
        const idx = state.displaySettings.messages.findIndex(m => m.id === editId);
        if (idx >= 0) {
          state.displaySettings.messages[idx] = normalizeDisplayMessage({
            ...state.displaySettings.messages[idx],
            text, durationMinutes: duration, expiresAt
          });
          _logMessageEntry("edited", state.displaySettings.messages[idx]);
          recordAudit("display.message.edit", text.slice(0, 80), "warn", false);
          addNotification("הודעה עודכנה.");
        }
        cancelEditDisplayMessage();
      } else {
        const msg = normalizeDisplayMessage({ text, durationMinutes: duration, expiresAt });
        state.displaySettings.messages.unshift(msg);
        _logMessageEntry("created", msg);
        recordAudit("display.message.create", text.slice(0, 80), "warn", false);
        addNotification("נוספה הודעה למסך התצוגה.");
        messageForm.reset();
        byId("displayMessageDuration").value = "5";
      }
      persistStateImmediate();
      renderAdminDisplayControls();
    });
  }
}
