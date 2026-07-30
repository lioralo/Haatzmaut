/* ============================================================
   RESOURCES STATE - folder & file management logic
   ============================================================ */

import { state, persistState, recordAudit } from '../core/store.js';
import { makeId } from '../core/utils.js';
import { putFile, deleteFile, downloadFile } from './db.js';

const nowISO = () => new Date().toLocaleString("he-IL");

export function createFolder(name, parentId = null) {
  const folder = {
    id: makeId("folder"),
    name: String(name || "").trim(),
    parentId: parentId || null,
    createdBy: state.currentUser?.username || "system",
    createdAt: nowISO()
  };
  if (!folder.name) throw new Error("שם תיקיה לא יכול להיות ריק.");
  state.folders.push(folder);
  persistState();
  recordAudit("folder.create", `נוצרה תיקיה "${folder.name}".`, "info");
  return folder;
}

export function renameFolder(id, newName) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) throw new Error("תיקיה לא נמצאה.");
  const oldName = folder.name;
  folder.name = String(newName || "").trim();
  if (!folder.name) throw new Error("שם תיקיה לא יכול להיות ריק.");
  persistState();
  recordAudit("folder.rename", `"${oldName}" שונה ל-"${folder.name}".`, "info");
  return folder;
}

export function deleteFolder(id) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) throw new Error("תיקיה לא נמצאה.");

  const collectSubfolderIds = (parentId) => {
    const ids = [];
    state.folders.filter(f => f.parentId === parentId).forEach(child => {
      ids.push(child.id);
      ids.push(...collectSubfolderIds(child.id));
    });
    return ids;
  };

  const subIds = collectSubfolderIds(id);
  const allFolderIds = [id, ...subIds];

  const filesToDelete = state.files.filter(f => allFolderIds.includes(f.folderId));
  filesToDelete.forEach(f => {
    if (f.dbId) deleteFile(f.dbId).catch(() => {});
  });

  state.files = state.files.filter(f => !allFolderIds.includes(f.folderId));
  state.folders = state.folders.filter(f => !allFolderIds.includes(f.id));
  persistState();
  recordAudit("folder.delete", `נמחקה תיקיה "${folder.name}" (${allFolderIds.length} תיקיות, ${filesToDelete.length} קבצים).`, "warn");
}

export function getFolderPath(folderId) {
  const path = [];
  let current = folderId;
  while (current) {
    const folder = state.folders.find(f => f.id === current);
    if (!folder) break;
    path.unshift({ id: folder.id, name: folder.name });
    current = folder.parentId;
  }
  return path;
}

export function getChildFolders(parentId) {
  return state.folders.filter(f => (f.parentId || null) === (parentId || null));
}

export function getFilesInFolder(folderId) {
  return state.files.filter(f => f.folderId === folderId);
}

export async function uploadFile(file, folderId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dbId = makeId("blob");
        const blob = new Blob([reader.result], { type: file.type || "application/octet-stream" });
        await putFile(dbId, blob, {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size
        });
        const meta = {
          id: makeId("file"),
          name: file.name,
          folderId: folderId || null,
          type: file.type || "application/octet-stream",
          size: file.size,
          createdBy: state.currentUser?.username || "system",
          createdAt: nowISO(),
          dbId
        };
        state.files.push(meta);
        persistState();
        recordAudit("file.upload", `הועלה קובץ "${file.name}".`, "info");
        resolve(meta);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("שגיאה בקריאת הקובץ."));
    reader.readAsArrayBuffer(file);
  });
}

export async function deleteFileMeta(id) {
  const file = state.files.find(f => f.id === id);
  if (!file) throw new Error("קובץ לא נמצא.");
  if (file.dbId) {
    await deleteFile(file.dbId).catch(() => {});
  }
  state.files = state.files.filter(f => f.id !== id);
  persistState();
  recordAudit("file.delete", `נמחק קובץ "${file.name}".`, "warn");
}

export function renameFile(id, newName) {
  const file = state.files.find(f => f.id === id);
  if (!file) throw new Error("קובץ לא נמצא.");
  const oldName = file.name;
  file.name = String(newName || "").trim();
  if (!file.name) throw new Error("שם קובץ לא יכול להיות ריק.");
  persistState();
  recordAudit("file.rename", `"${oldName}" שונה ל-"${file.name}".`, "info");
  return file;
}

export function moveFile(id, newFolderId) {
  const file = state.files.find(f => f.id === id);
  if (!file) throw new Error("קובץ לא נמצא.");
  file.folderId = newFolderId || null;
  persistState();
  recordAudit("file.move", `"${file.name}" הועבר לתיקיה.`, "info");
  return file;
}

export function getFileTree() {
  const buildTree = (parentId) => {
    return getChildFolders(parentId).map(folder => ({
      ...folder,
      children: buildTree(folder.id),
      files: getFilesInFolder(folder.id)
    }));
  };
  return {
    folders: buildTree(null),
    rootFiles: getFilesInFolder(null)
  };
}

export { downloadFile };
