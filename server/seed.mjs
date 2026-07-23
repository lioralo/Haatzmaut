/* ============================================================
   Seed cloud DB with default state for user "admin"
   Run from EC2: node /opt/haatzmaut/server/seed.mjs
   ============================================================ */

import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SYNC_DB_PATH || '/data/sync.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

/* --- PBKDF2 (same as client-side Web Crypto) --- */
async function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 210000, 32, 'sha256', (err, derived) => {
      if (err) reject(err);
      else resolve(Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join(''));
    });
  });
}

/* --- AES-GCM encrypt using same fixed-salt PBKDF2 as client --- */
async function encryptWithPassword(password, plaintext) {
  const key = await deriveKeyFromPassword(password);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    encryptedData: Buffer.concat([encrypted, tag]).toString('base64'),
  };
}

async function deriveKeyFromPassword(password) {
  const salt = Buffer.from('haatzmaut-sync-fixed-salt-v1');
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 210000, 32, 'sha256', (err, derivedBits) => {
      if (err) return reject(err);
      crypto.hkdf('sha256', Buffer.from(derivedBits), Buffer.from('aes-gcm-sync'), Buffer.from('aes-gcm-key'), 32, (err2, key) => {
        if (err2) return reject(err2);
        resolve(Buffer.from(key));
      });
    });
  });
}

/* --- Build default state --- */
async function buildDefaultState() {
  const rooms = [
    { id: "r1",  name: "חדר 1",  tags: ["טיפול ילדים", "ציוד אבחוני"] },
    { id: "r2",  name: "חדר 2",  tags: ["טיפול קבוצתי"] },
    { id: "r3",  name: "חדר 3",  tags: ["טיפול מבוגרים", "ציוד אבחוני"] },
    { id: "r4",  name: "חדר 4",  tags: ["חדר משחק"] },
    { id: "r5",  name: "חדר 5",  tags: ["טיפול זוגות"] },
    { id: "r6",  name: "חדר 6",  tags: ["טיפול נוער"] },
    { id: "r7",  name: "חדר 7",  tags: ["ישיבות", "הדרכה"] },
    { id: "r8",  name: "חדר 8",  tags: ["טיפול ילדים"] },
    { id: "r9",  name: "חדר 9",  tags: ["ציוד אבחוני", "הדרכה"] },
    { id: "r10", name: "חדר 10", tags: ["טיפול מבוגרים"] },
    { id: "r11", name: "חדר 11", tags: ["טיפול קבוצתי", "ישיבות"] },
    { id: "r12", name: "חדר 12", tags: ["אדמיניסטרציה"] }
  ];

  const staff = [
    { id: "s1", fullName: "מנהל מערכת",  phone: "0500000000", email: "admin@clinic.org",  role: "מנהל",              team: "אדמיניסטרציה" },
    { id: "s2", fullName: 'ד"ר לוי',      phone: "0500000001", email: "levy@clinic.org",   role: "פסיכולוג",           team: "מבוגרים"      },
    { id: "s3", fullName: "נועה כהן",     phone: "0500000002", email: "noa@clinic.org",    role: "מטפלת",              team: "ילדים"         },
    { id: "s4", fullName: "יואב בר",      phone: "0500000003", email: "yoav@clinic.org",   role: "פסיכולוג",           team: "מבוגרים"      },
    { id: "s5", fullName: "מאיה לוי",     phone: "0500000004", email: "maya@clinic.org",   role: "מטפלת",              team: "מבוגרים"      },
    { id: "s6", fullName: "עדי רוזן",     phone: "0500000005", email: "adi@clinic.org",    role: "עובדת סוציאלית",     team: "ילדים"         },
    { id: "s7", fullName: "שרון מזרחי",   phone: "0500000006", email: "sharon@clinic.org", role: "פסיכולוגית",         team: "נוער"          },
    { id: "s8", fullName: "רן כהן",       phone: "0500000007", email: "ran@clinic.org",    role: "מטפל זוגות",         team: "זוגות"         }
  ];

  const now = new Date();
  const sun = new Date(now); sun.setDate(sun.getDate() - sun.getDay()); sun.setHours(0,0,0,0);
  const pad = n => String(n).padStart(2, '0');
  const weekISO = `${sun.getFullYear()}-${pad(sun.getMonth()+1)}-${pad(sun.getDate())}`;

  const entries = [
    { day:0, roomId:"r1", start:"08:30", duration:60,  staff:"נועה כהן",   team:"ילדים",        note:"קבלת בוקר"   },
    { day:0, roomId:"r3", start:"10:00", duration:90,  staff:'ד"ר לוי',     team:"מבוגרים",      note:"אבחון"        },
    { day:0, roomId:"r2", start:"13:00", duration:60,  staff:"מאיה לוי",   team:"מבוגרים",      note:""             },
    { day:1, roomId:"r5", start:"09:00", duration:60,  staff:"שרון מזרחי", team:"נוער",         note:""             },
    { day:1, roomId:"r2", start:"11:00", duration:120, staff:"יואב בר",    team:"מבוגרים",      note:"קבוצה שבועית" },
    { day:2, roomId:"r4", start:"08:00", duration:120, staff:"עדי רוזן",   team:"ילדים",        note:"קבוצת ילדים"  },
    { day:2, roomId:"r7", start:"14:00", duration:60,  staff:"מנהל מערכת", team:"אדמיניסטרציה", note:"ישיבת צוות"   },
    { day:3, roomId:"r6", start:"10:30", duration:90,  staff:"רן כהן",     team:"זוגות",        note:""             },
    { day:4, roomId:"r1", start:"09:00", duration:60,  staff:'ד"ר לוי',    team:"מבוגרים",      note:"הדרכה"        },
    { day:4, roomId:"r9", start:"15:00", duration:60,  staff:"נועה כהן",   team:"ילדים",        note:""             }
  ];

  const schedule = entries.map(e => ({
    id: `entry-${crypto.randomUUID()}`,
    weekISO, day: e.day, roomId: e.roomId, start: e.start,
    duration: e.duration, staff: e.staff, team: e.team,
    note: e.note, noteType: "therapy", clientName: "", clientPhone: "",
    oneTime: false, sessionStatus: "", isTemplate: true, createdAt: now.toLocaleString("he-IL")
  }));

  // Create admin user with a deterministic passwordHash that bootstrapAdmin would accept
  const adminSalt = 'seed-admin-salt-v1';
  const adminPasswordHash = await hashPassword('admin123', adminSalt);

  const users = [{
    id: 'user-admin-seed',
    username: 'admin',
    passwordHash: adminPasswordHash,
    salt: adminSalt,
    role: 'admin',
    staffId: '',
    fullName: 'מנהל מערכת',
    email: '',
    phone: '',
    active: true,
    createdAt: now.toLocaleString('he-IL')
  }];

  const defaultTemplate = entries.map(e => ({
    day: e.day, roomId: e.roomId, start: e.start, duration: e.duration,
    staff: e.staff, team: e.team, note: e.note
  }));

  return JSON.stringify({
    _schemaVersion: 2,
    auditLog: [],
    loginSecurity: { failures: [], lockUntil: 0 },
    activeTab: "dashboardTab",
    schedule,
    rooms,
    defaultTemplate,
    weekTemplates: {},
    requests: [],
    selectedTags: [],
    weekISO,
    activeDay: Math.min(now.getDay(), 4),
    staff,
    users,
    passwordResets: [],
    folders: [],
    files: [],
    meetingGroups: [],
    meetings: [],
    issues: [],
    waitlist: [],
    settings: {
      clinicName: "מרפאה",
      clinicPhone: "",
      clinicAddress: "",
      cancelPolicyHours: 24,
      slotDuration: 30,
      teams: ["מבוגרים","ילדים","נוער","זוגות","אדמיניסטרציה"],
      workHours: { 0:{start:"08:00",end:"20:00"},1:{start:"08:00",end:"20:00"},2:{start:"08:00",end:"20:00"},3:{start:"08:00",end:"20:00"},4:{start:"08:00",end:"20:00"} }
    },
    displaySettings: { switchSeconds: 30, hoursBefore: 1, hoursAfter: 3, roomsPerPage: 10, messages: [] }
  });
}

async function seed() {
  const rawPwd = "admin123";
  const userSalt = crypto.randomBytes(16).toString('hex');
  const userPasswordHash = await hashPassword(rawPwd, userSalt);

  console.log('Admin password hash (PBKDF2):', userPasswordHash.substring(0, 20) + '...');

  // Insert user into cloud DB
  db.prepare('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run('admin', userPasswordHash, 'admin');

  // Encrypt and store default state using same fixed-salt derivation as client
  const plain = await buildDefaultState();
  const { iv, encryptedData } = await encryptWithPassword(rawPwd, plain);
  const dataHash = crypto.createHash('sha256').update(plain).digest('hex');

  db.prepare(`
    INSERT OR REPLACE INTO sync_data (username, encrypted_data, iv, data_hash, size_bytes, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run('admin', encryptedData, iv, dataHash, Buffer.byteLength(encryptedData, 'utf8'));

  console.log(`Seeded cloud DB: admin user + ${plain.length} bytes of encrypted state`);
  console.log(`Cloud data size: ${Buffer.byteLength(encryptedData, 'utf8')} bytes encrypted`);
  console.log('Done.');
}

seed().catch(err => { console.error(err); process.exit(1); });
