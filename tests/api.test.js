// HTTP API tests (no network port: app.inject simulates requests).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/storage/db.js';
import { signPayloadForTests } from '../src/payments/stripe.js';
import { startSite } from './fixtures/site-server.js';

let site;
before(async () => {
  site = await startSite();
});
after(() => site.close());

const makeConfig = (extra = {}) =>
  loadConfig({ crawler: { allowPrivateNetworks: ['127.0.0.1'], maxPages: 4, requestTimeoutMs: 3000 }, pagespeed: { apiKey: '' }, ai: { apiKey: '' }, metricsToken: 'secret-token', ...extra });

async function makeApp(options = {}) {
  return buildApp({ config: makeConfig(options.config), store: new Store(':memory:'), logger: false, aiClient: options.aiClient ?? null, fetchImpl: options.fetchImpl });
}

async function runAuditViaApi(app) {
  const res = await app.inject({ method: 'POST', url: '/api/audits', payload: { url: site.url } });
  assert.equal(res.statusCode, 202);
  await app.queue.idle();
  return res.json();
}

test('full flow: start audit, poll, read report', async () => {
  const app = await makeApp();
  const { id, ownerKey } = await runAuditViaApi(app);
  assert.ok(ownerKey.length > 20);
  const status = (await app.inject(`/api/audits/${id}`)).json();
  assert.equal(status.status, 'done');
  assert.ok(status.score >= 0);
  const report = (await app.inject(`/api/reports/${id}`)).json();
  assert.equal(report.full, true, 'payments disabled → full report (beta)');
  assert.ok(report.issues.length > 0);
  assert.equal(report.score.categories.length, 5);
  const page = await app.inject(`/r/${id}`);
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /noindex/);
  assert.match(page.body, /\/100/);
  await app.close();
});

test('invalid and unsafe URLs are rejected with 400', async () => {
  const app = await buildApp({ config: loadConfig({ pagespeed: { apiKey: '' }, ai: { apiKey: '' } }), store: new Store(':memory:'), logger: false, aiClient: null });
  for (const url of ['', 'javascript:alert(1)', 'http://localhost/', 'http://10.0.0.1/', 'http://169.254.169.254/', 'https://example.com:8443/', 'ftp://example.com']) {
    const res = await app.inject({ method: 'POST', url: '/api/audits', payload: { url } });
    assert.equal(res.statusCode, 400, url);
    assert.ok(res.json().error.message);
  }
  await app.close();
});

test('audit creation is rate limited per IP', async () => {
  const app = await makeApp({ config: { limits: { auditsPerIpPerHour: 2, maxConcurrentAudits: 1, maxQueuedAudits: 20 } } });
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await app.inject({ method: 'POST', url: '/api/audits', payload: { url: site.url } })).statusCode);
  assert.deepEqual(codes, [202, 202, 429]);
  await app.queue.idle();
  await app.close();
});

test('queue refuses work when full', async () => {
  const app = await makeApp({ config: { limits: { auditsPerIpPerHour: 100, maxConcurrentAudits: 1, maxQueuedAudits: 1 } } });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await app.inject({ method: 'POST', url: '/api/audits', payload: { url: site.url } })).statusCode);
  assert.ok(codes.includes(503), codes.join(','));
  await app.queue.idle();
  await app.close();
});

test('unknown and malformed ids return 404', async () => {
  const app = await makeApp();
  assert.equal((await app.inject('/api/audits/doesnotexist1')).statusCode, 404);
  assert.equal((await app.inject('/api/reports/..%2F..%2Fetc')).statusCode, 404);
  assert.equal((await app.inject('/r/nope')).statusCode, 404);
  await app.close();
});

test('only the owner can delete a report', async () => {
  const app = await makeApp();
  const { id, ownerKey } = await runAuditViaApi(app);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/reports/${id}`, headers: { 'x-owner-key': 'wrong' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/reports/${id}`, headers: { 'x-owner-key': ownerKey } })).statusCode, 200);
  assert.equal((await app.inject(`/api/reports/${id}`)).statusCode, 404);
  await app.close();
});

const paymentConfig = { payments: { stripeSecretKey: 'sk_test_x', stripeWebhookSecret: 'whsec_test', reportPriceId: 'price_x' } };

test('with payments enabled: free view is gated, payment unlocks the full report', async () => {
  let sessionReportId;
  const fetchImpl = async (url, opts) => {
    if (String(url).endsWith('/checkout/sessions') && opts.method === 'POST') {
      const body = new URLSearchParams(opts.body);
      assert.equal(body.get('line_items[0][price]'), 'price_x');
      sessionReportId = body.get('metadata[report_id]');
      return { ok: true, json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' }) };
    }
    if (String(url).includes('/checkout/sessions/cs_test_123')) {
      return { ok: true, json: async () => ({ id: 'cs_test_123', payment_status: 'paid', metadata: { report_id: sessionReportId } }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'nope' } }) };
  };
  const app = await makeApp({ config: paymentConfig, fetchImpl });
  const { id } = await runAuditViaApi(app);

  const free = (await app.inject(`/api/reports/${id}`)).json();
  assert.equal(free.full, false);
  assert.ok(free.lockedCount > 0);
  assert.ok(free.issues.filter((i) => i.locked).every((i) => !i.fix && !i.affected));

  const checkout = (await app.inject({ method: 'POST', url: `/api/reports/${id}/checkout`, payload: {} })).json();
  assert.match(checkout.checkoutUrl, /checkout\.stripe\.com/);

  const claim = (await app.inject({ method: 'POST', url: `/api/reports/${id}/claim`, payload: { sessionId: 'cs_test_123' } })).json();
  assert.ok(claim.accessKey);
  // Payment starts the deep crawl of the same report.
  assert.equal((await app.inject(`/api/audits/${id}`)).json().status === 'done', false);
  await app.queue.idle();
  const full = (await app.inject(`/api/reports/${id}?key=${encodeURIComponent(claim.accessKey)}`)).json();
  assert.equal(full.full, true);
  assert.equal(full.deep, true);
  assert.equal(full.recheck.available, true);
  assert.equal(full.lockedCount, 0);
  assert.equal((await app.inject(`/api/reports/${id}?key=wrong`)).json().full, false);
  await app.close();
});

test('a paid session cannot unlock a different report', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ id: 'cs_test_9', payment_status: 'paid', metadata: { report_id: 'someOtherReport1' } }) });
  const app = await makeApp({ config: paymentConfig, fetchImpl });
  const { id } = await runAuditViaApi(app);
  const res = await app.inject({ method: 'POST', url: `/api/reports/${id}/claim`, payload: { sessionId: 'cs_test_9' } });
  assert.equal(res.statusCode, 402);
  await app.close();
});

test('Stripe webhook requires a valid signature', async () => {
  const app = await makeApp({ config: paymentConfig });
  const { id } = await runAuditViaApi(app);
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', metadata: { report_id: id } } } });
  const bad = await app.inject({ method: 'POST', url: '/api/stripe/webhook', payload, headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' } });
  assert.equal(bad.statusCode, 400);
  const good = await app.inject({ method: 'POST', url: '/api/stripe/webhook', payload, headers: { 'content-type': 'application/json', 'stripe-signature': signPayloadForTests(payload, 'whsec_test') } });
  assert.equal(good.statusCode, 200);
  assert.equal((await app.store.getReport(id)).paid, true);
  await app.close();
});

test('AI summary: disabled without key, cached when enabled', async () => {
  let app = await makeApp();
  let { id } = await runAuditViaApi(app);
  assert.equal((await app.inject({ method: 'POST', url: `/api/reports/${id}/ai-summary`, payload: {} })).statusCode, 501);
  await app.close();

  let calls = 0;
  const aiClient = {
    beta: {
      messages: {
        create: async (params) => {
          calls++;
          assert.equal(params.output_config.format.type, 'json_schema');
          assert.ok(!params.messages[0].content.includes('ownerKey'));
          return {
            model: params.model,
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify({ summary: 'Fix the broken link first.', priorities: [{ issueId: 'broken-internal-links', why: 'Visitors hit a 404.', steps: ['Fix the link'] }, { issueId: 'invented-id', why: 'x', steps: [] }], quickWins: ['Add alt text'], suggestedTitle: 'Better title', suggestedDescription: '' }) }],
          };
        },
      },
    },
  };
  app = await makeApp({ aiClient });
  ({ id } = await runAuditViaApi(app));
  const first = (await app.inject({ method: 'POST', url: `/api/reports/${id}/ai-summary`, payload: { lang: 'en' } })).json();
  assert.equal(first.summary, 'Fix the broken link first.');
  assert.deepEqual(first.priorities.map((p) => p.issueId), ['broken-internal-links'], 'unknown issue ids from the model are dropped');
  await app.inject({ method: 'POST', url: `/api/reports/${id}/ai-summary`, payload: { lang: 'en' } });
  assert.equal(calls, 1, 'second request is served from cache');
  const report = (await app.inject(`/api/reports/${id}?lang=en`)).json();
  assert.equal(report.ai.summary, 'Fix the broken link first.');
  await app.close();
});

test('tool endpoint runs a focused check', async () => {
  const app = await makeApp();
  const res = await app.inject({ method: 'POST', url: '/api/tools/heading-checker', payload: { url: `${site.url}/multi-h1` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.issues.every((i) => ['h1-missing', 'h1-multiple', 'h2-missing', 'heading-order-skipped'].includes(i.id)));
  assert.ok(body.issues.some((i) => i.id === 'h1-multiple'));
  assert.ok(body.homepage.headings.length >= 2);
  assert.equal((await app.inject({ method: 'POST', url: '/api/tools/unknown', payload: { url: site.url } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/tools/__proto__', payload: { url: site.url } })).statusCode, 404);
  await app.close();
});

test('metrics require a token and expose basic counters', async () => {
  const app = await makeApp();
  await runAuditViaApi(app);
  assert.equal((await app.inject('/api/metrics')).statusCode, 401);
  const m = (await app.inject({ url: '/api/metrics', headers: { authorization: 'Bearer secret-token' } })).json();
  assert.equal(m.allTime.done, 1);
  assert.ok(m.allTime.avgDurationMs >= 0);
  assert.equal(m.counters.audits_requested, 1);
  await app.inject({ method: 'POST', url: '/api/interest', payload: { plan: 'pro' } });
  assert.equal((await app.store.counters()).interest_pro, 1);
  await app.close();
});

test('pages render with SEO tags and security headers', async () => {
  const app = await makeApp();
  for (const url of ['/', '/fr/', '/tools/', '/tools/meta-tag-checker', '/pricing', '/fr/tarifs', '/how-scoring-works', '/privacy', '/fr/confidentialite', '/terms', '/legal']) {
    const res = await app.inject(url);
    assert.equal(res.statusCode, 200, url);
    assert.match(res.body, /<title>[^<]{10,}<\/title>/, url);
    assert.match(res.body, /<meta name="description" content="[^"]{20,}"/, url);
    assert.match(res.body, /rel="canonical"/, url);
    assert.ok(res.headers['content-security-policy'], url);
  }
  const home = await app.inject('/');
  assert.match(home.body, /hreflang="fr"/);
  assert.match(home.body, /application\/ld\+json/);
  const sitemap = await app.inject('/sitemap.xml');
  assert.match(sitemap.body, /<loc>http:\/\/localhost:3000\/tools\/robots-txt-checker<\/loc>/);
  const robots = await app.inject('/robots.txt');
  assert.match(robots.body, /Disallow: \/r\//);
  assert.equal((await app.inject('/does-not-exist')).statusCode, 404);
  await app.close();
});

test('interrupted audits are marked failed on restart', async () => {
  const store = new Store(':memory:');
  const { id } = await store.createReport({ url: 'https://example.com/', lang: 'en' });
  await store.setStatus(id, 'running', { phase: 'crawling' });
  const app = await buildApp({ config: makeConfig(), store, logger: false, aiClient: null });
  assert.equal((await store.getReport(id)).status, 'failed');
  await app.close();
});

test('AdSense: nothing from Google without a publisher ID', async () => {
  const app = await makeApp();
  const home = await app.inject('/');
  assert.doesNotMatch(home.body, /googlesyndication/);
  assert.doesNotMatch(home.headers['content-security-policy'], /googlesyndication/);
  assert.equal((await app.inject('/ads.txt')).statusCode, 404);
  assert.doesNotMatch((await app.inject('/tools/meta-tag-checker')).body, /data-ad-placement/);
  await app.close();
});

test('AdSense: script, CSP, ads.txt and report banner when configured', async () => {
  const app = await makeApp({ config: { adsense: { client: 'ca-pub-1234567890123456', reportSlot: '9876543210' } } });
  const home = await app.inject('/');
  assert.match(home.body, /<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234567890123456"/);
  assert.match(home.headers['content-security-policy'], /script-src 'self' https:\/\/pagead2\.googlesyndication\.com/);
  const ads = await app.inject('/ads.txt');
  assert.equal(ads.body, 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
  const { id } = await runAuditViaApi(app);
  const page = await app.inject(`/r/${id}`);
  assert.match(page.body, /"ads":\{"client":"ca-pub-1234567890123456","reportSlot":"9876543210"/);
  const tool = await app.inject('/tools/meta-tag-checker');
  assert.match(tool.body, /data-ad-placement="tool"/);
  await app.close();
});

test('Search Console verification tag is on every page when configured', async () => {
  const app = await makeApp({ config: { googleSiteVerification: 'fNjVqyjB8GHfwjI-3BhX8GqGn4vTqUeeVGNoQnANeFA' } });
  for (const url of ['/', '/fr/', '/tools/', '/pricing']) {
    assert.match((await app.inject(url)).body, /<meta name="google-site-verification" content="fNjVqyjB8GHfwjI-3BhX8GqGn4vTqUeeVGNoQnANeFA" \/>/);
  }
  await app.close();
});

test('pages on the Render URL redirect to the custom domain, API calls do not', async () => {
  const app = await makeApp({ config: { publicBaseUrl: 'https://auditeur-seo.fr' } });
  const onrender = { host: 'nig-seo-auditor.onrender.com' };
  const page = await app.inject({ url: '/fr/?x=1', headers: onrender });
  assert.equal(page.statusCode, 301);
  assert.equal(page.headers.location, 'https://auditeur-seo.fr/fr/?x=1');
  assert.equal((await app.inject({ url: '/api/health', headers: onrender })).statusCode, 200);
  assert.equal((await app.inject({ url: '/', headers: { host: 'auditeur-seo.fr' } })).statusCode, 200);
  await app.close();
});

test('legal pages name the publisher and host, with no placeholder left', async () => {
  const app = await makeApp({ config: { contactEmail: 'contact@auditeur-seo.fr' } });
  const fr = (await app.inject('/fr/mentions-legales')).body;
  assert.match(fr, /Mathis Nigard/);
  assert.match(fr, /Render Networks, 525 3rd St/);
  assert.match(fr, /mailto:contact@auditeur-seo\.fr/);
  for (const url of ['/legal', '/fr/mentions-legales', '/privacy', '/fr/confidentialite', '/terms', '/fr/conditions']) {
    const main = (await app.inject(url)).body.split('<main')[1] ?? '';
    assert.doesNotMatch(main, /\[[^\]]*\]|Brouillon|Draft:/, url);
  }
  await app.close();
});

test('first visit: French browsers go to /fr/, choice is kept in a cookie', async () => {
  const app = await makeApp();
  const fr = await app.inject({ url: '/', headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' } });
  assert.equal(fr.statusCode, 302);
  assert.equal(fr.headers.location, '/fr/');
  assert.match(fr.headers['set-cookie'], /^lang=fr; Path=\/; Max-Age=31536000; SameSite=Lax/);

  const en = await app.inject({ url: '/', headers: { 'accept-language': 'de-DE,en;q=0.5' } });
  assert.equal(en.statusCode, 200);
  assert.match(en.headers['set-cookie'], /^lang=en/);

  // Search engines send no Accept-Language: English page, no cookie, no redirect.
  const bot = await app.inject('/');
  assert.equal(bot.statusCode, 200);
  assert.equal(bot.headers['set-cookie'], undefined);

  // The cookie wins over the browser language.
  assert.equal((await app.inject({ url: '/', headers: { 'accept-language': 'fr', cookie: 'lang=en' } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/', headers: { cookie: 'lang=fr' } })).headers.location, '/fr/');

  // The EN/FR switch stores the choice and lands on the clean URL.
  const sw = await app.inject({ url: '/pricing?lang=en', headers: { cookie: 'lang=fr' } });
  assert.equal(sw.statusCode, 302);
  assert.equal(sw.headers.location, '/pricing');
  assert.match(sw.headers['set-cookie'], /^lang=en/);
  await app.close();
});

test('rebranded as Auditeur SEO, no AI wording on public pages', async () => {
  const app = await makeApp();
  for (const url of ['/', '/fr/', '/pricing', '/fr/tarifs', '/how-scoring-works', '/tools/']) {
    // The GitHub repository keeps its name; only the visible brand changes.
    const body = (await app.inject(url)).body.replaceAll('mxthis971/AI-Website-Auditor', '');
    assert.match(body, /Auditeur SEO/, url);
    assert.doesNotMatch(body, /AI Website Auditor|\bAI\b|\bIA\b/, url);
  }
  await app.close();
});

test('every page in the sitemap exists, with a French version linked by hreflang', async () => {
  const app = await makeApp();
  const urls = [...(await app.inject('/sitemap.xml')).body.matchAll(/<loc>http:\/\/localhost:3000([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.length >= 30);
  for (const url of urls) {
    const res = await app.inject(url);
    assert.equal(res.statusCode, 200, url);
    const fr = url.startsWith('/fr/');
    assert.match(res.body, new RegExp(`<html lang="${fr ? 'fr' : 'en'}">`), url);
    assert.match(res.body, /hreflang="fr"/, url);
  }
  const tool = (await app.inject('/fr/outils/verificateur-balises-meta')).body;
  assert.match(tool, /<h1>Vérificateur de balises meta gratuit<\/h1>/);
  assert.match(tool, /<button type="submit">Vérifier<\/button>/);
  assert.match(tool, /href="\/tools\/meta-tag-checker\?lang=en"/);
  assert.equal((await app.inject('/fr/outils/inconnu')).statusCode, 404);
  assert.match((await app.inject('/fr/nimporte-quoi')).body, /Page introuvable/);
  await app.close();
});

test('Stripe test keys on the public site: checkout only for the browser with the secret link', async () => {
  const token = 'preview-token-abcdefghijklmnop';
  const fetchImpl = async () => ({ ok: true, json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1' }) });
  const app = await makeApp({ config: { publicBaseUrl: 'https://auditeur-seo.fr', payments: { ...paymentConfig.payments, testPreviewToken: token } }, fetchImpl });
  const { id } = await runAuditViaApi(app);

  // Ordinary visitor: free beta, no checkout.
  assert.equal((await app.inject(`/api/reports/${id}`)).json().full, true);
  assert.equal((await app.inject({ method: 'POST', url: `/api/reports/${id}/checkout`, payload: {} })).statusCode, 501);
  assert.equal((await app.inject('/stripe-test?token=wrong-token-abcdefghijklmn')).statusCode, 404);

  // Secret link sets an HttpOnly cookie; that browser sees the paid flow.
  const link = await app.inject(`/stripe-test?token=${token}`);
  assert.equal(link.statusCode, 302);
  assert.match(link.headers['set-cookie'], /stripe_test=.+HttpOnly/);
  const cookie = `stripe_test=${token}`;
  assert.equal((await app.inject({ url: `/api/reports/${id}`, headers: { cookie } })).json().full, false);
  const checkout = await app.inject({ method: 'POST', url: `/api/reports/${id}/checkout`, payload: {}, headers: { cookie } });
  assert.match(checkout.json().checkoutUrl, /checkout\.stripe\.com/);
  assert.match((await app.inject('/stripe-test?off=1')).headers['set-cookie'], /Max-Age=0/);
  await app.close();
});

test('without a preview token, the secret link does not exist', async () => {
  const app = await makeApp({ config: { publicBaseUrl: 'https://auditeur-seo.fr', ...paymentConfig } });
  assert.equal((await app.inject('/stripe-test?token=anything-abcdefghijklmnopq')).statusCode, 404);
  await app.close();
});

test('paid report: deep crawl, then re-checks compared with the previous run', async () => {
  let paidId;
  const fetchImpl = async (url) => {
    if (String(url).includes('/checkout/sessions/cs_paid')) return { ok: true, json: async () => ({ id: 'cs_paid', payment_status: 'paid', metadata: { report_id: paidId } }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const app = await makeApp({ config: { ...paymentConfig, deepCrawler: { maxPages: 8 }, recheck: { days: 30, max: 2 } }, fetchImpl });
  const { id } = await runAuditViaApi(app);
  paidId = id;
  const before = (await app.inject(`/api/reports/${id}`)).json();
  assert.equal(before.deep, false);

  const { accessKey } = (await app.inject({ method: 'POST', url: `/api/reports/${id}/claim`, payload: { sessionId: 'cs_paid' } })).json();
  await app.queue.idle();
  const deep = (await app.inject(`/api/reports/${id}?key=${accessKey}`)).json();
  assert.equal(deep.deep, true);
  assert.ok(deep.stats.pagesCrawled > before.stats.pagesCrawled, 'deep crawl explores more pages');
  assert.deepEqual([deep.recheck.available, deep.recheck.remaining], [true, 2]);
  assert.equal(deep.comparison, null);

  // Wrong key: no re-check.
  assert.equal((await app.inject({ method: 'POST', url: `/api/reports/${id}/recheck`, payload: { key: 'nope' } })).statusCode, 403);

  const r1 = await app.inject({ method: 'POST', url: `/api/reports/${id}/recheck`, payload: { key: accessKey, lang: 'fr' } });
  assert.equal(r1.statusCode, 202);
  await app.queue.idle();
  const second = (await app.inject(`/api/reports/${r1.json().id}?key=${accessKey}&lang=fr`)).json();
  assert.equal(second.full, true, 'the same access key opens the re-check');
  assert.equal(second.comparison.previousId, id);
  assert.equal(second.comparison.score.before, deep.score.overall);
  assert.ok(Array.isArray(second.comparison.fixed) && Array.isArray(second.comparison.added));
  assert.equal(second.recheck.remaining, 1);

  // A re-check from the re-check counts against the same purchase.
  assert.equal((await app.inject({ method: 'POST', url: `/api/reports/${r1.json().id}/recheck`, payload: { key: accessKey } })).statusCode, 202);
  await app.queue.idle();
  assert.equal((await app.inject({ method: 'POST', url: `/api/reports/${id}/recheck`, payload: { key: accessKey } })).json().error.code, 'no_recheck_left');
  await app.close();
});

test('a failed deep crawl keeps the results the buyer already has', async () => {
  const store = new Store(':memory:');
  const { id } = await store.createReport({ url: 'https://example.com/', lang: 'en' });
  await store.saveResult(id, { durationMs: 1, stats: { pagesCrawled: 3 }, score: { overall: 70 } });
  await store.markPaid(id, 'cs_x');
  assert.equal(await store.startDeep(id), true);
  assert.equal(await store.startDeep(id), false, 'only one deep crawl per payment');
  await store.setStatus(id, 'running', {});
  assert.equal(await store.restoreDone(id), true);
  assert.equal((await store.getReport(id)).status, 'done');
  // Same after a restart in the middle of a deep crawl.
  await store.setStatus(id, 'running', {});
  await store.failStaleJobs();
  const r = await store.getReport(id);
  assert.equal(r.status, 'done');
  assert.equal(r.data.score.overall, 70);
});
