/* ============================================================
   RESOURCES DB - IndexedDB storage for file blobs
   ============================================================ */

const DB_NAME = "haatzmaut_files";
const DB_VERSION = 1;
const STORE_NAME = "blobs";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function putFile(id, data, metadata = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ id, data, name: metadata.name, type: metadata.type, size: metadata.size });
    req.onsuccess = () => resolve(id);
    req.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => db.close();
  });
}

export async function deleteFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => db.close();
  });
}

export async function downloadFile(id, filename) {
  const record = await getFile(id);
  if (!record) throw new Error("File not found");
  const url = URL.createObjectURL(record.data);
  const a = document.createElement("a");
  a.href = url; a.download = filename || record.name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
