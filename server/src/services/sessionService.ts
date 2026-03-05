import pool from '../db/pool';

// Proxy pool from env: comma-separated HOST:PORT:USER:PASS entries
const PROXY_POOL_RAW = (process.env.PROXY_POOL || '').split(',').filter(Boolean);

// Convert HOST:PORT:USER:PASS → http://USER:PASS@HOST:PORT
const PROXY_POOL = PROXY_POOL_RAW.map(raw => {
  const trimmed = raw.trim();
  const parts = trimmed.split(':');
  const host = parts[0];
  const port = parts[1];
  const user = parts[2];
  const pass = parts.slice(3).join(':');
  return `http://${user}:${pass}@${host}:${port}`;
});

/**
 * Get the next proxy in rotation based on how many sessions exist
 */
async function getNextProxy(): Promise<string | null> {
  if (PROXY_POOL.length === 0) return null;
  const { rows } = await pool.query('SELECT COUNT(*) as total FROM sessions');
  const sessionCount = parseInt(rows[0].total);
  return PROXY_POOL[sessionCount % PROXY_POOL.length];
}

export async function getAllSessions() {
  const { rows } = await pool.query(
    'SELECT id, name, phone, status, proxy_url, created_at, updated_at FROM sessions ORDER BY created_at DESC'
  );
  return rows;
}

export async function getSessionById(id: string) {
  const { rows } = await pool.query(
    'SELECT id, name, phone, status, proxy_url, created_at, updated_at FROM sessions WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function createSession(name: string, proxyUrl?: string) {
  // Auto-assign proxy from pool if none provided
  const proxy = proxyUrl || await getNextProxy();
  const { rows } = await pool.query(
    'INSERT INTO sessions (name, proxy_url) VALUES ($1, $2) RETURNING id, name, phone, status, proxy_url, created_at',
    [name, proxy]
  );
  console.log(`[Session] Created "${name}" with proxy: ${proxy ? 'assigned' : 'none'}`);
  return rows[0];
}

export async function updateProxy(id: string, proxyUrl: string | null) {
  const { rows } = await pool.query(
    'UPDATE sessions SET proxy_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, phone, status, proxy_url, created_at, updated_at',
    [proxyUrl, id]
  );
  return rows[0];
}

export async function updateStatus(id: string, status: string) {
  await pool.query('UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
}

export async function deleteSession(id: string) {
  await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
}
