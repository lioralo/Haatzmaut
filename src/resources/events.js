/* ============================================================
   RESOURCES EVENTS - DOM event binding for file browser
   ============================================================ */

import { byId, esc, showToast, safeRender } from '../core/index.js';
import {
  createFolder, renameFolder, deleteFolder,
  uploadFile, deleteFileMeta, renameFile, moveFile,
  getChildFolders, getFilesInFolder, getFolderPath
} from './state.js';
import {
  renderResourceBrowser, renderFolderTree,
  renderUploadProgress, hideUploadProgress,
  setSearchQuery, getCurrentFolderId
} from './render.js';
import { downloadFile as downloadFileFromDB } from './db.js';

let _bound = false;

function refreshAll() {
  safeRender(() => renderResourceBrowser(getCurrentFolderId()), "resourceBrowser");
  safeRender(renderFolderTree, "folderTree");
}

export function initResourcesEvents() {
  if (_bound) return;
  _bound = true;

  const list = byId("resourceList");
  if (!list) return;

  // Delegate all resource browser clicks from #resourceList
  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "new-folder") {
      const name = prompt("שם תיקיה חדשה:");
      if (!name) return;
      try {
        createFolder(name, getCurrentFolderId());
        showToast(`תיקיה "${name}" נוצרה.`);
        refreshAll();
      } catch (err) {
        showToast(err.message, "error");
      }
      return;
    }

    if (action === "navigate-folder") {
      const folderId = btn.dataset.folderId || null;
      renderResourceBrowser(folderId);
      safeRender(renderFolderTree, "folderTree");
      return;
    }

    if (action === "rename-folder") {
      const folderId = btn.dataset.folderId;
      const newName = prompt("שם חדש לתיקיה:");
      if (!newName) return;
      try {
        renameFolder(folderId, newName);
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

    if (action === "download-file") {
      const fileId = btn.dataset.fileId;
      const fileName = btn.dataset.fileName || "file";
      try {
        await downloadFileFromDB(fileId, fileName);
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

    if (action === "rename-file") {
      const fileId = btn.dataset.fileId;
      const newName = prompt("שם חדש לקובץ:");
      if (!newName) return;
      try {
        renameFile(fileId, newName);
        showToast("שם הקובץ עודכן.");
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
      const selectHTML = `<select id="moveFileSelect" style="width:100%;margin-top:8px">${folderOptions}</select>`;
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `<p style="margin-bottom:8px">בחר תיקית יעד:</p>${selectHTML}`;
      const dialog = document.createElement("dialog");
      dialog.style.cssText = "padding:16px;border-radius:8px;border:1px solid #ccc;max-width:320px";
      dialog.innerHTML = `<h3 style="margin:0 0 12px">העברת קובץ</h3>`;
      dialog.appendChild(wrapper);
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "margin-top:12px;display:flex;gap:8px;justify-content:flex-end";
      btnRow.innerHTML = `
        <button id="moveFileCancel" class="btn-sm secondary">ביטול</button>
        <button id="moveFileConfirm" class="btn-sm">העבר</button>
      `;
      dialog.appendChild(btnRow);
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

  // Upload file input change
  const uploadInput = byId("resourceFileUpload");
  if (uploadInput) {
    uploadInput.addEventListener("change", async (e) => {
      const files = e.target.files;
      if (!files || !files.length) return;
      renderUploadProgress();
      let uploaded = 0;
      for (const file of files) {
        try {
          await uploadFile(file, getCurrentFolderId());
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
  }

  // Search input
  list.addEventListener("input", (e) => {
    if (e.target.id === "resourceSearch") {
      setSearchQuery(e.target.value.trim());
      safeRender(() => renderResourceBrowser(getCurrentFolderId()), "resourceBrowser");
    }
  });

  // Breadcrumb clicks are handled by the delegated click handler above

  // Folder tree clicks in dedicated container
  const folderTreeBox = byId("folderTree");
  if (folderTreeBox) {
    folderTreeBox.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='navigate-folder']");
      if (!btn) return;
      const folderId = btn.dataset.folderId || null;
      renderResourceBrowser(folderId);
      safeRender(renderFolderTree, "folderTree");
    });
  }
}
