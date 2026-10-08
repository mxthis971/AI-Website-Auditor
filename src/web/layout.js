// Server-side HTML layout shared by every page: fast to load (no framework,
// no build step), crawlable by search engines, with complete SEO metadata.

import { UI } from '../i18n/ui.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// JSON embedded in HTML must not be able to close the <script> tag.
export const jsonForHtml = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

const REPO = 'https://github.com/mxthis971/AI-Website-Auditor';

export function layout({ config, lang = 'en', title, description, path, body, alternates = null, noindex = false, ogImage = null, jsonLd = null, pageData = null }) {
  const t = UI[lang];
  const base = config.publicBaseUrl;
  const canonical = `${base}${path}`;
  const home = lang === 'fr' ? '/fr/' : '/';
  const legal = lang === 'fr' ? { privacy: '/fr/confidentialite', terms: '/fr/conditions', legal: '/fr/mentions-legales' } : { privacy: '/privacy', terms: '/terms', legal: '/legal' };
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
${(alternates || []).map((a) => `<link rel="alternate" hreflang="${a.lang}" href="${esc(base + a.path)}">`).join('\n')}
<meta property="og:type" content="website">
<meta property="og:site_name" content="AI Website Auditor">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage || `${base}/static/img/og.png`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/static/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/css/app.css">
${jsonLd ? `<script type="application/ld+json">${jsonForHtml(jsonLd)}</script>` : ''}
<script type="application/json" id="page-data">${jsonForHtml({ lang, ui: t, ...(pageData || {}) })}</script>
<script src="/static/js/app.js" defer></script>
</head>
<body>
<header class="site-header">
  <div class="container nav">
    <a class="logo" href="${home}"><span class="logo-mark" aria-hidden="true">◎</span> ${esc(t.brand)}</a>
    <nav aria-label="Main">
      <a href="/tools/">${esc(t.nav.tools)}</a>
      <a href="${lang === 'fr' ? '/fr/tarifs' : '/pricing'}">${esc(t.nav.pricing)}</a>
      <a href="/how-scoring-works">${esc(t.nav.scoring)}</a>
      <a href="${lang === 'fr' ? '/' : '/fr/'}" hreflang="${lang === 'fr' ? 'en' : 'fr'}">${lang === 'fr' ? 'EN' : 'FR'}</a>
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
  <label class="visually-hidden" for="url-input">Website URL</label>
  <input id="url-input" name="url" type="text" inputmode="url" autocomplete="url" spellcheck="false" placeholder="${esc(t.hero.placeholder)}" required>
  <button type="submit">${esc(tool ? 'Check' : t.hero.button)}</button>
  <p class="form-error" role="alert" hidden></p>
</form>
<div class="progress" hidden aria-live="polite"><div class="spinner" aria-hidden="true"></div><p class="progress-text"></p></div>`;
}
