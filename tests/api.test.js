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
  const full = (await app.inject(`/api/reports/${id}?key=${encodeURIComponent(claim.accessKey)}`)).json();
  assert.equal(full.full, true);
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
  assert.equal(app.store.getReport(id).paid, true);
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
  assert.equal(app.store.counters().interest_pro, 1);
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
  const { id } = store.createReport({ url: 'https://example.com/', lang: 'en' });
  store.setStatus(id, 'running', { phase: 'crawling' });
  const app = await buildApp({ config: makeConfig(), store, logger: false, aiClient: null });
  assert.equal(store.getReport(id).status, 'failed');
  await app.close();
});
