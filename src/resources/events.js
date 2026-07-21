import { byId, esc, showToast, safeRender } from '../core/index.js';
import { state } from '../core/store.js';
import {
  createFolder, renameFolder, deleteFolder,
  uploadFile, deleteFileMeta, renameFile, moveFile,
  getChildFolders, getFilesInFolder
} from './state.js';
import {
  renderResourceBrowser, renderFolderTree,
  renderUploadProgress, hideUploadProgress,
  showFilePreview, setCurrentFolderId
} from './render.js';
import { downloadFile as downloadFileFromDB } from './db.js';

let _folderId = null;

function refreshAll() {
  safeRender(() => renderResourceBrowser(_folderId), "resourceBrowser");
  safeRender(renderFolderTree, "folderTree");
}

function navigateTo(folderId) {
  _folderId = folderId || null;
  setCurrentFolderId(_folderId);
  renderResourceBrowser(_folderId);
  safeRender(renderFolderTree, "folderTree");
}

export function initResourcesEvents() {
  const list = byId("resourceList");
  if (!list) return;

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "navigate-folder") {
      const folderId = btn.dataset.folderId || null;
      navigateTo(folderId);
      return;
    }

    if (action === "new-folder") {
      const name = prompt("שם תיקיה חדשה:");
      if (!name) return;
      const safeName = esc(String(name).trim());
      if (!safeName) return;
      try {
        createFolder(safeName, _folderId);
        showToast(`תיקיה "${safeName}" נוצרה.`);
        refreshAll();
      } catch (err) {
        showToast(err.message, "error");
      }
      return;
    }

    if (action === "rename-folder") {
      const folderId = btn.dataset.folderId;
      const newName = prompt("שם חדש לתיקיה:");
      if (!newName) return;
      const safeName = esc(String(newName).trim());
      if (!safeName) return;
      try {
        renameFolder(folderId, safeName);
        showToast("שם התיקיה עודכן.");
        refreshAll();
      } catch (err) {
        showToast(err.message, "error");
      }
      return;
    }

    if (action === "delete-folder") {
      const folderId = btn.dataset.folderId;
      if (!confirm("האם למחוק את התיקיה? כל התיקיות והקבצים בתוכה ימחקו.")) return;
      try {
        deleteFolder(folderId);
        showToast("התיקיה נמחקה.");
        refreshAll();
      } catch (err) {
        showToast(err.message, "error");
      }
      return;
    }

    if (action === "open-file") {
      const fileId = btn.dataset.fileId;
      if (!fileId) return;
      showFilePreview(fileId);
      return;
    }

    if (action === "download-file") {
      const fileId = btn.dataset.fileId;
      const fileName = btn.dataset.fileName || "file";
      const fileObj = state.files.find(f => f.id === fileId);
      if (!fileObj || !fileObj.dbId) {
        showToast("שגיאה: הקובץ לא נמצא.", "error");
        return;
      }
      try {
        await downloadFileFromDB(fileObj.dbId, fileName);
      } catch (err) {
        showToast("שגיאה בהורדת הקובץ.", "error");
      }
      return;
    }

    if (action === "delete-file") {
      const fileId = btn.dataset.fileId;
      if (!confirm("האם למחוק את הקובץ?")) return;
      try {
        await deleteFileMeta(fileId);
        showToast("הקובץ נמחק.");
        refreshAll();
      } catch (err) {
        showToast(err.message, "error");
      }
      return;
    }

    if (action === "move-file") {
      const fileId = btn.dataset.fileId;
      const allFolders = getChildFolders(null);
      const collectAll = (folders) => {
        let options = "";
        folders.forEach(f => {
          options += `<option value="${f.id}">${esc(f.name)}</option>\n`;
          options += collectAll(getChildFolders(f.id));
        });
        return options;
      };
      const folderOptions = `<option value="">שורש</option>\n${collectAll(allFolders)}`;
      const dialog = document.createElement("dialog");
      dialog.style.cssText = "padding:16px;border-radius:12px;border:1px solid var(--line);max-width:320px;background:var(--surface-2);box-shadow:0 16px 48px rgba(0,0,0,0.2)";
      dialog.innerHTML = `
        <h3 style="margin:0 0 12px">העברת קובץ</h3>
        <p style="margin-bottom:8px">בחר תיקית יעד:</p>
        <select id="moveFileSelect" style="width:100%">${folderOptions}</select>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
          <button id="moveFileCancel" class="btn-sm secondary">ביטול</button>
          <button id="moveFileConfirm" class="btn-sm">העבר</button>
        </div>
      `;
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.querySelector("#moveFileCancel").onclick = () => { dialog.close(); dialog.remove(); };
      dialog.querySelector("#moveFileConfirm").onclick = () => {
        const sel = dialog.querySelector("#moveFileSelect");
        const targetId = sel.value || null;
        moveFile(fileId, targetId);
        showToast("הקובץ הועבר.");
        dialog.close();
        dialog.remove();
        refreshAll();
      };
      return;
    }
  });

  list.addEventListener("change", async (e) => {
    if (e.target.id !== "resourceFileUpload") return;
    const files = e.target.files;
    if (!files || !files.length) return;
    renderUploadProgress();
    let uploaded = 0;
    for (const file of files) {
      try {
        await uploadFile(file, _folderId);
        uploaded++;
      } catch (err) {
        showToast(`שגיאה בהעלאת "${file.name}": ${err.message}`, "error");
      }
    }
    hideUploadProgress();
    if (uploaded > 0) showToast(`הועלו ${uploaded} קבצים.`);
    e.target.value = "";
    refreshAll();
  });

  list.addEventListener("input", (e) => {
    if (e.target.id === "resourceSearch") {
      safeRender(() => renderResourceBrowser(_folderId), "resourceBrowser");
    }
  });

  const folderTreeBox = byId("folderTree");
  if (folderTreeBox) {
    folderTreeBox.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='navigate-folder']");
      if (!btn) return;
      navigateTo(btn.dataset.folderId || null);
    });
  }
}
