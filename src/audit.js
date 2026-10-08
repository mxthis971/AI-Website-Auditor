// The full audit pipeline:  crawl → (PageSpeed) → checks → score → report.
// Everything here is deterministic. AI explanations are added later, on
// demand, on top of this report (see src/ai/summary.js).

import { crawlSite } from './crawler/crawler.js';
import { runChecks } from './analyzer/checks.js';
import { scoreResults } from './analyzer/scoring.js';
import { runPagespeed } from './analyzer/pagespeed.js';

export const REPORT_VERSION = 1;

export async function runAudit(url, { config, onProgress = () => {}, resolver, log, onlyChecks = null } = {}) {
  // PageSpeed runs on Google's servers in parallel with our crawl.
  const pagespeedPromise = config.pagespeed.apiKey
    ? runPagespeed(String(url).trim().match(/^https?:\/\//i) ? url : `https://${String(url).trim()}`, config.pagespeed).catch((err) => {
        log?.warn({ err: err.message }, 'pagespeed failed');
        return { error: 'unavailable' };
      })
    : Promise.resolve(null);

  const site = await crawlSite(url, { config, onProgress, resolver, log });
  onProgress({ phase: 'analysing', pagesCrawled: site.pages.length });
  const pagespeed = await pagespeedPromise;

  let results = runChecks(site, { pagespeed: pagespeed?.metrics ? pagespeed : null });
  if (onlyChecks) results = results.filter((r) => onlyChecks.includes(r.id));
  const score = scoreResults(results);

  const htmlPages = site.pages.filter((p) => p.facts);
  const assetsBytes = site.assets.reduce((s, a) => s + (a.bytes || 0), 0);
  const home = site.pages[0];

  return {
    version: REPORT_VERSION,
    url: site.finalUrl,
    requestedUrl: site.requestedUrl,
    createdAt: new Date().toISOString(),
    durationMs: site.durationMs,
    partial: site.partial,
    limits: site.limits,
    score: { overall: score.overall, categories: score.categories },
    issues: score.issues,
    passed: score.passed,
    stats: {
      pagesCrawled: site.pages.length,
      htmlPages: htmlPages.length,
      linksChecked: site.linkChecks.length,
      brokenLinks: site.linkChecks.filter((l) => l.status >= 400).length,
      assetsMeasured: site.assets.length,
      homepageWeightBytes: (home.transferBytes || 0) + assetsBytes,
      ttfbMs: home.ttfbMs,
      https: site.finalUrl.startsWith('https:'),
      robotsTxt: site.robots.found,
      sitemap: site.sitemap.found ? { url: site.sitemap.url, urls: site.sitemap.urlCount, valid: site.sitemap.valid } : null,
    },
    pagespeed: pagespeed?.metrics ? pagespeed : null,
    pages: site.pages.map((p) => ({
      url: p.finalUrl,
      status: p.status,
      depth: p.depth,
      title: p.facts?.title ?? null,
      h1: p.facts?.headings.find((h) => h.level === 1)?.text ?? null,
      wordCount: p.facts?.wordCount ?? null,
      ttfbMs: p.ttfbMs,
      htmlKb: p.htmlBytes ? Math.round(p.htmlBytes / 1024) : null,
      error: p.error?.message || null,
    })),
    // Small, factual snapshot of the homepage used by tool pages and the AI layer.
    homepage: home.facts
      ? {
          title: home.facts.title,
          description: home.facts.description,
          lang: home.facts.lang,
          canonical: home.facts.canonicals[0] || null,
          headings: home.facts.headings.slice(0, 40),
          og: home.facts.og,
          twitterCard: home.facts.twitterCard,
          jsonLdTypes: home.facts.jsonLd.flatMap((j) => j.types).slice(0, 20),
          images: home.facts.images.slice(0, 60).map((i) => ({ src: i.src, alt: i.alt })),
          viewport: home.facts.viewport,
          hreflangs: home.facts.hreflangs.slice(0, 30),
        }
      : null,
  };
}
