// Server-side HTML layout shared by every page: fast to load (no framework,
// no build step), crawlable by search engines, with complete SEO metadata.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UI } from '../i18n/ui.js';

// Static files are cached 7 days by browsers: a short hash of their content in
// the URL makes every deploy that changes them load the new version at once.
const assetVersion = (rel) => {
  try {
    return createHash('sha256').update(readFileSync(fileURLToPath(new URL(`../../public/${rel}`, import.meta.url)))).digest('hex').slice(0, 10);
  } catch {
    return 'dev';
  }
};
const CSS_V = assetVersion('css/app.css');
const JS_V = assetVersion('js/app.js');

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// JSON embedded in HTML must not be able to close the <script> tag.
export const jsonForHtml = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

const REPO = 'https://github.com/mxthis971/AI-Website-Auditor';

const LOGO = '<svg class="logo-mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor"/><path d="M6 15.5l3.5-4 3 2.5L18 8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function layout({ config, lang = 'en', title, description, path, body, alternates = null, noindex = false, ogImage = null, jsonLd = null, pageData = null }) {
  const t = UI[lang];
  const base = config.publicBaseUrl;
  const canonical = `${base}${path}`;
  const home = lang === 'fr' ? '/fr/' : '/';
  // The EN/FR switch goes to the same page in the other language when it exists.
  const switchPath = (l) => (alternates || []).find((a) => a.lang === l)?.path || (l === 'fr' ? '/fr/' : '/');
  const legal = lang === 'fr' ? { privacy: '/fr/confidentialite', terms: '/fr/conditions', legal: '/fr/mentions-legales' } : { privacy: '/privacy', terms: '/terms', legal: '/legal' };
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${config.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}" />` : ''}
${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
${(alternates || []).map((a) => `<link rel="alternate" hreflang="${a.lang}" href="${esc(base + a.path)}">`).join('\n')}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Auditeur SEO">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage || `${base}/static/img/${lang === 'fr' ? 'og-fr' : 'og'}.png`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/static/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/css/app.css?v=${CSS_V}">
${jsonLd ? `<script type="application/ld+json">${jsonForHtml(jsonLd)}</script>` : ''}
<script type="application/json" id="page-data">${jsonForHtml({ lang, ui: t, ads: adsData(config), ...(pageData || {}) })}</script>
<script src="/static/js/app.js?v=${JS_V}" defer></script>
${config.adsense?.client ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(config.adsense.client)}" crossorigin="anonymous"></script>` : ''}
</head>
<body>
<header class="site-header">
  <div class="container nav">
    <a class="logo" href="${home}">${LOGO}<span>${esc(t.brand)}</span></a>
    <nav aria-label="Main">
      <a href="${lang === 'fr' ? '/fr/outils/' : '/tools/'}">${esc(t.nav.tools)}</a>
      <a href="${lang === 'fr' ? '/fr/tarifs' : '/pricing'}">${esc(t.nav.pricing)}</a>
      <a href="${lang === 'fr' ? '/fr/calcul-du-score' : '/how-scoring-works'}">${esc(t.nav.scoring)}</a>
      <span class="lang-switch" role="group" aria-label="Language">${['en', 'fr'].map((l) => (l === lang ? `<span aria-current="true">${l.toUpperCase()}</span>` : `<a href="${esc(switchPath(l))}?lang=${l}" hreflang="${l}" rel="nofollow">${l.toUpperCase()}</a>`)).join('')}</span>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="container footer-grid">
    <p><strong>${esc(t.brand)}</strong><br>${esc(t.tagline)}</p>
    <p><a href="${legal.privacy}">${esc(t.footer.privacy)}</a> · <a href="${legal.terms}">${esc(t.footer.terms)}</a> · <a href="${legal.legal}">${esc(t.footer.legal)}</a> · <a href="${REPO}" rel="noopener">${esc(t.footer.source)}</a></p>
  </div>
</footer>
</body>
</html>`;
}

export function auditForm(t, { tool = null, compact = false } = {}) {
  return `<form class="audit-form${compact ? ' compact' : ''}" data-tool="${esc(tool || '')}" novalidate>
  <label class="visually-hidden" for="url-input">${esc(t.tool.urlLabel)}</label>
  <input id="url-input" name="url" type="text" inputmode="url" autocomplete="url" spellcheck="false" placeholder="${esc(t.hero.placeholder)}" required>
  <button type="submit">${esc(tool ? t.tool.check : t.hero.button)}</button>
  <p class="form-error" role="alert" hidden></p>
</form>
<div class="progress" hidden aria-live="polite"><div class="spinner" aria-hidden="true"></div><p class="progress-text"></p></div>`;
}

/** What the browser needs to fill ad placements (null when AdSense is off). */
function adsData(config) {
  const a = config.adsense || {};
  return a.client ? { client: a.client, reportSlot: a.reportSlot || null, toolSlot: a.toolSlot || null } : null;
}
