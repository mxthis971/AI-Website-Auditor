// Central configuration. Every value can be overridden with an environment
// variable so the same code runs locally, in tests and in production.
// Secrets (API keys) are only ever read from the environment, never committed.

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

// Values pasted into a hosting dashboard often carry spaces, quotes or a final
// slash: clean them. `problem` says (without the secret) why Turso is off.
export function tursoConfig(rawUrl = '', rawToken = '') {
  const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').trim();
  const url = clean(rawUrl).replace(/\/+$/, '');
  const authToken = clean(rawToken).replace(/^Bearer\s+/i, '');
  if (!url) return { url: '', authToken: '', problem: 'TURSO_DATABASE_URL missing' };
  if (!/^(libsql|https):\/\/[\w.-]+$/.test(url)) {
    // A hint about the shape of the value, never the value itself.
    const hint = url.startsWith('eyJ') ? ': it looks like the token, the two values may be swapped'
      : url.includes('=') ? ': paste only the value, without the name and "="'
      : /\s/.test(url) ? ': it contains a space or line break'
      : !/^(libsql|https):\/\//.test(url) ? ': it must start with libsql://' : '';
    return { url: '', authToken: '', problem: `TURSO_DATABASE_URL invalid (expected libsql://name.turso.io)${hint}` };
  }
  if (!authToken) return { url: '', authToken: '', problem: 'TURSO_AUTH_TOKEN missing' };
  return { url, authToken, problem: null };
}

export function loadConfig(overrides = {}) {
  const config = {
    port: int('PORT', 3000),
    host: process.env.HOST || '0.0.0.0',
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    databasePath: process.env.DATABASE_PATH || './data/auditor.db',
    // Hosted database (Turso). When set, reports survive redeploys; DATABASE_PATH is then unused.
    turso: tursoConfig(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN),
    logLevel: process.env.LOG_LEVEL || 'info',
    // Reports older than this are deleted automatically (data minimisation).
    reportRetentionDays: int('REPORT_RETENTION_DAYS', 30),
    metricsToken: process.env.METRICS_TOKEN || '',

    // Google AdSense. Off unless ADSENSE_CLIENT (ca-pub-…) is set: no Google script is loaded without it.
    adsense: {
      client: /^ca-pub-\d{10,20}$/.test(process.env.ADSENSE_CLIENT || '') ? process.env.ADSENSE_CLIENT : '',
      reportSlot: /^\d{5,20}$/.test(process.env.ADSENSE_REPORT_SLOT || '') ? process.env.ADSENSE_REPORT_SLOT : '',
      toolSlot: /^\d{5,20}$/.test(process.env.ADSENSE_TOOL_SLOT || '') ? process.env.ADSENSE_TOOL_SLOT : '',
    },
    // Google Search Console ownership token (public value, shown in a <meta> tag).
    googleSiteVerification: /^[\w-]{20,100}$/.test(process.env.GOOGLE_SITE_VERIFICATION || '') ? process.env.GOOGLE_SITE_VERIFICATION : '',
    contactEmail: /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(process.env.CONTACT_EMAIL || '') ? process.env.CONTACT_EMAIL : '',

    crawler: {
      userAgent:
        process.env.CRAWLER_USER_AGENT ||
        'AuditeurSEOBot/0.1 (+https://auditeur-seo.fr)',
      maxPages: int('CRAWL_MAX_PAGES', 10),
      maxDepth: int('CRAWL_MAX_DEPTH', 2),
      concurrency: int('CRAWL_CONCURRENCY', 3),
      requestTimeoutMs: int('CRAWL_REQUEST_TIMEOUT_MS', 10_000),
      auditTimeoutMs: int('AUDIT_TIMEOUT_MS', 90_000),
      maxBodyBytes: int('CRAWL_MAX_BODY_BYTES', 3 * 1024 * 1024),
      maxRedirects: int('CRAWL_MAX_REDIRECTS', 5),
      maxLinksToCheck: int('CRAWL_MAX_LINKS_TO_CHECK', 60),
      maxAssetsToCheck: int('CRAWL_MAX_ASSETS_TO_CHECK', 40),
      // NEVER enable in production: allows auditing localhost / private IPs.
      // Only used by the automated tests and local development.
      allowPrivateNetworks: bool('ALLOW_PRIVATE_NETWORKS', false),
    },

    limits: {
      auditsPerIpPerHour: int('RATE_LIMIT_AUDITS_PER_HOUR', 10),
      maxConcurrentAudits: int('MAX_CONCURRENT_AUDITS', 2),
      maxQueuedAudits: int('MAX_QUEUED_AUDITS', 20),
    },

    ai: {
      // Optional. Without a key, explanations come from the built-in catalog.
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.AI_MODEL || 'claude-opus-5-5',
      timeoutMs: int('AI_TIMEOUT_MS', 60_000),
    },

    pagespeed: {
      // Optional Google PageSpeed Insights key for Lighthouse + Core Web Vitals.
      apiKey: process.env.PAGESPEED_API_KEY || '',
      timeoutMs: int('PAGESPEED_TIMEOUT_MS', 60_000),
    },

    payments: {
      stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      reportPriceId: process.env.STRIPE_REPORT_PRICE_ID || '',
      // Secret link that turns on Stripe *test* checkout for one browser only (see paymentsTestPreview).
      testPreviewToken: /^[\w-]{24,200}$/.test((process.env.STRIPE_TEST_PREVIEW_TOKEN || '').trim()) ? process.env.STRIPE_TEST_PREVIEW_TOKEN.trim() : '',
    },
  };

  return deepMerge(config, overrides);
}

function deepMerge(base, extra) {
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof base[key] === 'object') {
      base[key] = deepMerge({ ...base[key] }, value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

const isLocal = (config) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(config.publicBaseUrl || '');
const paymentsConfigured = (p) => Boolean(p.stripeSecretKey && p.stripeWebhookSecret && p.reportPriceId);

/** Checkout for every visitor. */
export function paymentsEnabled(config) {
  const p = config.payments;
  // Test keys (sk_test_) only work on a local machine: on the public site they
  // would show a fake checkout to real visitors.
  if (p.stripeSecretKey.startsWith('sk_test_') && !isLocal(config)) return false;
  return paymentsConfigured(p);
}

/**
 * Test keys on the public site: checkout is shown only to a browser that opened
 * the secret /stripe-test link. Every other visitor keeps the free beta.
 */
export function paymentsTestPreview(config) {
  const p = config.payments;
  return p.stripeSecretKey.startsWith('sk_test_') && !isLocal(config) && Boolean(p.testPreviewToken) && paymentsConfigured(p);
}
