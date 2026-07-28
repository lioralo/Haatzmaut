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

async function getQuotaEstimate() {
  try {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    const quota = Number(estimate.quota || 0);
    const usage = Number(estimate.usage || 0);
    if (!quota) return null;
    return {
      quota,
      usage,
      available: Math.max(0, quota - usage)
    };
  } catch {
    return null;
  }
}

function estimatePayloadSize(data, metadata = {}) {
  if (typeof metadata.size === "number" && metadata.size > 0) return metadata.size;
  if (typeof data?.size === "number" && data.size > 0) return data.size;
  if (typeof data === "string") return data.length;
  return 0;
}

export async function putFile(id, data, metadata = {}) {
  const payloadSize = estimatePayloadSize(data, metadata);
  const quota = await getQuotaEstimate();
  if (quota && payloadSize && quota.available < (payloadSize + 80_000)) {
    throw new Error("אין מספיק מקום פנוי לאחסון הקובץ במכשיר זה.");
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ id, data, name: metadata.name, type: metadata.type, size: metadata.size });
    req.onsuccess = () => resolve(id);
    req.onerror = (e) => {
      const err = e.target.error;
      if (err?.name === "QuotaExceededError") {
        reject(new Error("אחסון הקבצים המקומי מלא. יש למחוק קבצים ישנים ולנסות שוב."));
        return;
      }
      reject(err);
    };
    tx.onerror = (e) => {
      const err = e.target.error;
      if (err?.name === "QuotaExceededError") {
        reject(new Error("אחסון הקבצים המקומי מלא. יש למחוק קבצים ישנים ולנסות שוב."));
      }
    };
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
