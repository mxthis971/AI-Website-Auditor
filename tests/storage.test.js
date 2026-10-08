// The hosted-database driver speaks libSQL's HTTP protocol. Here a fake
// endpoint answers it with a real in-memory SQLite database, so the whole
// Store runs against TursoDriver without any network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/storage/db.js';

function fakeTurso() {
  const db = new DatabaseSync(':memory:');
  const calls = [];
  const value = (v) => (v === null || v === undefined ? { type: 'null' } : typeof v === 'number' || typeof v === 'bigint' ? (Number.isInteger(Number(v)) ? { type: 'integer', value: String(v) } : { type: 'float', value: Number(v) }) : { type: 'text', value: String(v) });
  const arg = (a) => (a.type === 'null' ? null : a.type === 'integer' ? Number(a.value) : a.value);
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization });
    const { requests } = JSON.parse(init.body);
    const results = requests.map((r) => {
      if (r.type === 'close') return { type: 'ok', response: { type: 'close' } };
      try {
        const stmt = db.prepare(r.stmt.sql);
        const args = (r.stmt.args || []).map(arg);
        const isRead = /^\s*select/i.test(r.stmt.sql);
        const rows = isRead ? stmt.all(...args) : [];
        const info = isRead ? { changes: 0 } : stmt.run(...args);
        const cols = rows.length ? Object.keys(rows[0]).map((name) => ({ name })) : stmt.columns().map((c) => ({ name: c.name }));
        return { type: 'ok', response: { type: 'execute', result: { cols, rows: rows.map((row) => cols.map((c) => value(row[c.name]))), affected_row_count: Number(info.changes) } } };
      } catch (err) {
        return { type: 'error', error: { message: err.message } };
      }
    });
    return new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

test('Store works the same on the hosted (Turso) driver', async () => {
  const { fetchImpl, calls } = fakeTurso();
  const store = new Store(null, { url: 'libsql://demo-org.turso.io', authToken: 'secret', fetchImpl });
  assert.equal(store.kind, 'turso');

  const { id } = await store.createReport({ url: 'https://example.com/', lang: 'fr' });
  await store.setStatus(id, 'running', { phase: 'crawling', pagesCrawled: 1 });
  await store.setStatus(id, 'running', { phase: 'crawling', pagesCrawled: 2 });
  let r = await store.getReport(id);
  assert.equal(r.status, 'running');
  assert.equal(r.progress.pagesCrawled, 2);
  assert.equal(r.lang, 'fr');

  await store.saveResult(id, { durationMs: 1200, stats: { pagesCrawled: 3 }, score: { overall: 80 } });
  r = await store.getReport(id);
  assert.equal(r.status, 'done');
  assert.equal(r.data.score.overall, 80);
  assert.equal(r.paid, false);

  assert.ok(await store.markPaid(id, 'cs_test'));
  assert.equal((await store.getReport(id)).paid, true);

  await store.increment('audits_requested');
  await store.increment('audits_requested');
  assert.equal((await store.counters()).audits_requested, 2);
  assert.equal((await store.stats(0)).done, 1);

  assert.equal(await store.deleteReport(id), true);
  assert.equal(await store.getReport(id), null);

  // Progress updates stay in memory: the two "running" calls above made one write.
  assert.ok(calls.every((c) => c.url === 'https://demo-org.turso.io/v2/pipeline' && c.auth === 'Bearer secret'));
  await store.close();
});

test('a database error is reported, not swallowed', async () => {
  const fetchImpl = async () => new Response('nope', { status: 401 });
  const store = new Store(null, { url: 'libsql://demo-org.turso.io', authToken: 'wrong', fetchImpl });
  await assert.rejects(store.getReport('abcdefgh1234'), /HTTP 401/);
});

test('Turso settings pasted with spaces, quotes or a final slash still work', async () => {
  const { tursoConfig } = await import('../src/config.js');
  const ok = tursoConfig('  "libsql://db-org.aws-us-west-2.turso.io/"\n', ' Bearer abc.def ');
  assert.deepEqual(ok, { url: 'libsql://db-org.aws-us-west-2.turso.io', authToken: 'abc.def', problem: null });
  assert.match(tursoConfig('', 'x').problem, /URL missing/);
  assert.match(tursoConfig('postgres://x', 'x').problem, /invalid/);
  assert.match(tursoConfig('libsql://db.turso.io', '').problem, /TOKEN missing/);
});

test('a Turso URL that is really the token is reported as swapped', async () => {
  const { tursoConfig } = await import('../src/config.js');
  assert.match(tursoConfig('eyJhbGciOi.x.y', 'libsql://db.turso.io').problem, /swapped/);
  assert.match(tursoConfig('TURSO_DATABASE_URL=libsql://db.turso.io', 'x').problem, /without the name/);
});
