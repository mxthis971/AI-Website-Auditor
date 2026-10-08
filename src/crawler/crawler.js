// The crawler collects raw, objective data about a website.
// It is deliberately bounded: max pages, max depth, max time, max bytes,
// limited concurrency. A crawler without limits is a denial-of-service tool.

import { safeFetch, FetchError } from '../security/safe-fetch.js';
import { parseAuditUrl, UnsafeUrlError } from '../security/url-guard.js';
import { parsePage, normalizeUrl, looksLikeHtmlUrl, siteKey } from '../analyzer/page.js';
import { parseRobots } from './robots.js';
import { parseSitemap } from './sitemap.js';

export class AuditError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
  }
}

const FRIENDLY = {
  dns_failed: 'This domain could not be found. Check the spelling of the URL.',
  timeout: 'The website took too long to respond.',
  connection_refused: 'The website refused the connection.',
  connection_reset: 'The connection to the website was interrupted.',
  tls_error: 'The website has an invalid SSL/TLS certificate, so browsers will show a security warning.',
  too_many_redirects: 'The website redirects too many times.',
  redirect_loop: 'The website redirects in a loop.',
  bad_redirect: 'The website sent an invalid redirect.',
  private_address: 'This address points to a private or local network and cannot be audited.',
  network_error: 'A network error occurred while contacting the website.',
};

export function friendlyError(err) {
  if (err instanceof AuditError) return { code: err.code, message: err.message };
  if (err instanceof UnsafeUrlError || err instanceof FetchError) {
    return { code: err.code, message: FRIENDLY[err.code] || err.message };
  }
  return { code: 'internal_error', message: 'Unexpected error while auditing this website.' };
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const pickHeaders = (h) => ({
  'content-type': h['content-type'] || null,
  'content-encoding': h['content-encoding'] || null,
  'cache-control': h['cache-control'] || null,
  'x-robots-tag': h['x-robots-tag'] || null,
  'strict-transport-security': h['strict-transport-security'] || null,
  'x-content-type-options': h['x-content-type-options'] || null,
  'content-length': h['content-length'] || null,
});

export async function crawlSite(input, { config, onProgress = () => {}, resolver, log } = {}) {
  const c = config.crawler;
  const started = Date.now();
  const deadline = started + c.auditTimeoutMs;
  const timeLeft = () => deadline - Date.now();
  const net = { userAgent: c.userAgent, maxRedirects: c.maxRedirects, allowPrivateNetworks: c.allowPrivateNetworks, resolver };
  const fetchUrl = (url, opts = {}) =>
    safeFetch(url, { ...net, timeoutMs: Math.max(1000, Math.min(c.requestTimeoutMs, timeLeft())), maxBodyBytes: c.maxBodyBytes, ...opts });

  const startUrl = parseAuditUrl(input, { allowPrivateNetworks: c.allowPrivateNetworks });
  onProgress({ phase: 'fetching_homepage', pagesCrawled: 0 });

  // 1. Homepage. If it fails, the whole audit fails with a clear message.
  let home;
  let httpsError = null;
  try {
    home = await fetchUrl(startUrl.href);
  } catch (err) {
    // An "https://" guess may fail on HTTP-only sites: retry once over http.
    const retryable = ['connection_refused', 'connection_reset', 'tls_error'].includes(err.code);
    if (retryable && !/^https?:\/\//i.test(String(input).trim()) && startUrl.protocol === 'https:') {
      httpsError = err.code;
      const httpUrl = new URL(startUrl.href);
      httpUrl.protocol = 'http:';
      try {
        home = await fetchUrl(httpUrl.href);
      } catch {
        throw err;
      }
    } else {
      throw err;
    }
  }
  if (home.status >= 400) {
    throw new AuditError('http_error', `The website answered with HTTP ${home.status}, so the page cannot be analysed.`);
  }
  const finalUrl = new URL(home.url);
  const origin = finalUrl.origin;
  const site = siteKey(finalUrl.hostname);

  // 2. robots.txt and sitemap.xml
  onProgress({ phase: 'reading_robots_and_sitemap', pagesCrawled: 0 });
  const robots = await fetchRobots(origin, fetchUrl);
  const sitemap = await fetchSitemap(origin, robots, fetchUrl);

  // 3. Breadth-first crawl of internal pages.
  const pages = [];
  const queued = new Set([home.url]);
  const queue = [];
  const blockedByRobots = [];
  const addPage = (url, response, depth, error = null) => {
    const contentType = response?.headers?.['content-type'] || '';
    const isHtml = /html/i.test(contentType) || (!contentType && response?.text?.includes('<html'));
    const page = {
      url,
      finalUrl: response?.url || url,
      depth,
      status: response?.status ?? null,
      redirects: response?.redirects || [],
      ttfbMs: response?.ttfbMs ?? null,
      transferBytes: response?.transferBytes ?? null,
      htmlBytes: response?.body?.length ?? null,
      truncated: response?.truncated || false,
      headers: response ? pickHeaders(response.headers) : {},
      isHtml,
      error,
      facts: null,
    };
    if (response && isHtml && response.status < 400) {
      try {
        page.facts = parsePage(response.text, page.finalUrl);
      } catch (err) {
        log?.warn({ err: err.message, url }, 'parse failed');
      }
    }
    pages.push(page);
    if (page.facts && depth < c.maxDepth) {
      for (const link of page.facts.links) {
        if (!link.internal || queued.has(link.href) || !looksLikeHtmlUrl(link.href)) continue;
        const u = new URL(link.href);
        if (siteKey(u.hostname) !== site) continue;
        queued.add(link.href);
        if (robots.parsed && !robots.parsed.isAllowed(u.pathname + u.search)) {
          blockedByRobots.push(link.href);
          continue;
        }
        queue.push({ url: link.href, depth: depth + 1 });
      }
    }
    return page;
  };

  addPage(home.url, home, 0);
  // Seed with sitemap URLs when the homepage has few internal links.
  for (const loc of sitemap.sampleUrls || []) {
    const href = normalizeUrl(loc, origin);
    if (href && !queued.has(href) && siteKey(new URL(href).hostname) === site && queue.length < c.maxPages) {
      queued.add(href);
      queue.push({ url: href, depth: 1 });
    }
  }

  let partial = false;
  while (queue.length && pages.length < c.maxPages) {
    if (timeLeft() < 2000) {
      partial = true;
      break;
    }
    const batch = queue.splice(0, Math.min(c.concurrency, c.maxPages - pages.length));
    await mapLimit(batch, c.concurrency, async ({ url, depth }) => {
      try {
        const res = await fetchUrl(url);
        addPage(url, res, depth);
      } catch (err) {
        addPage(url, null, depth, friendlyError(err));
      }
    });
    onProgress({ phase: 'crawling', pagesCrawled: pages.length, maxPages: c.maxPages });
  }

  // 4. Link checking (broken links).
  onProgress({ phase: 'checking_links', pagesCrawled: pages.length });
  const checkedUrls = new Map(pages.map((p) => [p.url, p]));
  const targets = new Map();
  for (const page of pages) {
    for (const link of page.facts?.links || []) {
      if (!targets.has(link.href)) targets.set(link.href, { url: link.href, internal: link.internal, foundOn: page.url });
    }
  }
  const linkChecks = [];
  for (const t of targets.values()) {
    const crawled = checkedUrls.get(t.url);
    if (crawled) linkChecks.push({ ...t, status: crawled.status, error: crawled.error?.code || null, method: 'crawl' });
  }
  const toCheck = [...targets.values()]
    .filter((t) => !checkedUrls.has(t.url))
    .sort((a, b) => Number(b.internal) - Number(a.internal))
    .slice(0, c.maxLinksToCheck);
  if (timeLeft() > 3000) {
    const results = await mapLimit(toCheck, c.concurrency + 2, (t) => checkUrl(t.url, fetchUrl, timeLeft));
    toCheck.forEach((t, i) => linkChecks.push({ ...t, ...results[i] }));
  } else {
    partial = true;
  }

  // 5. Homepage assets: weight of images, scripts and stylesheets.
  onProgress({ phase: 'measuring_resources', pagesCrawled: pages.length });
  const homeFacts = pages[0].facts;
  const assetList = [];
  const seenAssets = new Set();
  const pushAsset = (url, type) => {
    if (url && !seenAssets.has(url) && assetList.length < c.maxAssetsToCheck) {
      seenAssets.add(url);
      assetList.push({ url, type });
    }
  };
  for (const s of homeFacts?.stylesheets || []) pushAsset(s.href, 'stylesheet');
  for (const s of homeFacts?.scripts || []) pushAsset(s.src, 'script');
  for (const img of homeFacts?.images || []) pushAsset(img.src, 'image');
  let assets = [];
  if (timeLeft() > 3000) {
    assets = await mapLimit(assetList, c.concurrency + 2, async (a) => ({ ...a, ...(await measureAsset(a.url, fetchUrl, timeLeft)) }));
  } else {
    partial = true;
  }

  // 6. Does http:// redirect to https:// ?
  const httpsRedirect = { checked: false, redirectsToHttps: null };
  if (finalUrl.protocol === 'https:' && timeLeft() > 2000) {
    const httpUrl = new URL(origin);
    httpUrl.protocol = 'http:';
    try {
      const res = await fetchUrl(httpUrl.href, { method: 'HEAD', readBody: false });
      httpsRedirect.checked = true;
      httpsRedirect.redirectsToHttps = res.url.startsWith('https:');
    } catch {
      // Port 80 closed is fine: browsers will use https anyway.
      httpsRedirect.checked = true;
      httpsRedirect.redirectsToHttps = null;
    }
  }

  return {
    requestedUrl: String(input).trim(),
    startUrl: startUrl.href,
    finalUrl: home.url,
    origin,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    pages,
    robots: { found: robots.found, status: robots.status, sitemaps: robots.parsed?.sitemaps || [], disallowsEverything: robots.parsed?.disallowsEverything || false, blockedPages: blockedByRobots.slice(0, 20), error: robots.error },
    sitemap: { found: sitemap.found, url: sitemap.url, status: sitemap.status, valid: sitemap.valid, type: sitemap.type, urlCount: sitemap.urlCount, error: sitemap.error },
    httpsRedirect,
    httpsError,
    linkChecks,
    assets,
    partial,
    limits: { maxPages: c.maxPages, maxDepth: c.maxDepth, maxLinksToCheck: c.maxLinksToCheck },
  };
}

async function fetchRobots(origin, fetchUrl) {
  try {
    const res = await fetchUrl(`${origin}/robots.txt`, { accept: 'text/plain,*/*;q=0.5', maxBodyBytes: 512 * 1024 });
    const type = res.headers['content-type'] || '';
    if (res.status >= 400 || /html/i.test(type)) return { found: false, status: res.status, parsed: null };
    return { found: true, status: res.status, parsed: parseRobots(res.text) };
  } catch (err) {
    return { found: false, status: null, parsed: null, error: err.code || 'error' };
  }
}

async function fetchSitemap(origin, robots, fetchUrl) {
  const candidates = [...(robots.parsed?.sitemaps || []), `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const tried = new Set();
  for (const candidate of candidates) {
    const href = normalizeUrl(candidate, origin);
    if (!href || tried.has(href) || tried.size >= 3) continue;
    tried.add(href);
    try {
      const res = await fetchUrl(href, { accept: 'application/xml,text/xml,*/*;q=0.5', maxBodyBytes: 5 * 1024 * 1024 });
      if (res.status >= 400) continue;
      const parsed = parseSitemap(res.text);
      if (!parsed.valid) return { found: true, url: href, status: res.status, valid: false, type: 'unknown', urlCount: 0 };
      let locs = parsed.locs;
      if (parsed.type === 'index' && locs[0]) {
        // Follow only the first child sitemap to get sample page URLs.
        try {
          const child = await fetchUrl(locs[0], { accept: 'application/xml,text/xml,*/*;q=0.5', maxBodyBytes: 5 * 1024 * 1024 });
          if (child.status < 400) locs = parseSitemap(child.text).locs;
        } catch {
          // ignore: the index itself is valid
        }
      }
      return { found: true, url: href, status: res.status, valid: true, type: parsed.type, urlCount: parsed.type === 'index' ? parsed.locs.length : locs.length, sampleUrls: locs.slice(0, 20) };
    } catch {
      // try the next candidate
    }
  }
  return { found: false, url: null, status: null, valid: false, type: null, urlCount: 0 };
}

async function checkUrl(url, fetchUrl, timeLeft) {
  if (timeLeft() < 1500) return { status: null, error: 'skipped' };
  try {
    let res = await fetchUrl(url, { method: 'HEAD', readBody: false, timeoutMs: Math.min(6000, timeLeft()) });
    if ([400, 403, 405, 501].includes(res.status)) {
      res = await fetchUrl(url, { maxBodyBytes: 64 * 1024, timeoutMs: Math.min(6000, timeLeft()) });
    }
    return { status: res.status, error: null, redirects: res.redirects.length, method: 'check' };
  } catch (err) {
    return { status: null, error: err.code || 'error', method: 'check' };
  }
}

async function measureAsset(url, fetchUrl, timeLeft) {
  if (timeLeft() < 1500) return { status: null, error: 'skipped' };
  try {
    const head = await fetchUrl(url, { method: 'HEAD', readBody: false, timeoutMs: Math.min(6000, timeLeft()) });
    let bytes = Number(head.headers['content-length']) || null;
    let status = head.status;
    let headers = head.headers;
    if (!bytes || status >= 400) {
      const res = await fetchUrl(url, { maxBodyBytes: 5 * 1024 * 1024, timeoutMs: Math.min(8000, timeLeft()) });
      status = res.status;
      headers = res.headers;
      bytes = res.transferBytes;
    }
    return {
      status,
      bytes,
      contentType: headers['content-type'] || null,
      cacheControl: headers['cache-control'] || null,
      encoding: headers['content-encoding'] || null,
      error: null,
    };
  } catch (err) {
    return { status: null, bytes: null, error: err.code || 'error' };
  }
}
