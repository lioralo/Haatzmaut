/* ============================================================
   RESOURCES RENDER - file browser & folder tree views
   ============================================================ */

import { esc, byId, showToast, safeRender, isAdmin, state } from '../core/index.js';
import {
  getChildFolders, getFilesInFolder, getFolderPath, getFileTree
} from './state.js';
import { downloadFile as downloadFileFromDB } from './db.js';

let _currentFolderId = null;
let _searchQuery = "";

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type) {
  if (!type) return "";
  if (type.includes("pdf")) return "📄";
  if (type.includes("image")) return "🖼️";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return "📊";
  if (type.includes("presentation") || type.includes("powerpoint")) return "📽️";
  if (type.includes("zip") || type.includes("rar") || type.includes("gzip")) return "📦";
  if (type.includes("text")) return "📃";
  return "📎";
}

export function renderResourceBrowser(currentFolderId = null) {
  const container = document.getElementById("resourceList");
  if (!container) return;
  if (!state.folders) state.folders = [];
  if (!state.files) state.files = [];

  const currentFolder = currentFolderId || null;
  const folders = getChildFolders(currentFolder);
  const files = getFilesInFolder(currentFolder);
  const path = getFolderPath(currentFolder);

  const treeHtml = buildFolderTreeHtml(null, currentFolder, 0);

  container.innerHTML = `
    <div class="resource-layout">
      <div class="folder-tree">
        <div class="folder-tree-item${!currentFolder ? " active" : ""}" data-folder-id="">&#x1F4C2; כל הקבצים</div>
        ${treeHtml}
      </div>
      <div>
        <div class="rb-toolbar" style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap;align-items:center">
          <div class="breadcrumb" style="font-size:.82rem;color:var(--muted)">${path.length ? path.map(p => `<span data-nav-folder="${p.id}" style="cursor:pointer;color:var(--primary)">${esc(p.name)}</span>`).join(" &rsaquo; ") : "ראשי"}</div>
          ${isAdmin() ? `<button class="btn-sm" data-action="new-folder" data-parent="${currentFolder || ""}">תיקיה חדשה</button>` : ""}
          ${isAdmin() ? `<label class="file-upload-label btn-sm secondary" style="margin:0">העלאת קובץ <input type="file" id="resourceFileUpload" multiple /></label>` : ""}
          <input id="resourceSearch" class="search-input" placeholder="חיפוש קבצים..." style="width:160px;margin-right:auto" />
        </div>
        ${folders.length ? `<div class="rb-folders" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">${folders.map(f => `
          <div class="staff-card" data-folder-id="${f.id}" style="cursor:pointer;min-width:120px;padding:.5rem">
            <strong>&#x1F4C1; ${esc(f.name)}</strong>
            <small style="color:var(--muted);font-size:.72rem">${getFilesInFolder(f.id).length} קבצים</small>
          </div>`).join("")}</div>` : ""}
        <table class="occ-table" style="font-size:.84rem;width:100%">
          <thead><tr><th>שם</th><th>סוג</th><th>גודל</th><th>תאריך</th><th style="width:120px">פעולות</th></tr></thead>
          <tbody>${files.map(f => `
            <tr>
              <td><span class="fp-name-link" data-file-id="${f.id}" style="cursor:pointer;color:var(--primary)">&#x1F4C4; ${esc(f.name)}</span></td>
              <td>${esc(f.type || "—")}</td>
              <td>${Math.round((f.size || 0)/1024)}KB</td>
              <td>${esc(f.createdAt || "—")}</td>
              <td>
                <button class="btn-sm" data-download="${f.id}">&darr;</button>
                ${isAdmin() ? `<button class="btn-sm secondary" data-delete-file="${f.id}">&#x1F5D1;</button>` : ""}
              </td>
            </tr>`).join("") || '<tr><td colspan="5" class="empty-state">אין קבצים בתיקיה זו</td></tr>'}</tbody>
        </table>
        ${!folders.length && !files.length ? '<p class="empty-state">התיקיה ריקה</p>' : ''}
      </div>
    </div>
  `;
}

function buildFolderTreeHtml(parentId, currentFolder, depth) {
  const children = getChildFolders(parentId);
  if (!children.length) return "";
  return children.map(f => `
    <div class="folder-tree-item${f.id === currentFolder ? " active" : ""}" data-folder-id="${f.id}" style="padding-right:${depth * 12 + 4}px">
      &#x1F4C1; ${esc(f.name)}
    </div>
    ${buildFolderTreeHtml(f.id, currentFolder, depth + 1)}
  `).join("");
}

export function showFilePreview(fileId) {
  const file = (state.files || []).find(f => f.id === fileId);
  if (!file) return;
  const modal = document.getElementById("bookingModal");
  if (!modal) return;
  modal.innerHTML = `
    <div class="file-preview-modal">
      <div class="fp-icon">&#x1F4C4;</div>
      <div class="fp-name">${esc(file.name)}</div>
      <div class="fp-meta">${esc(file.type || "—")} &middot; ${Math.round((file.size||0)/1024)}KB &middot; ${esc(file.createdAt || "")}</div>
      <button class="primary" data-download="${file.id}">הורדה</button>
      <button class="secondary" onclick="document.getElementById('bookingModal').close()">סגור</button>
    </div>
  `;
  modal.showModal();
}

export function renderFolderTree() {
  const box = byId("folderTree");
  if (!box) return;

  const tree = getFileTree();

  const renderNode = (folders, depth = 0) => {
    return folders.map(f => {
      const childFiles = getFilesInFolder(f.id);
      return `
        <div class="ft-node" style="padding-right:${depth * 16}px">
          <div class="ft-folder ${_currentFolderId === f.id ? "ft-active" : ""}"
               data-folder-id="${f.id}" data-action="navigate-folder">
            <span class="ft-icon">📁</span>
            <span class="ft-name">${esc(f.name)}</span>
            <span class="ft-count">${childFiles.length}</span>
          </div>
          ${renderNode(f.children, depth + 1)}
        </div>
      `;
    }).join("");
  };

  const rootFiles = tree.rootFiles;
  box.innerHTML = `
    <div class="folder-tree">
      <div class="ft-folder ft-root ${! _currentFolderId ? "ft-active" : ""}"
           data-folder-id="" data-action="navigate-folder">
        <span class="ft-icon">🏠</span>
        <span class="ft-name">שורש</span>
        <span class="ft-count">${rootFiles.length}</span>
      </div>
      ${renderNode(tree.folders)}
    </div>
  `;
}

export function renderUploadProgress() {
  const box = byId("uploadProgress");
  if (!box) return;
  box.classList.remove("hidden");
  box.innerHTML = `<span>מעלה...</span>`;
}

export function hideUploadProgress() {
  const box = byId("uploadProgress");
  if (box) box.classList.add("hidden");
}

export function setSearchQuery(q) {
  _searchQuery = q;
}

export function getCurrentFolderId() {
  return _currentFolderId;
}
