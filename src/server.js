// HTTP server: JSON API + server-rendered pages + static assets.
// buildApp() is exported so tests can call routes with app.inject() without
// opening a network port.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';

import { loadConfig, paymentsEnabled } from './config.js';
import { Store, safeEqualHash } from './storage/db.js';
import { AuditQueue } from './jobs.js';
import { parseAuditUrl, UnsafeUrlError } from './security/url-guard.js';
import { buildView } from './report/view.js';
import { runAudit } from './audit.js';
import { friendlyError } from './crawler/crawler.js';
import { createAiClient, generateAiSummary } from './ai/summary.js';
import { createCheckoutSession, retrieveCheckoutSession, verifyWebhookSignature } from './payments/stripe.js';
import { TOOLS } from './web/tools.js';
import { describe } from './analyzer/catalog.js';
import { registerPages } from './web/routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ID_RE = /^[A-Za-z0-9]{8,32}$/;

export async function buildApp({ config = loadConfig(), store, resolver, aiClient, fetchImpl, logger } = {}) {
  const app = Fastify({
    trustProxy: true, // behind the hosting provider's load balancer
    bodyLimit: 32 * 1024,
    logger: logger ?? {
      level: config.logLevel,
      // Data minimisation: never log IP addresses or full headers.
      serializers: { req: (req) => ({ method: req.method, url: req.url.split('?')[0] }) },
    },
  });

  store ??= new Store(config.databasePath);
  const stale = store.failStaleJobs();
  if (stale) app.log.warn({ count: stale }, 'marked interrupted audits as failed');
  const queue = new AuditQueue({ store, config, log: app.log, resolver });
  const ai = aiClient === undefined ? createAiClient(config) : aiClient;
  const payments = paymentsEnabled(config);
  const started = Date.now();
  let toolsRunning = 0;

  app.decorate('store', store);
  app.decorate('queue', queue);
  app.decorate('appConfig', config);

  await app.register(rateLimit, { global: false, keyGenerator: (req) => req.ip });

  // AdSense needs Google's ad domains; they are only allowed when AdSense is configured.
  const ads = config.adsense?.client
    ? ' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google'
    : '';
  const csp = `default-src 'self'; img-src 'self' https: data:; style-src 'self'${ads ? " 'unsafe-inline'" : ''}; script-src 'self'${ads}; connect-src 'self'${ads}; frame-src${ads || " 'none'"}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com`;

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('x-frame-options', 'DENY');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('content-security-policy', csp);
    return payload;
  });

  await app.register(fastifyStatic, {
    root: path.join(here, '..', 'public'),
    prefix: '/static/',
    maxAge: '7d',
  });

  // ---------------------------------------------------------------- API
  app.get('/api/health', async () => ({ ok: true, uptimeSec: Math.round((Date.now() - started) / 1000) }));

  app.get('/api/config', async () => ({
    paymentsEnabled: payments,
    aiEnabled: Boolean(ai),
    pagespeedEnabled: Boolean(config.pagespeed.apiKey),
    limits: { maxPages: config.crawler.maxPages, maxDepth: config.crawler.maxDepth },
  }));

  app.post(
    '/api/audits',
    { config: { rateLimit: { max: config.limits.auditsPerIpPerHour, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const { url, lang } = req.body || {};
      let normalised;
      try {
        normalised = parseAuditUrl(url, { allowPrivateNetworks: config.crawler.allowPrivateNetworks });
      } catch (err) {
        if (err instanceof UnsafeUrlError) return reply.code(400).send({ error: { code: err.code, message: err.message } });
        throw err;
      }
      if (queue.isFull()) {
        return reply.code(503).send({ error: { code: 'busy', message: 'Too many audits are running right now. Please try again in a minute.' } });
      }
      const { id, ownerKey } = store.createReport({ url: normalised.href, lang: lang === 'fr' ? 'fr' : 'en' });
      queue.enqueue(id, normalised.href);
      store.increment('audits_requested');
      return reply.code(202).send({ id, ownerKey, status: 'queued', reportUrl: `/r/${id}` });
    },
  );

  app.get('/api/audits/:id', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    const report = ID_RE.test(req.params.id) ? store.getReport(req.params.id) : null;
    if (!report) return reply.code(404).send({ error: { code: 'not_found', message: 'Audit not found.' } });
    return { id: report.id, url: report.url, status: report.status, progress: report.progress, error: report.error, score: report.data?.score.overall ?? null };
  });

  const loadReport = (req, reply) => {
    const report = ID_RE.test(req.params.id) ? store.getReport(req.params.id) : null;
    if (!report || report.status !== 'done') {
      reply.code(404).send({ error: { code: 'not_found', message: 'Report not found or not ready yet.' } });
      return null;
    }
    return report;
  };
  const hasFullAccess = (report, key) => !payments || (report.paid && safeEqualHash(key, report.accessKeyHash));

  app.get('/api/reports/:id', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const report = loadReport(req, reply);
    if (!report) return;
    const lang = req.query.lang === 'fr' ? 'fr' : req.query.lang === 'en' ? 'en' : report.lang;
    const full = hasFullAccess(report, req.query.key || req.headers['x-access-key']);
    const aiForLang = report.ai?.[lang] || null;
    return { id: report.id, paymentsEnabled: payments, aiEnabled: Boolean(ai), ...buildView(report.data, { lang, full, ai: aiForLang }) };
  });

  app.post('/api/reports/:id/ai-summary', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const report = loadReport(req, reply);
    if (!report) return;
    if (!ai) return reply.code(501).send({ error: { code: 'ai_disabled', message: 'AI explanations are not configured on this server.' } });
    if (!hasFullAccess(report, req.body?.key)) return reply.code(402).send({ error: { code: 'payment_required', message: 'The AI action plan is part of the full report.' } });
    const lang = req.body?.lang === 'fr' ? 'fr' : 'en';
    if (report.ai?.[lang]) return report.ai[lang];
    try {
      const summary = await generateAiSummary(report.data, { client: ai, model: config.ai.model, lang });
      store.saveAi(report.id, { ...(report.ai || {}), [lang]: summary });
      store.increment('ai_summaries');
      return summary;
    } catch (err) {
      req.log.error({ err: err.message }, 'ai summary failed');
      return reply.code(502).send({ error: { code: 'ai_failed', message: 'The AI summary could not be generated. Please try again later.' } });
    }
  });

  app.delete('/api/reports/:id', async (req, reply) => {
    const report = ID_RE.test(req.params.id) ? store.getReport(req.params.id) : null;
    if (!report) return reply.code(404).send({ error: { code: 'not_found', message: 'Report not found.' } });
    if (!safeEqualHash(req.headers['x-owner-key'], report.ownerKeyHash)) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Only the person who ran this audit can delete it.' } });
    }
    store.deleteReport(report.id);
    return { deleted: true };
  });

  // ------------------------------------------------------------ Payments
  app.post('/api/reports/:id/checkout', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const report = loadReport(req, reply);
    if (!report) return;
    store.increment('checkout_clicks');
    if (!payments) return reply.code(501).send({ error: { code: 'payments_disabled', message: 'Payments are not enabled yet.' } });
    const session = await createCheckoutSession({
      secretKey: config.payments.stripeSecretKey,
      priceId: config.payments.reportPriceId,
      reportId: report.id,
      baseUrl: config.publicBaseUrl,
      lang: req.body?.lang,
      fetchImpl,
    });
    return { checkoutUrl: session.url };
  });

  app.post('/api/reports/:id/claim', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const report = loadReport(req, reply);
    if (!report) return;
    if (!payments) return reply.code(501).send({ error: { code: 'payments_disabled', message: 'Payments are not enabled.' } });
    let session;
    try {
      session = await retrieveCheckoutSession({ secretKey: config.payments.stripeSecretKey, sessionId: String(req.body?.sessionId || ''), fetchImpl });
    } catch {
      return reply.code(400).send({ error: { code: 'invalid_session', message: 'Payment session not found.' } });
    }
    if (session.payment_status !== 'paid' || session.metadata?.report_id !== report.id) {
      return reply.code(402).send({ error: { code: 'not_paid', message: 'This payment is not completed for this report.' } });
    }
    const accessKey = store.markPaid(report.id, session.id);
    return { accessKey };
  });

  await app.register(async (scope) => {
    // Stripe signs the exact raw bytes, so this route needs the unparsed body.
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => done(null, body));
    scope.post('/api/stripe/webhook', async (req, reply) => {
      if (!payments) return reply.code(501).send({ error: 'payments_disabled' });
      if (!verifyWebhookSignature(req.body, req.headers['stripe-signature'], config.payments.stripeWebhookSecret)) {
        return reply.code(400).send({ error: 'invalid_signature' });
      }
      const event = JSON.parse(req.body);
      if (event.type === 'checkout.session.completed' && event.data?.object?.payment_status === 'paid') {
        const reportId = event.data.object.metadata?.report_id;
        const report = reportId && ID_RE.test(reportId) ? store.getReport(reportId) : null;
        if (report && !report.paid) store.markPaid(report.id, event.data.object.id);
        store.increment('payments_completed');
        req.log.info({ reportId }, 'payment completed');
      }
      return { received: true };
    });
  });

  // Demand test: counts clicks on "coming soon" offers. No personal data.
  app.post('/api/interest', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const plan = ['report', 'pro'].includes(req.body?.plan) ? req.body.plan : 'other';
    store.increment(`interest_${plan}`);
    return { ok: true };
  });

  // ---------------------------------------------------------------- Tools
  app.post('/api/tools/:tool', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const tool = Object.hasOwn(TOOLS, req.params.tool) ? TOOLS[req.params.tool] : null;
    if (!tool) return reply.code(404).send({ error: { code: 'not_found', message: 'Unknown tool.' } });
    if (toolsRunning >= config.limits.maxConcurrentAudits) {
      return reply.code(503).send({ error: { code: 'busy', message: 'The server is busy. Please try again in a few seconds.' } });
    }
    const lang = req.body?.lang === 'fr' ? 'fr' : 'en';
    toolsRunning++;
    try {
      const toolConfig = { ...config, crawler: { ...config.crawler, ...tool.crawl, auditTimeoutMs: Math.min(config.crawler.auditTimeoutMs, 45_000) } };
      const report = await runAudit(req.body?.url, { config: toolConfig, resolver, log: req.log, onlyChecks: tool.checks });
      store.increment(`tool_${req.params.tool}`);
      return {
        url: report.url,
        score: report.score,
        stats: report.stats,
        homepage: report.homepage,
        issues: report.issues.map((i) => ({ ...i, ...describe(i.id, lang, i.values) })),
        passed: report.passed.map((p) => ({ ...p, label: describe(p.id, lang).label })),
      };
    } catch (err) {
      const error = friendlyError(err);
      if (error.code === 'internal_error') req.log.error({ err: err.stack }, 'tool crashed');
      return reply.code(422).send({ error });
    } finally {
      toolsRunning--;
    }
  });

  // ------------------------------------------------------------- Metrics
  app.get('/api/metrics', async (req, reply) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!config.metricsToken || token !== config.metricsToken) return reply.code(401).send({ error: 'unauthorized' });
    return {
      uptimeSec: Math.round((Date.now() - started) / 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      queue: { running: queue.running, waiting: queue.waiting.length },
      last24h: store.stats(Date.now() - 86_400_000),
      allTime: store.stats(0),
      counters: store.counters(),
    };
  });

  await registerPages(app, { config, store, payments });

  app.setErrorHandler((err, req, reply) => {
    if (err.statusCode === 429) {
      return reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many requests. Please wait a little before trying again.' } });
    }
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: { code: 'bad_request', message: err.message } });
    req.log.error({ err: err.stack }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong on our side.' } });
  });

  // Data retention: delete old free reports once a day.
  const cleanup = () => {
    const removed = store.deleteOlderThan(config.reportRetentionDays);
    if (removed) app.log.info({ removed }, 'deleted expired reports');
  };
  const timer = setInterval(cleanup, 86_400_000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
  cleanup();

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const app = await buildApp({ config });
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  await app.listen({ port: config.port, host: config.host });
}
