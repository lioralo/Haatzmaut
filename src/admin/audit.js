import { state, persistStateImmediate, exportFullBackup, exportEncryptedBackup, importEncryptedBackup, applyImportedState } from '../core/store.js';
import { saveToCloud, loadFromCloud, loadFromCloudAndApply, listVersions, restoreVersion, getCloudSyncState } from '../core/cloudSync.js';
import { byId, esc, showToast } from '../core/utils.js';
import { renderAdminDisplayControls, initDisplayManagement } from '../ui/displayManagement.js';

export function renderAuditLog() {
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

export function renderManagedBackups() {
  // managed backups removed — cloud is the primary backup
}

export function initAdminSubTabs() {
  document.querySelectorAll("[data-admin-subtab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const subtab = btn.dataset.adminSubtab;
      document.querySelectorAll("[data-admin-subtab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".admin-subtab-content").forEach(el => el.classList.add("hidden"));
      const content = document.querySelector(`.admin-subtab-content[data-admin-subtab="${subtab}"]`);
      if (content) {
        content.classList.remove("hidden");
        if (subtab === "display") renderAdminDisplayControls();
        if (subtab === "audit") { renderAuditLog(); updateCloudStatus(); }
      }
    });
  });
}

export function initBackupHandlers() {
  const exportBtn = byId("exportBackupBtn");
  if (exportBtn) exportBtn.addEventListener("click", () => { exportFullBackup(); });

  const exportEncBtn = byId("exportEncryptedBtn");
  if (exportEncBtn) exportEncBtn.addEventListener("click", () => { exportEncryptedBackup(); });

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
        } catch { showToast("שגיאה בקובץ הגיבוי.", "error"); }
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
      importEncryptedBackup(file).then(ok => {
        if (ok) {
          setTimeout(() => window.location.reload(), 800);
        }
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
    });
  }

  initDisplayManagement();
}

export function updateCloudStatus() {
  const info = getCloudSyncState();
  const el = byId("cloudSyncInfo");
  const versionsBtn = byId("cloudVersionsBtn");
  if (!el) return;
  const statusMap = { idle: "ממתין", syncing: "מסנכרן...", synced: "מסונכרן", pending: "ממתין לסנכרון", error: "שגיאה" };
  const statusText = statusMap[info.state] || info.state;
  const lastSync = info.lastSync ? new Date(info.lastSync).toLocaleString("he-IL") : "--";
  const pending = info.hasPending ? "⏳ ממתין להעלאה" : "";
  el.innerHTML = `מצב: ${statusText} | סנכרון אחרון: ${lastSync} ${pending}`.trim();
  if (versionsBtn) versionsBtn.style.display = info.hasKey ? "" : "none";
}

export function initCloudSyncButtons() {
  byId("cloudSaveBtn")?.addEventListener("click", async () => {
    const btn = byId("cloudSaveBtn");
    const status = byId("cloudSyncStatus");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = "שומר…";
    if (status) status.textContent = "";
    try {
      const res = await saveToCloud();
      if (status) {
        if (res.ok) {
          status.textContent = res.skipped
            ? "לא השתנה דבר"
            : `נשמר — ${new Date().toLocaleString("he-IL")}`;
        } else {
          status.textContent = "שמירה נכשלה — " + (res.error || "שגיאה");
        }
      }
    } catch (e) {
      if (status) status.textContent = "שגיאה — " + (e.message || "רשת");
    }
    btn.disabled = false;
    btn.textContent = "שמור לענן";
    updateCloudStatus();
  });

  byId("cloudLoadBtn")?.addEventListener("click", async () => {
    const btn = byId("cloudLoadBtn");
    const status = byId("cloudSyncStatus");
    if (!btn) return;
    if (status) status.textContent = "בודק ענן…";
    btn.disabled = true;
    try {
      const info = await loadFromCloud();
      if (!info) {
        if (status) status.textContent = "לא נמצא מידע בענן.";
        btn.disabled = false;
        return;
      }
      const cloudDate = info.updatedAt ? new Date(info.updatedAt).toLocaleString("he-IL") : "לא ידוע";
      const ok = confirm(`נמצא מידע בענן מתאריך ${cloudDate} (${Math.round(info.sizeBytes / 1024)}KB).\n\nלטעון ולהחליף את המידע המקומי?`);
      if (!ok) { if (status) status.textContent = "בוטל."; btn.disabled = false; return; }
      await loadFromCloudAndApply();
      if (status) status.textContent = `נטען — ${new Date().toLocaleString("he-IL")}`;
    } catch (e) {
      if (status) status.textContent = "טעינה נכשלה — " + (e.message || "רשת");
    }
    btn.disabled = false;
    updateCloudStatus();
  });

  byId("cloudVersionsBtn")?.addEventListener("click", async () => {
    const list = byId("cloudVersionsList");
    if (!list) return;
    if (list.style.display === "block") {
      list.style.display = "none";
      return;
    }
    list.style.display = "block";
    list.innerHTML = '<p class="muted small">טוען גרסאות…</p>';
    const versions = await listVersions();
    if (!versions.length) {
      list.innerHTML = '<p class="muted small">אין גרסאות קודמות.</p>';
      return;
    }
    list.innerHTML = versions.map(v => `
      <div style="display:flex;align-items:center;gap:.5rem;padding:.3rem 0;border-bottom:1px solid var(--border-color)">
        <span class="muted small">${new Date(v.created_at).toLocaleString("he-IL")}</span>
        <span class="muted small">${Math.round(v.size_bytes / 1024)}KB</span>
        <button class="btn-sm" data-restore-version="${v.id}">שחזר</button>
      </div>
    `).join("");
    list.querySelectorAll("[data-restore-version]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const vid = btn.dataset.restoreVersion;
        if (!confirm("שחזור גרסה קודמת יחליף את כל הנתונים. להמשיך?")) return;
        btn.disabled = true;
        btn.textContent = "משחזר…";
        try {
          await restoreVersion(vid);
          showToast("שוחזר, טוען מחדש...", "info");
          setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
          showToast("שחזור נכשל: " + (e.message || "שגיאה"), "error");
          btn.disabled = false;
          btn.textContent = "שחזר";
        }
      });
    });
  });

  updateCloudStatus();
}
