import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { safeFetch, FetchError } from '../src/security/safe-fetch.js';
import { UnsafeUrlError } from '../src/security/url-guard.js';
import { startSite } from './fixtures/site-server.js';

const LOCAL = ['127.0.0.1'];
let site;

before(async () => {
  site = await startSite({
    '/ok': () => ({ body: '<html><title>ok</title></html>' }),
    '/gzip': () => ({ body: '<html><title>compressed</title></html>', gzip: true }),
    '/r1': () => ({ status: 301, headers: { location: '/r2' } }),
    '/r2': () => ({ status: 302, headers: { location: '/ok' } }),
    '/loop-a': () => ({ status: 302, headers: { location: '/loop-b' } }),
    '/loop-b': () => ({ status: 302, headers: { location: '/loop-a' } }),
    '/to-metadata': () => ({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
    '/to-localhost': () => ({ status: 302, headers: { location: 'http://localhost:22/' } }),
    '/to-ftp': () => ({ status: 302, headers: { location: 'ftp://example.com/file' } }),
    '/slow': () => ({ body: 'late', delayMs: 2000 }),
    '/huge': () => ({ stream: true }),
    ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`/hop${i}`, () => ({ status: 302, headers: { location: `/hop${i + 1}` } })])),
  });
});
after(() => site.close());

test('fetches a page and reports timings', async () => {
  const res = await safeFetch(`${site.url}/ok`, { allowPrivateNetworks: LOCAL });
  assert.equal(res.status, 200);
  assert.match(res.text, /<title>ok<\/title>/);
  assert.ok(res.ttfbMs >= 0);
  assert.equal(res.redirects.length, 0);
});

test('decompresses gzip bodies', async () => {
  const res = await safeFetch(`${site.url}/gzip`, { allowPrivateNetworks: LOCAL });
  assert.match(res.text, /compressed/);
  assert.ok(res.transferBytes < res.body.length + 50);
});

test('follows redirects and records the chain', async () => {
  const res = await safeFetch(`${site.url}/r1`, { allowPrivateNetworks: LOCAL });
  assert.equal(res.url, `${site.url}/ok`);
  assert.deepEqual(res.redirects.map((r) => r.status), [301, 302]);
});

test('detects redirect loops', async () => {
  await assert.rejects(safeFetch(`${site.url}/loop-a`, { allowPrivateNetworks: LOCAL }), (e) => e instanceof FetchError && e.code === 'redirect_loop');
});

test('stops after too many redirects', async () => {
  await assert.rejects(safeFetch(`${site.url}/hop0`, { allowPrivateNetworks: LOCAL, maxRedirects: 3 }), (e) => e.code === 'too_many_redirects');
});

test('re-validates every redirect target (no redirect to private or non-http targets)', async () => {
  await assert.rejects(safeFetch(`${site.url}/to-metadata`, { allowPrivateNetworks: LOCAL }), (e) => e instanceof UnsafeUrlError && e.code === 'private_address');
  await assert.rejects(safeFetch(`${site.url}/to-localhost`, { allowPrivateNetworks: LOCAL }), (e) => e instanceof UnsafeUrlError);
  await assert.rejects(safeFetch(`${site.url}/to-ftp`, { allowPrivateNetworks: LOCAL }), (e) => e.code === 'unsupported_protocol');
});

test('blocks private targets when no allow-list is given', async () => {
  await assert.rejects(safeFetch(`${site.url}/ok`), (e) => e instanceof UnsafeUrlError);
});

test('times out slow servers', async () => {
  const started = Date.now();
  await assert.rejects(safeFetch(`${site.url}/slow`, { allowPrivateNetworks: LOCAL, timeoutMs: 300 }), (e) => e.code === 'timeout');
  assert.ok(Date.now() - started < 1500);
});

test('truncates bodies larger than the size limit', async () => {
  const res = await safeFetch(`${site.url}/huge`, { allowPrivateNetworks: LOCAL, maxBodyBytes: 200 * 1024, timeoutMs: 5000 });
  assert.equal(res.truncated, true);
  assert.ok(res.body.length <= 200 * 1024);
});

test('reports connection errors and unknown domains clearly', async () => {
  await assert.rejects(safeFetch('http://127.0.0.1:1/', { allowPrivateNetworks: LOCAL, timeoutMs: 2000 }), (e) => e.code === 'connection_refused');
  const resolver = (host, opts, cb) => cb(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));
  await assert.rejects(safeFetch('https://does-not-exist.example.org/', { resolver, timeoutMs: 2000 }), (e) => e.code === 'dns_failed');
});
