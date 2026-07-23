import express from 'express';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';

const DB_PATH = process.env.SYNC_DB_PATH || '/data/sync.db';
const PORT = parseInt(process.env.SYNC_PORT || '3001', 10);
const TOKEN_SECRET = process.env.SYNC_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_data (
    username TEXT PRIMARY KEY,
    encrypted_data TEXT NOT NULL,
    iv TEXT NOT NULL,
    data_hash TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (username) REFERENCES users(username)
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('now'))
  );
`);

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin === 'https://haatzmaut.lior-clinic.org')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function createToken(username) {
  const payload = JSON.stringify({ username, exp: Date.now() + TOKEN_TTL_MS });
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(TOKEN_SECRET.slice(0, 64), 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function verifyToken(token) {
  try {
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 16);
    const tag = buf.subarray(16, 32);
    const encrypted = buf.subarray(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(TOKEN_SECRET.slice(0, 64), 'hex'), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return payload.username;
  } catch { return null; }
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });
  const username = verifyToken(auth.slice(7));
  if (!username) return res.status(401).json({ error: 'invalid or expired token' });
  req.username = username;
  next();
}

app.get('/api/healthz', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.post('/api/auth/verify', (req, res) => {
  const { username, passwordHash } = req.body || {};
  if (!username || !passwordHash) return res.status(400).json({ error: 'missing credentials' });

  let user = db.prepare('SELECT username, password_hash, role FROM users WHERE username = ?').get(username);

  if (!user) {
    db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, 'staff');
    user = { username, password_hash: passwordHash, role: 'staff' };
  }

  if (user.password_hash !== passwordHash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(passwordHash, username);
    user.password_hash = passwordHash;
  }

  const token = createToken(username);
  db.prepare('INSERT INTO sync_log (username, action) VALUES (?, ?)').run(username, 'auth');
  res.json({ token, role: user.role, username });
});

app.get('/api/sync/info', requireAuth, (req, res) => {
  const row = db.prepare('SELECT updated_at, size_bytes FROM sync_data WHERE username = ?').get(req.username);
  if (!row) return res.json({ exists: false });
  res.json({ exists: true, updatedAt: row.updated_at, sizeBytes: row.size_bytes });
});

app.post('/api/sync/save', requireAuth, (req, res) => {
  const { encryptedData, iv, dataHash } = req.body || {};
  if (!encryptedData || !iv) return res.status(400).json({ error: 'missing data' });

  const hash = dataHash || '';
  const size = Buffer.byteLength(encryptedData, 'utf8');

  db.prepare(`
    INSERT INTO sync_data (username, encrypted_data, iv, data_hash, size_bytes, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(username) DO UPDATE SET
      encrypted_data = excluded.encrypted_data,
      iv = excluded.iv,
      data_hash = excluded.data_hash,
      size_bytes = excluded.size_bytes,
      updated_at = excluded.updated_at
  `).run(req.username, encryptedData, iv, hash, size);

  db.prepare('INSERT INTO sync_log (username, action) VALUES (?, ?)').run(req.username, 'save');
  res.json({ ok: true, size, timestamp: new Date().toISOString() });
});

app.get('/api/sync/load', requireAuth, (req, res) => {
  const row = db.prepare('SELECT encrypted_data, iv, updated_at, size_bytes FROM sync_data WHERE username = ?').get(req.username);
  if (!row) return res.status(404).json({ error: 'no data found' });

  db.prepare('INSERT INTO sync_log (username, action) VALUES (?, ?)').run(req.username, 'load');
  res.json({
    encryptedData: row.encrypted_data,
    iv: row.iv,
    updatedAt: row.updated_at,
    sizeBytes: row.size_bytes
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`haatzmaut-sync listening on port ${PORT}`);
});
