// Two interchangeable SQL drivers with the same small async interface:
//   exec(sql)            run one or more statements, no result
//   run(sql, args)       -> { changes }
//   get(sql, args)       -> first row or undefined
//   all(sql, args)       -> rows
//
// - SqliteDriver: Node's built-in node:sqlite, one file on disk (local dev,
//   tests, or a server with a persistent disk).
// - TursoDriver: a hosted libSQL (SQLite-compatible) database reached over
//   HTTPS. Data survives redeploys of a free hosting instance, whose disk is
//   wiped every time. Uses fetch only: no extra dependency.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export class SqliteDriver {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
  }
  async exec(sql) {
    this.db.exec(sql);
  }
  async run(sql, args = []) {
    return { changes: Number(this.db.prepare(sql).run(...args).changes) };
  }
  async get(sql, args = []) {
    return this.db.prepare(sql).get(...args);
  }
  async all(sql, args = []) {
    return this.db.prepare(sql).all(...args);
  }
  async close() {
    this.db.close();
  }
}

// libSQL values travel as typed JSON: {type: "integer", value: "42"}.
const toArg = (v) => {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  return { type: 'text', value: String(v) };
};
const fromValue = (v) => {
  if (!v || v.type === 'null') return null;
  if (v.type === 'integer') return Number(v.value);
  return v.value;
};

export class TursoDriver {
  constructor(url, authToken, fetchImpl = fetch) {
    // libsql://name-org.turso.io -> https://name-org.turso.io
    this.endpoint = `${url.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '')}/v2/pipeline`;
    this.authToken = authToken;
    this.fetch = fetchImpl;
  }

  async #pipeline(statements) {
    const requests = [...statements.map((stmt) => ({ type: 'execute', stmt })), { type: 'close' }];
    const res = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.authToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Database request failed (HTTP ${res.status})`);
    const body = await res.json();
    return body.results.slice(0, statements.length).map((r) => {
      if (r.type === 'error') throw new Error(`Database error: ${r.error?.message || 'unknown'}`);
      return r.response.result;
    });
  }

  async #execute(sql, args = []) {
    const [result] = await this.#pipeline([{ sql, args: args.map(toArg) }]);
    const names = result.cols.map((c) => c.name);
    const rows = result.rows.map((row) => Object.fromEntries(row.map((v, i) => [names[i], fromValue(v)])));
    return { rows, changes: result.affected_row_count };
  }

  async exec(sql) {
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
    await this.#pipeline(statements.map((s) => ({ sql: s })));
  }
  async run(sql, args) {
    return { changes: (await this.#execute(sql, args)).changes };
  }
  async get(sql, args) {
    return (await this.#execute(sql, args)).rows[0];
  }
  async all(sql, args) {
    return (await this.#execute(sql, args)).rows;
  }
  async close() {}
}
