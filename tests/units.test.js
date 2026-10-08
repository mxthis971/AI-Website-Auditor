// Unit tests for parsers, scoring, catalog and report view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePage, normalizeUrl } from '../src/analyzer/page.js';
import { parseRobots } from '../src/crawler/robots.js';
import { parseSitemap } from '../src/crawler/sitemap.js';
import { scoreResults, penaltyFor } from '../src/analyzer/scoring.js';
import { CATALOG, describe } from '../src/analyzer/catalog.js';
import { extractPagespeed } from '../src/analyzer/pagespeed.js';
import { buildView, FREE_DETAILED_ISSUES } from '../src/report/view.js';
import { verifyWebhookSignature, signPayloadForTests } from '../src/payments/stripe.js';

test('parsePage extracts SEO, accessibility and content facts', () => {
  const html = `<html lang="fr"><head><title> Hello  World </title><meta name="description" content="Desc">
  <link rel="canonical" href="/canon"><meta name="viewport" content="width=device-width, user-scalable=no">
  <script type="application/ld+json">{"@type":"Product"}</script><script type="application/ld+json">{bad json}</script>
  <script src="/a.js"></script><script src="/b.js" defer></script></head>
  <body><h1>A</h1><h3>C</h3><img src="/x.png"><img src="/y.png" alt=""><a href="/in">In</a><a href="https://other.org/">Out</a>
  <a href="mailto:a@b.c">mail</a><a href="/icon"><svg></svg></a><button></button><input id="n"><label for="n">N</label><input>
  <div id="d"></div><div id="d"></div><iframe src="/f"></iframe></body></html>`;
  const f = parsePage(html, 'https://www.site.com/page');
  assert.equal(f.title, 'Hello World');
  assert.equal(f.lang, 'fr');
  assert.deepEqual(f.canonicals, ['https://www.site.com/canon']);
  assert.equal(f.zoomDisabled, true);
  assert.deepEqual(f.jsonLd.map((j) => j.valid), [true, false]);
  assert.deepEqual(f.headings.map((h) => h.level), [1, 3]);
  assert.equal(f.images[0].alt, null);
  assert.equal(f.images[1].alt, '');
  assert.equal(f.links.filter((l) => l.internal).length, 2);
  assert.equal(f.links.length, 3, 'mailto links are ignored');
  assert.equal(f.emptyLinks, 1);
  assert.equal(f.unnamedButtons, 1);
  assert.equal(f.unlabeledInputs, 1);
  assert.deepEqual(f.duplicateIds, ['d']);
  assert.equal(f.iframesWithoutTitle, 1);
  assert.equal(f.scripts.filter((s) => s.inHead && !s.defer).length, 1);
});

test('normalizeUrl strips fragments and tracking parameters', () => {
  assert.equal(normalizeUrl('/a?utm_source=x&id=2#top', 'https://s.com/'), 'https://s.com/a?id=2');
  assert.equal(normalizeUrl('javascript:void(0)', 'https://s.com/'), null);
});

test('robots.txt parser: groups, longest match, allow wins ties, wildcards', () => {
  const r = parseRobots(`# comment
User-agent: Googlebot
Disallow: /only-google

User-agent: *
Disallow: /private
Allow: /private/public
Disallow: /*.pdf$
Sitemap: https://s.com/sitemap.xml`);
  assert.equal(r.isAllowed('/'), true);
  assert.equal(r.isAllowed('/private/x'), false);
  assert.equal(r.isAllowed('/private/public/x'), true);
  assert.equal(r.isAllowed('/doc.pdf'), false);
  assert.equal(r.isAllowed('/doc.pdf?x=1'), true);
  assert.equal(r.isAllowed('/only-google'), true);
  assert.deepEqual(r.sitemaps, ['https://s.com/sitemap.xml']);
  assert.equal(r.disallowsEverything, false);
  assert.equal(parseRobots('User-agent: *\nDisallow: /').disallowsEverything, true);
  assert.equal(parseRobots('User-agent: *\nDisallow:').isAllowed('/x'), true);
});

test('robots.txt group for our own bot takes precedence', () => {
  const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: AuditeurSEOBot\nAllow: /');
  assert.equal(r.isAllowed('/page'), true);
});

test('sitemap parser handles urlset, index, CDATA and invalid files', () => {
  assert.deepEqual(parseSitemap('<urlset><url><loc> https://a.com/1 </loc></url><url><loc><![CDATA[https://a.com/2?a=1&amp;b=2]]></loc></url></urlset>').locs, ['https://a.com/1', 'https://a.com/2?a=1&b=2']);
  assert.equal(parseSitemap('<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>').type, 'index');
  assert.equal(parseSitemap('<html>Not found</html>').valid, false);
});

test('scoring: penalties scale with affected pages and multiply per category', () => {
  assert.equal(penaltyFor({ id: 'h1-missing', scope: 'page', ratio: 1 }), 10);
  assert.equal(penaltyFor({ id: 'h1-missing', scope: 'page', ratio: 0.2 }), 6);
  assert.equal(penaltyFor({ id: 'https-missing', scope: 'site' }), 25);
  const s = scoreResults([
    { id: 'https-missing', failed: true, scope: 'site', ratio: 1, count: 1 },
    { id: 'http-not-redirected', failed: true, scope: 'site', ratio: 1, count: 1 },
    { id: 'title-missing', failed: false, scope: 'page', ratio: 0, count: 0 },
  ]);
  assert.equal(s.categories.technical.score, 68); // 100 × 0.75 × 0.90 = 67.5
  assert.equal(s.categories.seo.score, 100);
  assert.equal(s.overall, Math.round(100 * 0.3 + 100 * 0.2 + 100 * 0.2 + 68 * 0.2 + 100 * 0.1));
  assert.equal(s.issues[0].id, 'https-missing', 'critical issues first');
  assert.throws(() => scoreResults([{ id: 'unknown-check', failed: true }]));
});

test('catalog: every check has complete English and French texts', () => {
  for (const [id, entry] of Object.entries(CATALOG)) {
    for (const lang of ['en', 'fr']) {
      assert.equal(entry[lang].length, 6, `${id} ${lang}`);
      for (const i of [0, 1, 2, 3, 4]) assert.ok(entry[lang][i].length > 3, `${id} ${lang} field ${i}`);
    }
    assert.ok(['critical', 'warning', 'info'].includes(entry.severity));
  }
  assert.equal(describe('heavy-images', 'fr', { count: 3, kb: 300 }).title, '3 image(s) de l’accueil dépassent 300 Ko');
});

test('pagespeed extraction prefers field data and rates metrics', () => {
  const r = extractPagespeed({
    loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4500 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 } } },
    lighthouseResult: { categories: { performance: { score: 0.42 } }, audits: { 'total-blocking-time': { numericValue: 150 } } },
  });
  assert.equal(r.metrics.lcp.rating, 'poor');
  assert.equal(r.metrics.cls.value, 0.05);
  assert.equal(r.metrics.cls.rating, 'good');
  assert.equal(r.lighthouse.performance, 42);
  assert.equal(r.source, 'field');
});

const fakeReport = () => ({
  url: 'https://site.com/',
  createdAt: new Date().toISOString(),
  score: { overall: 70, categories: { seo: { score: 60 }, performance: { score: 80 }, accessibility: { score: 90 }, technical: { score: 70 }, content: { score: 50 } } },
  issues: Array.from({ length: 8 }, (_, i) => ({ id: 'h1-missing', category: 'seo', severity: i < 2 ? 'critical' : 'warning', count: 1, values: { count: 1 }, affected: [{ url: `https://site.com/${i}` }], penalty: 10 })),
  passed: [{ id: 'title-missing', category: 'seo' }],
  stats: {},
  pages: [{ url: 'a' }, { url: 'b' }, { url: 'c' }, { url: 'd' }],
});

test('free view hides details beyond the first issues; full view shows everything', () => {
  const free = buildView(fakeReport(), { lang: 'en', full: false });
  assert.equal(free.issues.filter((i) => !i.locked).length, FREE_DETAILED_ISSUES);
  assert.equal(free.lockedCount, 8 - FREE_DETAILED_ISSUES);
  const locked = free.issues.find((i) => i.locked);
  assert.equal(locked.affected, undefined, 'locked issues must not leak affected URLs');
  assert.equal(locked.fix, undefined);
  assert.equal(free.pages.length, 3);
  const full = buildView(fakeReport(), { lang: 'fr', full: true });
  assert.equal(full.lockedCount, 0);
  assert.match(full.summary, /obtient 70\/100/);
});

test('Stripe webhook signature verification', () => {
  const body = '{"type":"checkout.session.completed"}';
  const header = signPayloadForTests(body, 'whsec_test');
  assert.equal(verifyWebhookSignature(body, header, 'whsec_test'), true);
  assert.equal(verifyWebhookSignature(body, header, 'whsec_other'), false);
  assert.equal(verifyWebhookSignature(`${body} `, header, 'whsec_test'), false, 'tampered body');
  const old = signPayloadForTests(body, 'whsec_test', Math.floor(Date.now() / 1000) - 3600);
  assert.equal(verifyWebhookSignature(body, old, 'whsec_test'), false, 'replayed old event');
  assert.equal(verifyWebhookSignature(body, undefined, 'whsec_test'), false);
});

test('Stripe test keys never enable payments on the public site', async () => {
  const { paymentsEnabled } = await import('../src/config.js');
  const payments = { stripeSecretKey: 'sk_test_x', stripeWebhookSecret: 'whsec_x', reportPriceId: 'price_x' };
  assert.equal(paymentsEnabled({ publicBaseUrl: 'http://localhost:3000', payments }), true);
  assert.equal(paymentsEnabled({ publicBaseUrl: 'https://auditeur-seo.fr', payments }), false);
  assert.equal(paymentsEnabled({ publicBaseUrl: 'https://auditeur-seo.fr', payments: { ...payments, stripeSecretKey: 'sk_live_x' } }), true);
});
