// SQLite storage using Node's built-in driver (node:sqlite): zero dependency,
// one file on disk. Enough for an MVP; the Store interface (a handful of
// methods) is small so it can be swapped for Postgres/Turso later.
//
// We store only what is needed: the audited URL and the report. No names,
// no emails, no IP addresses. Secret keys are stored as SHA-256 hashes.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

export class Store {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
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
    `);
  }

  createReport({ url, lang }) {
    const id = randomId();
    const ownerKey = randomKey();
    const now = Date.now();
    this.db
      .prepare('INSERT INTO reports (id, url, lang, status, owner_key_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, url, lang, 'queued', hashKey(ownerKey), now, now);
    return { id, ownerKey };
  }

  getReport(id) {
    const row = this.db.prepare('SELECT * FROM reports WHERE id = ?').get(String(id));
    if (!row) return null;
    return {
      id: row.id,
      url: row.url,
      lang: row.lang,
      status: row.status,
      progress: row.progress ? JSON.parse(row.progress) : null,
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

  setStatus(id, status, progress = null) {
    this.db.prepare('UPDATE reports SET status = ?, progress = ?, updated_at = ? WHERE id = ?').run(status, progress ? JSON.stringify(progress) : null, Date.now(), id);
  }

  saveResult(id, data) {
    this.db
      .prepare('UPDATE reports SET status = ?, data = ?, progress = NULL, duration_ms = ?, pages_crawled = ?, updated_at = ? WHERE id = ?')
      .run('done', JSON.stringify(data), data.durationMs, data.stats.pagesCrawled, Date.now(), id);
  }

  saveError(id, error, durationMs = null) {
    this.db.prepare('UPDATE reports SET status = ?, error = ?, progress = NULL, duration_ms = ?, updated_at = ? WHERE id = ?').run('failed', JSON.stringify(error), durationMs, Date.now(), id);
  }

  saveAi(id, ai) {
    this.db.prepare('UPDATE reports SET ai = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(ai), Date.now(), id);
  }

  /** Marks a report as paid and returns a fresh access key (only its hash is stored). */
  markPaid(id, stripeSession) {
    const accessKey = randomKey();
    const res = this.db
      .prepare('UPDATE reports SET paid = 1, access_key_hash = ?, stripe_session = ?, updated_at = ? WHERE id = ?')
      .run(hashKey(accessKey), stripeSession, Date.now(), id);
    return res.changes ? accessKey : null;
  }

  deleteReport(id) {
    return this.db.prepare('DELETE FROM reports WHERE id = ?').run(id).changes > 0;
  }

  deleteOlderThan(days) {
    const cutoff = Date.now() - days * 86_400_000;
    return this.db.prepare('DELETE FROM reports WHERE created_at < ? AND paid = 0').run(cutoff).changes;
  }

  /** Jobs interrupted by a restart are marked failed so clients stop waiting. */
  failStaleJobs() {
    return this.db
      .prepare("UPDATE reports SET status = 'failed', error = ?, updated_at = ? WHERE status IN ('queued', 'running')")
      .run(JSON.stringify({ code: 'interrupted', message: 'The audit was interrupted by a server restart. Please run it again.' }), Date.now()).changes;
  }

  increment(name, by = 1) {
    this.db.prepare('INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = value + excluded.value').run(name, by);
  }

  counters() {
    return Object.fromEntries(this.db.prepare('SELECT name, value FROM counters').all().map((r) => [r.name, r.value]));
  }

  stats(sinceMs = 0) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
          SUM(status = 'done') AS done,
          SUM(status = 'failed') AS failed,
          SUM(status IN ('queued','running')) AS in_progress,
          AVG(CASE WHEN status = 'done' THEN duration_ms END) AS avg_duration_ms,
          SUM(COALESCE(pages_crawled, 0)) AS pages_crawled,
          SUM(paid) AS paid
        FROM reports WHERE created_at >= ?`,
      )
      .get(sinceMs);
    return {
      total: row.total || 0,
      done: row.done || 0,
      failed: row.failed || 0,
      inProgress: row.in_progress || 0,
      errorRate: row.total ? Math.round(((row.failed || 0) / row.total) * 1000) / 10 : 0,
      avgDurationMs: row.avg_duration_ms ? Math.round(row.avg_duration_ms) : null,
      pagesCrawled: row.pages_crawled || 0,
      paid: row.paid || 0,
    };
  }

  close() {
    this.db.close();
  }
}
