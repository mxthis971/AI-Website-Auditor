// End-to-end audits of fake websites served locally.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runAudit } from '../src/audit.js';
import { loadConfig } from '../src/config.js';
import { AuditError } from '../src/crawler/crawler.js';
import { startSite, defaultRoutes } from './fixtures/site-server.js';

const config = (crawler = {}) => loadConfig({ crawler: { allowPrivateNetworks: ['127.0.0.1'], requestTimeoutMs: 3000, ...crawler }, pagespeed: { apiKey: '' } });
const ids = (report) => new Set(report.issues.map((i) => i.id));
const issue = (report, id) => report.issues.find((i) => i.id === id);

let site;
let report;
before(async () => {
  site = await startSite();
  report = await runAudit(site.url, { config: config() });
});
after(() => site.close());

test('produces a complete report with scores', () => {
  assert.ok(report.score.overall >= 0 && report.score.overall <= 100);
  for (const c of ['seo', 'performance', 'accessibility', 'technical', 'content']) {
    assert.ok(Number.isInteger(report.score.categories[c].score), c);
  }
  assert.ok(report.stats.pagesCrawled >= 5);
  assert.ok(report.passed.length > 10);
});

test('detects missing title, meta description and H1', () => {
  const found = ids(report);
  for (const id of ['title-missing', 'meta-description-missing', 'h1-missing']) assert.ok(found.has(id), id);
  assert.ok(issue(report, 'h1-missing').affected.some((a) => a.url.endsWith('/no-h1')));
});

test('detects multiple H1 and skipped heading levels', () => {
  assert.ok(issue(report, 'h1-multiple').affected.some((a) => a.url.endsWith('/multi-h1')));
  assert.ok(issue(report, 'heading-order-skipped').affected.some((a) => a.url.endsWith('/about')));
});

test('detects broken internal links and redirect chains', () => {
  const broken = issue(report, 'broken-internal-links');
  assert.ok(broken.affected.some((a) => a.url.endsWith('/missing-page') && a.detail.includes('404')));
  assert.ok(issue(report, 'redirect-chains').affected.some((a) => a.url.endsWith('/redirect-1')));
});

test('a redirected link is not analysed twice', () => {
  const aboutPages = report.pages.filter((p) => p.url.endsWith('/about'));
  assert.equal(aboutPages.length, 1);
});

test('detects heavy images, missing alt, render-blocking scripts and missing compression', () => {
  const found = ids(report);
  for (const id of ['heavy-images', 'img-alt-missing', 'render-blocking-scripts', 'compression-missing', 'form-labels-missing']) assert.ok(found.has(id), id);
  assert.match(issue(report, 'heavy-images').affected[0].detail, /400 KB/);
});

test('detects invalid hreflang on a multilingual site', () => {
  const h = issue(report, 'hreflang-invalid');
  assert.ok(h);
  assert.match(h.affected[0].detail, /english/);
  assert.ok(!h.affected[0].detail.includes(' fr'), 'valid code "fr" must not be reported');
});

test('detects HTTP (no HTTPS), lorem ipsum and thin content', () => {
  const found = ids(report);
  for (const id of ['https-missing', 'lorem-ipsum', 'thin-content']) assert.ok(found.has(id), id);
});

test('robots.txt and sitemap present: no false positives', () => {
  const found = ids(report);
  assert.ok(!found.has('robots-txt-missing'));
  assert.ok(!found.has('sitemap-missing'));
  assert.ok(!found.has('legal-pages-missing'));
  assert.ok(!found.has('viewport-missing'));
});

test('missing robots.txt and sitemap are reported', async () => {
  const routes = defaultRoutes();
  delete routes['/robots.txt'];
  delete routes['/sitemap.xml'];
  const s = await startSite(routes);
  try {
    const r = await runAudit(s.url, { config: config({ maxPages: 2 }) });
    assert.ok(ids(r).has('robots-txt-missing'));
    assert.ok(ids(r).has('sitemap-missing'));
  } finally {
    await s.close();
  }
});

test('robots.txt blocking everything is critical, and disallowed pages are not crawled', async () => {
  const routes = defaultRoutes();
  routes['/robots.txt'] = () => ({ body: 'User-agent: *\nDisallow: /\n', headers: { 'content-type': 'text/plain' } });
  const s = await startSite(routes);
  try {
    const r = await runAudit(s.url, { config: config() });
    assert.equal(issue(r, 'robots-txt-blocks-all').severity, 'critical');
    assert.equal(r.stats.pagesCrawled, 1, 'only the submitted page is fetched');
    assert.ok(!s.hits.some((h) => h.method === 'GET' && h.path === '/about'), '/about must not be crawled');
  } finally {
    await s.close();
  }
});

test('respects the page limit and the depth limit', async () => {
  let r = await runAudit(site.url, { config: config({ maxPages: 3 }) });
  assert.ok(r.stats.pagesCrawled <= 3);
  r = await runAudit(site.url, { config: config({ maxDepth: 0, maxPages: 20 }) });
  assert.ok(r.pages.every((p) => p.depth === 0 || p.depth === 1));
  assert.ok(r.pages.filter((p) => p.depth === 1).every((p) => p.url.endsWith('/about')), 'only sitemap seeds may be added at depth 1');
});

test('limits the number of links checked', async () => {
  const many = Array.from({ length: 50 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join(' ');
  const s = await startSite({ '/': () => ({ body: `<html><head><title>Many links page title</title></head><body><h1>x</h1>${many}</body></html>` }) });
  try {
    const r = await runAudit(s.url, { config: config({ maxPages: 1, maxLinksToCheck: 10 }) });
    assert.equal(r.stats.linksChecked, 10);
    assert.ok(s.hits.length < 20, `expected few requests, got ${s.hits.length}`);
  } finally {
    await s.close();
  }
});

test('unreachable site fails with a clear error', async () => {
  await assert.rejects(runAudit('http://127.0.0.1:1/', { config: config() }), (e) => e.code === 'connection_refused');
});

test('homepage returning HTTP 500 fails with a clear error', async () => {
  const s = await startSite({ '/': () => ({ status: 500, body: 'boom' }) });
  try {
    await assert.rejects(runAudit(s.url, { config: config() }), (e) => e instanceof AuditError && e.code === 'http_error');
  } finally {
    await s.close();
  }
});

test('a site that blocks robots gets a "blocked" error, not "broken"', async () => {
  const s = await startSite({ '/': () => ({ status: 403, body: 'denied' }) });
  try {
    await assert.rejects(runAudit(s.url, { config: config() }), (e) => e instanceof AuditError && e.code === 'blocked');
  } finally {
    await s.close();
  }
});

test('login pages are not broken links, and canonical URL variants are not duplicates', async () => {
  const page = (title, extra = '') => () => ({ body: `<html lang="en"><head><title>${title}</title>${extra}</head><body><h1>Hi</h1><a href="/account">Account</a><a href="/?lang=fr">FR</a></body></html>` });
  const s = await startSite({ '/': page('Home page of the test website', '<link rel="canonical" href="/">'), '/account': () => ({ status: 401, body: 'login' }) });
  try {
    const r = await runAudit(s.url, { config: config() });
    assert.ok(!ids(r).has('broken-internal-links'));
    assert.ok(!ids(r).has('title-duplicate'));
  } finally {
    await s.close();
  }
});

test('slow homepage times out', async () => {
  const s = await startSite({ '/': () => ({ body: '<html></html>', delayMs: 3000 }) });
  try {
    await assert.rejects(runAudit(s.url, { config: config({ requestTimeoutMs: 500 }) }), (e) => e.code === 'timeout');
  } finally {
    await s.close();
  }
});

test('slow server response is reported', async () => {
  const s = await startSite({ '/': () => ({ body: '<html><head><title>Slow page title here</title></head><body><h1>x</h1></body></html>', delayMs: 900 }) });
  try {
    const r = await runAudit(s.url, { config: config({ maxPages: 1 }) });
    assert.ok(ids(r).has('slow-server-response'));
  } finally {
    await s.close();
  }
});

test('private targets are refused before any request', async () => {
  const strict = loadConfig({ pagespeed: { apiKey: '' } });
  await assert.rejects(runAudit(site.url, { config: strict }), (e) => e.code === 'private_address' || e.code === 'port_not_allowed');
  await assert.rejects(runAudit('http://169.254.169.254/', { config: strict }), (e) => e.code === 'private_address');
});

test('a well-built page gets a high score', async () => {
  const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
  const good = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Handmade Leather Bags | Atelier Example</title><meta name="description" content="Handmade leather bags crafted in Lyon. Free shipping in France and a two-year warranty.">
<link rel="canonical" href="/"><link rel="icon" href="/favicon.svg"><meta property="og:title" content="Bags"><meta property="og:description" content="Bags"><meta property="og:image" content="/og.jpg">
<meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Atelier"}</script></head>
<body><h1>Leather bags</h1><h2>Our workshop</h2><p>${words}</p><a href="/privacy">Privacy policy</a><a href="/about">About</a><a href="/contact">Contact</a></body></html>`;
  const sub = (t) => good.replace('Handmade Leather Bags | Atelier Example', t).replace('Handmade leather bags crafted', `${t} page crafted`);
  const s = await startSite({
    '/': () => ({ body: good, gzip: true }),
    '/privacy': () => ({ body: sub('Privacy Policy | Atelier Example'), gzip: true }),
    '/about': () => ({ body: sub('About the Workshop | Atelier Example'), gzip: true }),
    '/contact': () => ({ body: sub('Contact the Workshop | Atelier Example'), gzip: true }),
    '/robots.txt': () => ({ body: 'User-agent: *\nAllow: /\nSitemap: /sitemap.xml', headers: { 'content-type': 'text/plain' } }),
    '/sitemap.xml': () => ({ body: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>/</loc></url></urlset>', headers: { 'content-type': 'application/xml' } }),
  });
  try {
    const r = await runAudit(s.url, { config: config() });
    const nonHttps = r.issues.filter((i) => i.id !== 'https-missing');
    assert.ok(r.score.categories.seo.score >= 85, `seo ${r.score.categories.seo.score}: ${nonHttps.map((i) => i.id)}`);
    assert.ok(r.score.categories.accessibility.score >= 95, `a11y ${r.score.categories.accessibility.score}`);
  } finally {
    await s.close();
  }
});
