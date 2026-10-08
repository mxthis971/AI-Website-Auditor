// Deterministic rules. Each rule looks at crawl data and returns
// "failed" (with the affected URLs) or "passed". No AI here: everything is
// measurable and reproducible. Human-readable texts live in catalog.js.

import { siteKey } from './page.js';

export const LIMITS = {
  titleMin: 15,
  titleMax: 60,
  descriptionMin: 50,
  descriptionMax: 160,
  ttfbWarnMs: 800,
  ttfbCriticalMs: 1800,
  heavyImageBytes: 300 * 1024,
  legacyImageBytes: 100 * 1024,
  pageWeightBytes: 3 * 1024 * 1024,
  htmlMaxBytes: 300 * 1024,
  thinContentWords: 200,
  maxRequests: 50,
};

const MAX_AFFECTED = 25;

function htmlPages(site) {
  return site.pages.filter((p) => p.facts);
}

/** Helper for rules evaluated on every HTML page. */
function perPage(id, site, predicate) {
  const pages = htmlPages(site);
  const affected = [];
  for (const page of pages) {
    const detail = predicate(page.facts, page);
    if (detail) affected.push({ url: page.finalUrl, detail: detail === true ? null : String(detail).slice(0, 300) });
  }
  return {
    id,
    failed: affected.length > 0,
    affected: affected.slice(0, MAX_AFFECTED),
    count: affected.length,
    ratio: pages.length ? affected.length / pages.length : 0,
    scope: 'page',
  };
}

function siteRule(id, failed, extra = {}) {
  return { id, failed: Boolean(failed), affected: [], count: failed ? 1 : 0, ratio: failed ? 1 : 0, scope: 'site', ...extra };
}

function duplicates(site, getter) {
  const map = new Map();
  for (const page of htmlPages(site)) {
    const value = getter(page.facts);
    if (!value) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(page.finalUrl);
  }
  return [...map.entries()].filter(([, urls]) => urls.length > 1);
}

const VALID_HREFLANG = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;

export function runChecks(site, { pagespeed = null } = {}) {
  const pages = htmlPages(site);
  const home = site.pages[0];
  const hf = home?.facts || {};
  const isHttps = site.finalUrl.startsWith('https:');
  const results = [];
  const add = (r) => results.push(r);

  // ------------------------------------------------------------------ SEO
  add(perPage('title-missing', site, (f) => !f.title));
  add(
    perPage('title-length', site, (f) =>
      f.title && (f.title.length < LIMITS.titleMin || f.title.length > LIMITS.titleMax) ? `${f.title.length} chars: "${f.title}"` : false,
    ),
  );
  const dupTitles = duplicates(site, (f) => f.title);
  add({ ...siteRule('title-duplicate', dupTitles.length), count: dupTitles.length, affected: dupTitles.slice(0, MAX_AFFECTED).map(([t, urls]) => ({ url: urls[0], detail: `"${t}" used on ${urls.length} pages: ${urls.slice(0, 5).join(', ')}` })) });
  add(perPage('meta-description-missing', site, (f) => !f.description));
  add(
    perPage('meta-description-length', site, (f) =>
      f.description && (f.description.length < LIMITS.descriptionMin || f.description.length > LIMITS.descriptionMax)
        ? `${f.description.length} chars`
        : false,
    ),
  );
  const dupDesc = duplicates(site, (f) => f.description);
  add({ ...siteRule('meta-description-duplicate', dupDesc.length), count: dupDesc.length, affected: dupDesc.slice(0, MAX_AFFECTED).map(([d, urls]) => ({ url: urls[0], detail: `Same description on ${urls.length} pages: "${d.slice(0, 80)}…"` })) });
  add(perPage('h1-missing', site, (f) => !f.headings.some((h) => h.level === 1)));
  add(
    perPage('h1-multiple', site, (f) => {
      const h1 = f.headings.filter((h) => h.level === 1);
      return h1.length > 1 ? `${h1.length} H1: ${h1.map((h) => `"${h.text}"`).join(', ')}` : false;
    }),
  );
  add(perPage('h2-missing', site, (f) => f.wordCount > 150 && !f.headings.some((h) => h.level === 2)));
  add(perPage('canonical-missing', site, (f) => f.canonicals.length === 0));
  add(perPage('canonical-multiple', site, (f) => (f.canonicals.length > 1 ? f.canonicals.join(', ') : false)));

  const noindex = perPage('page-noindex', site, (f, p) => {
    const header = (p.headers['x-robots-tag'] || '').toLowerCase();
    return (f.metaRobots || '').includes('noindex') || header.includes('noindex') ? 'noindex' : false;
  });
  if (noindex.failed && noindex.affected.some((a) => a.url === home.finalUrl)) noindex.severity = 'critical';
  add(noindex);

  add(siteRule('robots-txt-missing', !site.robots.found));
  add(siteRule('robots-txt-blocks-all', site.robots.found && site.robots.disallowsEverything));
  add(siteRule('sitemap-missing', !site.sitemap.found));
  add(siteRule('sitemap-invalid', site.sitemap.found && !site.sitemap.valid, { affected: site.sitemap.url ? [{ url: site.sitemap.url, detail: null }] : [] }));
  add(siteRule('sitemap-not-in-robots', site.robots.found && site.sitemap.found && site.robots.sitemaps.length === 0));
  add({ ...siteRule('pages-blocked-by-robots', site.robots.blockedPages.length > 0), count: site.robots.blockedPages.length, affected: site.robots.blockedPages.map((url) => ({ url, detail: null })), severityHint: 'info' });

  const brokenInternal = site.linkChecks.filter((l) => l.internal && ((l.status && l.status >= 400) || (l.error && !['skipped', 'private_address'].includes(l.error))));
  add({ ...siteRule('broken-internal-links', brokenInternal.length), count: brokenInternal.length, affected: brokenInternal.slice(0, MAX_AFFECTED).map((l) => ({ url: l.url, detail: `${l.status ? `HTTP ${l.status}` : l.error} — linked from ${l.foundOn}` })) });
  add(siteRule('internal-links-few', hf.links && hf.links.filter((l) => l.internal).length < 3, { values: { count: hf.links ? hf.links.filter((l) => l.internal).length : 0 } }));

  const hreflangPages = pages.filter((p) => p.facts.hreflangs.length);
  if (hreflangPages.length) {
    add(
      perPage('hreflang-invalid', site, (f) => {
        const bad = f.hreflangs.filter((h) => !VALID_HREFLANG.test(h.lang || '') || !h.href).map((h) => h.lang || '(empty)');
        return bad.length ? `Invalid codes: ${bad.join(', ')}` : false;
      }),
    );
    add(perPage('hreflang-no-x-default', site, (f) => f.hreflangs.length > 0 && !f.hreflangs.some((h) => (h.lang || '').toLowerCase() === 'x-default')));
  }

  // ------------------------------------------------------------ Technical
  add(siteRule('https-missing', !isHttps, { affected: isHttps ? [] : [{ url: site.finalUrl, detail: null }] }));
  add(siteRule('https-certificate-error', site.httpsError === 'tls_error'));
  add(siteRule('http-not-redirected', isHttps && site.httpsRedirect.checked && site.httpsRedirect.redirectsToHttps === false));
  add(perPage('mixed-content', site, (f) => (f.mixedContent.length ? f.mixedContent.slice(0, 5).join(', ') : false)));
  const errorPages = site.pages.filter((p) => p.error || (p.status && p.status >= 400));
  add({ ...siteRule('page-errors', errorPages.length), count: errorPages.length, affected: errorPages.slice(0, MAX_AFFECTED).map((p) => ({ url: p.url, detail: p.error ? p.error.message : `HTTP ${p.status}` })) });
  const chains = [
    ...site.pages.filter((p) => p.redirects.length > 1).map((p) => ({ url: p.url, hops: p.redirects.length })),
    ...site.linkChecks.filter((l) => l.redirects > 1).map((l) => ({ url: l.url, hops: l.redirects })),
  ];
  add({ ...siteRule('redirect-chains', chains.length), count: chains.length, affected: chains.slice(0, MAX_AFFECTED).map((c) => ({ url: c.url, detail: `${c.hops} redirects` })) });
  add(perPage('html-too-large', site, (_f, p) => (p.htmlBytes > LIMITS.htmlMaxBytes ? `${Math.round(p.htmlBytes / 1024)} KB` : false)));
  add(perPage('viewport-missing', site, (f) => !f.viewport));
  add(perPage('charset-missing', site, (f, p) => !f.charset && !/charset=/i.test(p.headers['content-type'] || '')));
  add(siteRule('favicon-missing', home.facts && !hf.favicon));
  add(
    perPage('open-graph-missing', site, (f) => {
      const missing = ['title', 'description', 'image'].filter((k) => !f.og[k]).map((k) => `og:${k}`);
      return missing.length ? `Missing: ${missing.join(', ')}` : false;
    }),
  );
  add(siteRule('twitter-card-missing', home.facts && !hf.twitterCard));
  add(siteRule('structured-data-missing', pages.length > 0 && !pages.some((p) => p.facts.jsonLd.some((j) => j.valid) || p.facts.microdata)));
  add(perPage('structured-data-invalid', site, (f) => (f.jsonLd.some((j) => !j.valid) ? f.jsonLd.find((j) => !j.valid).error : false)));
  add(siteRule('hsts-missing', isHttps && home && !home.headers['strict-transport-security']));
  const brokenExternal = site.linkChecks.filter((l) => !l.internal && l.status && [404, 410].includes(l.status));
  add({ ...siteRule('broken-external-links', brokenExternal.length), count: brokenExternal.length, affected: brokenExternal.slice(0, MAX_AFFECTED).map((l) => ({ url: l.url, detail: `HTTP ${l.status} — linked from ${l.foundOn}` })) });
  const brokenAssets = site.assets.filter((a) => a.status && a.status >= 400);
  add({ ...siteRule('broken-resources', brokenAssets.length), count: brokenAssets.length, affected: brokenAssets.map((a) => ({ url: a.url, detail: `${a.type}: HTTP ${a.status}` })) });

  // ---------------------------------------------------------- Performance
  const ttfb = home?.ttfbMs ?? 0;
  const slow = siteRule('slow-server-response', ttfb > LIMITS.ttfbWarnMs, { values: { ms: ttfb }, affected: ttfb > LIMITS.ttfbWarnMs ? [{ url: home.finalUrl, detail: `${ttfb} ms` }] : [] });
  if (ttfb > LIMITS.ttfbCriticalMs) slow.severity = 'critical';
  add(slow);

  const images = site.assets.filter((a) => a.type === 'image' && a.bytes);
  const heavy = images.filter((a) => a.bytes > LIMITS.heavyImageBytes).sort((a, b) => b.bytes - a.bytes);
  add({ ...siteRule('heavy-images', heavy.length), count: heavy.length, values: { count: heavy.length, kb: Math.round(LIMITS.heavyImageBytes / 1024) }, affected: heavy.map((a) => ({ url: a.url, detail: `${Math.round(a.bytes / 1024)} KB` })) });
  const legacy = images.filter((a) => a.bytes > LIMITS.legacyImageBytes && /image\/(jpe?g|png|gif|bmp)/i.test(a.contentType || ''));
  add({ ...siteRule('legacy-image-formats', legacy.length), count: legacy.length, affected: legacy.map((a) => ({ url: a.url, detail: `${a.contentType}, ${Math.round(a.bytes / 1024)} KB` })) });

  const totalBytes = (home?.transferBytes || 0) + site.assets.reduce((s, a) => s + (a.bytes || 0), 0);
  add(siteRule('page-weight-high', totalBytes > LIMITS.pageWeightBytes, { values: { mb: (totalBytes / 1048576).toFixed(1) } }));

  const uncompressed = [];
  if (home && home.htmlBytes > 2048 && !home.headers['content-encoding']) uncompressed.push({ url: home.finalUrl, detail: 'HTML' });
  for (const a of site.assets) {
    if ((a.type === 'script' || a.type === 'stylesheet') && a.bytes > 2048 && !a.encoding) uncompressed.push({ url: a.url, detail: a.type });
  }
  add({ ...siteRule('compression-missing', uncompressed.length), count: uncompressed.length, affected: uncompressed });

  const blocking = (hf.scripts || []).filter((s) => s.inHead && !s.async && !s.defer && !s.module);
  add({ ...siteRule('render-blocking-scripts', blocking.length), count: blocking.length, affected: blocking.map((s) => ({ url: s.src, detail: null })) });
  const requestCount = (hf.scripts?.length || 0) + (hf.stylesheets?.length || 0) + (hf.images?.length || 0);
  add(siteRule('too-many-requests', requestCount > LIMITS.maxRequests, { values: { count: requestCount } }));
  add(perPage('images-no-dimensions', site, (f) => {
    const n = f.images.filter((i) => !i.width || !i.height).length;
    return n >= 3 ? `${n} images without width/height` : false;
  }));
  add(siteRule('images-no-lazy-loading', (hf.images?.length || 0) > 5 && !hf.images.some((i) => i.loading === 'lazy'), { values: { count: hf.images?.length || 0 } }));
  const noCache = site.assets.filter((a) => a.status && a.status < 400 && !/max-age=\d{3,}|immutable/i.test(a.cacheControl || ''));
  add({ ...siteRule('cache-headers-missing', noCache.length >= 3), count: noCache.length, affected: noCache.slice(0, MAX_AFFECTED).map((a) => ({ url: a.url, detail: a.cacheControl || 'no Cache-Control' })) });

  if (pagespeed?.metrics) {
    const poor = Object.entries(pagespeed.metrics).filter(([, m]) => m.rating === 'poor' || m.rating === 'needs-improvement');
    const cwv = siteRule('core-web-vitals-poor', poor.length, { values: { metrics: poor.map(([k, m]) => `${k.toUpperCase()} ${m.display}`).join(', ') }, affected: poor.map(([k, m]) => ({ url: site.finalUrl, detail: `${k.toUpperCase()}: ${m.display} (${m.rating})` })) });
    if (poor.some(([, m]) => m.rating === 'poor')) cwv.severity = 'critical';
    add(cwv);
  }

  // -------------------------------------------------------- Accessibility
  add(perPage('html-lang-missing', site, (f) => !f.lang));
  add(perPage('img-alt-missing', site, (f) => {
    const n = f.images.filter((i) => i.alt === null && !i.decorative).length;
    return n ? `${n} image(s) without alt` : false;
  }));
  add(perPage('form-labels-missing', site, (f) => (f.unlabeledInputs ? `${f.unlabeledInputs} field(s)` : false)));
  add(perPage('buttons-no-name', site, (f) => (f.unnamedButtons ? `${f.unnamedButtons} button(s)` : false)));
  add(perPage('links-no-text', site, (f) => (f.emptyLinks ? `${f.emptyLinks} link(s)` : false)));
  add(perPage('zoom-disabled', site, (f) => (f.zoomDisabled ? f.viewport : false)));
  add(perPage('heading-order-skipped', site, (f) => {
    for (let i = 1; i < f.headings.length; i++) {
      if (f.headings[i].level > f.headings[i - 1].level + 1) return `H${f.headings[i - 1].level} → H${f.headings[i].level}`;
    }
    return false;
  }));
  add(perPage('duplicate-ids', site, (f) => (f.duplicateIds.length ? f.duplicateIds.slice(0, 5).join(', ') : false)));
  add(perPage('iframe-no-title', site, (f) => (f.iframesWithoutTitle ? `${f.iframesWithoutTitle} iframe(s)` : false)));
  add(perPage('positive-tabindex', site, (f) => (f.positiveTabindex ? `${f.positiveTabindex} element(s)` : false)));

  // -------------------------------------------------------------- Content
  add(perPage('thin-content', site, (f) => (f.wordCount < LIMITS.thinContentWords ? `${f.wordCount} words` : false)));
  add(perPage('lorem-ipsum', site, (f) => f.hasLoremIpsum));
  const legalPattern = /privacy|confidentialit|mentions[\s-]l[ée]gales|legal|imprint|impressum|terms|cgu|cgv|datenschutz/i;
  const hasLegal = pages.some((p) => p.facts.links.some((l) => legalPattern.test(l.text) || legalPattern.test(l.href)));
  add(siteRule('legal-pages-missing', pages.length > 0 && !hasLegal));

  return results;
}

export { htmlPages, siteKey };
