// Report storage. SQLite file on disk by default (node:sqlite), or a hosted
// Turso (libSQL) database when TURSO_DATABASE_URL is set, so reports survive
// redeploys of a free instance whose disk is wiped. See drivers.js.
// All methods are async because the hosted database is reached over HTTPS.
//
// We store only what is needed: the audited URL and the report. No names,
// no emails, no IP addresses. Secret keys are stored as SHA-256 hashes.

import crypto from 'node:crypto';
import { SqliteDriver, TursoDriver } from './drivers.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function randomId(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const randomKey = () => crypto.randomBytes(24).toString('base64url');
export const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

export function safeEqualHash(key, hash) {
  if (!key || !hash) return false;
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'en',
    status TEXT NOT NULL,
    progress TEXT,
    data TEXT,
    error TEXT,
    ai TEXT,
    owner_key_hash TEXT NOT NULL,
    access_key_hash TEXT,
    paid INTEGER NOT NULL DEFAULT 0,
    stripe_session TEXT,
    duration_ms INTEGER,
    pages_crawled INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reports_created ON reports(created_at);
  CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
`;

export class Store {
  /**
   * @param {string} file SQLite file path (or ':memory:'), used when no Turso URL is given
   * @param {{url?: string, authToken?: string, fetchImpl?: typeof fetch}} [turso]
   */
  constructor(file, turso = {}) {
    this.driver = turso.url ? new TursoDriver(turso.url, turso.authToken, turso.fetchImpl) : new SqliteDriver(file);
    this.kind = turso.url ? 'turso' : 'sqlite';
    this.ready = this.driver.exec(SCHEMA);
    // Live progress of running audits stays in memory: it changes every second
    // and is worthless after a restart, so it is not worth a database write.
    this.live = new Map();
    this.queue = Promise.resolve();
  }

  async #db() {
    await this.ready;
    return this.driver;
  }

  // Writes run one after another, in call order: over HTTPS a late "queued"
  // update could otherwise land after the final "done" and overwrite it.
  #write(sql, args) {
    const result = this.queue.then(async () => (await this.#db()).run(sql, args));
    this.queue = result.catch(() => {});
    return result;
  }

  async createReport({ url, lang }) {
    const id = randomId();
    const ownerKey = randomKey();
    const now = Date.now();
    await this.#write('INSERT INTO reports (id, url, lang, status, owner_key_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, url, lang, 'queued', hashKey(ownerKey), now, now]);
    return { id, ownerKey };
  }

  async getReport(id) {
    const db = await this.#db();
    const row = await db.get('SELECT * FROM reports WHERE id = ?', [String(id)]);
    if (!row) return null;
    const live = this.live.get(row.id);
    return {
      id: row.id,
      url: row.url,
      lang: row.lang,
      status: live && (row.status === 'queued' || row.status === 'running') ? live.status : row.status,
      progress: live ? live.progress : row.progress ? JSON.parse(row.progress) : null,
      data: row.data ? JSON.parse(row.data) : null,
      error: row.error ? JSON.parse(row.error) : null,
      ai: row.ai ? JSON.parse(row.ai) : null,
      ownerKeyHash: row.owner_key_hash,
      accessKeyHash: row.access_key_hash,
      paid: Boolean(row.paid),
      stripeSession: row.stripe_session,
      createdAt: row.created_at,
    };
  }

  /** Progress of a queued/running audit: kept in memory, status written once per change. */
  async setStatus(id, status, progress = null) {
    const previous = this.live.get(id);
    this.live.set(id, { status, progress });
    if (previous?.status === status) return;
    await this.#write('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?', [status, Date.now(), id]);
  }

  async saveResult(id, data) {
    await this.#write('UPDATE reports SET status = ?, data = ?, progress = NULL, duration_ms = ?, pages_crawled = ?, updated_at = ? WHERE id = ?', ['done', JSON.stringify(data), data.durationMs, data.stats.pagesCrawled, Date.now(), id]);
    this.live.delete(id);
  }

  async saveError(id, error, durationMs = null) {
    await this.#write('UPDATE reports SET status = ?, error = ?, progress = NULL, duration_ms = ?, updated_at = ? WHERE id = ?', ['failed', JSON.stringify(error), durationMs, Date.now(), id]);
    this.live.delete(id);
  }

  async saveAi(id, ai) {
    await this.#write('UPDATE reports SET ai = ?, updated_at = ? WHERE id = ?', [JSON.stringify(ai), Date.now(), id]);
  }

  /** Marks a report as paid and returns a fresh access key (only its hash is stored). */
  async markPaid(id, stripeSession) {
    const accessKey = randomKey();
    const res = await this.#write('UPDATE reports SET paid = 1, access_key_hash = ?, stripe_session = ?, updated_at = ? WHERE id = ?', [hashKey(accessKey), stripeSession, Date.now(), id]);
    return res.changes ? accessKey : null;
  }

  async deleteReport(id) {
    this.live.delete(id);
    return (await this.#write('DELETE FROM reports WHERE id = ?', [id])).changes > 0;
  }

  async deleteOlderThan(days) {
    const cutoff = Date.now() - days * 86_400_000;
    return (await this.#write('DELETE FROM reports WHERE created_at < ? AND paid = 0', [cutoff])).changes;
  }

  /** Jobs interrupted by a restart are marked failed so clients stop waiting. */
  async failStaleJobs() {
    const error = JSON.stringify({ code: 'interrupted', message: 'The audit was interrupted by a server restart. Please run it again.' });
    return (await this.#write("UPDATE reports SET status = 'failed', error = ?, updated_at = ? WHERE status IN ('queued', 'running')", [error, Date.now()])).changes;
  }

  async increment(name, by = 1) {
    await this.#write('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = value + excluded.value', [name, by]);
  }

  async counters() {
    const db = await this.#db();
    return Object.fromEntries((await db.all('SELECT name, value FROM counters')).map((r) => [r.name, Number(r.value)]));
  }

  async stats(sinceMs = 0) {
    const db = await this.#db();
    const row = await db.get(
      `SELECT COUNT(*) AS total,
        SUM(status = 'done') AS done,
        SUM(status = 'failed') AS failed,
        SUM(status IN ('queued','running')) AS in_progress,
        AVG(CASE WHEN status = 'done' THEN duration_ms END) AS avg_duration_ms,
        SUM(COALESCE(pages_crawled, 0)) AS pages_crawled,
        SUM(paid) AS paid
      FROM reports WHERE created_at >= ?`,
      [sinceMs],
    );
    const n = (v) => Number(v) || 0;
    return {
      total: n(row.total),
      done: n(row.done),
      failed: n(row.failed),
      inProgress: n(row.in_progress),
      errorRate: n(row.total) ? Math.round((n(row.failed) / n(row.total)) * 1000) / 10 : 0,
      avgDurationMs: row.avg_duration_ms ? Math.round(Number(row.avg_duration_ms)) : null,
      pagesCrawled: n(row.pages_crawled),
      paid: n(row.paid),
    };
  }

  async close() {
    await this.ready.catch(() => {});
    await this.driver.close();
  }
}
