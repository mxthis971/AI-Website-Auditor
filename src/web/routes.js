// Page routes (server-rendered HTML). Interactive parts (audit form,
// report rendering) are handled by /static/js/app.js.

import { UI } from '../i18n/ui.js';
import { TOOLS, TOOL_SLUGS } from './tools.js';
import { layout, auditForm, esc } from './layout.js';
import { CATEGORY_WEIGHTS, PENALTY } from '../analyzer/scoring.js';
import { CATALOG, describe } from '../analyzer/catalog.js';
import { legalPages } from './legal.js';
import { homepageLang, langFromCookie, setLangCookie } from './lang.js';

const ID_RE = /^[A-Za-z0-9]{8,32}$/;

// Minimal 24px line icons for the three steps (crawl, measure, explain).
const icon = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const STEP_ICONS = [
  icon('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.2l2.6 8.6M15.8 7.2l-2.6 8.6M8.5 6h7"/>'),
  icon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  icon('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
];

export async function registerPages(app, { config, store, payments }) {
  const html = (reply, content, code = 200) => reply.code(code).type('text/html; charset=utf-8').send(content);
  const homeAlternates = [
    { lang: 'en', path: '/' },
    { lang: 'fr', path: '/fr/' },
    { lang: 'x-default', path: '/' },
  ];

  const homePage = (lang) => {
    const t = UI[lang];
    const fill = (str) => str.replace(/\{pages\}/g, config.crawler.maxPages).replace('{depth}', config.crawler.maxDepth).replace('{checks}', Object.keys(CATALOG).length);
    const body = `
<section class="hero">
  <div class="container narrow center">
    <p class="eyebrow">${esc(t.tagline)}</p>
    <h1>${esc(t.hero.title)}</h1>
    <p class="lead">${esc(t.hero.subtitle)}</p>
    ${auditForm(t)}
    <ul class="specs" aria-label="${esc(t.howTitle)}">${t.specs.map((x) => `<li>${esc(fill(x))}</li>`).join('')}</ul>
  </div>
</section>
<section id="report" class="container" hidden></section>
<section class="container how" id="how">
  <h2 class="section-label">${esc(t.howTitle)}</h2>
  <div class="steps">
    ${t.how.map(([h, p, m], i) => `<div class="step"><div class="step-head"><span class="step-icon" aria-hidden="true">${STEP_ICONS[i]}</span><span class="step-num">0${i + 1}</span></div><h3>${esc(h)}</h3><p>${esc(fill(p))}</p><p class="step-metric">${esc(fill(m))}</p></div>`).join('')}
  </div>
</section>
<section class="container narrow">
  <h2>${esc(t.checksTitle)}</h2>
  <ul class="checklist">${t.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
  <p><a href="/tools/">${esc(t.nav.tools)} →</a> · <a href="/how-scoring-works">${esc(t.nav.scoring)} →</a></p>
</section>`;
    return layout({
      config,
      lang,
      path: lang === 'fr' ? '/fr/' : '/',
      title: lang === 'fr' ? 'Auditeur SEO : audit SEO technique gratuit de votre site' : 'Auditeur SEO: Free Technical SEO Website Audit',
      description: t.hero.subtitle,
      alternates: homeAlternates,
      body,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Auditeur SEO',
        url: config.publicBaseUrl,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        description: t.hero.subtitle,
      },
      pageData: { page: 'home' },
    });
  };

  // The EN/FR switch links to "?lang=xx": remember the choice, then show the clean URL.
  app.addHook('onRequest', async (req, reply) => {
    const l = req.query?.lang;
    if (req.method !== 'GET' || (l !== 'en' && l !== 'fr') || req.url.startsWith('/api/') || req.url.startsWith('/r/')) return;
    setLangCookie(req, reply, l);
    return reply.code(302).redirect(req.url.split('?')[0]);
  });

  const home = (pageLang) => (req, reply) => {
    const { lang, store, redirect } = homepageLang(req, pageLang);
    if (store) setLangCookie(req, reply, lang);
    reply.header('vary', 'Accept-Language, Cookie');
    if (redirect && redirect !== req.url) return reply.code(302).redirect(redirect);
    return html(reply, homePage(pageLang));
  };
  app.get('/', home('en'));
  app.get('/fr/', home('fr'));
  app.get('/fr', (req, reply) => reply.redirect('/fr/', 301));

  // Shared report page. Indexing is disabled: reports are user content,
  // not pages we want in Google (avoids thousands of thin pages).
  app.get('/r/:id', (req, reply) => {
    const report = ID_RE.test(req.params.id) ? store.getReport(req.params.id) : null;
    if (!report) return html(reply, notFound(), 404);
    const wanted = req.query.lang || langFromCookie(req.headers.cookie) || report.lang;
    const lang = wanted === 'fr' ? 'fr' : 'en';
    const t = UI[lang];
    const host = new URL(report.url).hostname;
    const score = report.data?.score.overall;
    const title = score != null ? `${host}: ${score}/100 · ${t.report.title}` : `${host} · ${t.report.title}`;
    const body = `<section class="container"><div id="report" data-report-id="${esc(report.id)}"><div class="progress"><div class="spinner" aria-hidden="true"></div><p class="progress-text">…</p></div></div></section>`;
    return html(
      reply,
      layout({ config, lang, path: `/r/${report.id}`, title, description: `${t.report.yourScore}: ${score ?? '…'}/100. SEO, performance, accessibility, technical and content audit of ${host}.`, body, noindex: true, pageData: { page: 'report', reportId: report.id } }),
    );
  });

  // ---------------------------------------------------------------- Tools
  app.get('/tools', (req, reply) => reply.redirect('/tools/', 301));
  app.get('/tools/', (req, reply) => {
    const t = UI.en;
    const body = `<section class="container narrow">
  <h1>Free website checkers</h1>
  <p class="lead">Focused, single-purpose checks. Each one runs part of the full audit and explains how to fix what it finds.</p>
  <div class="cards two">${TOOL_SLUGS.map((s) => `<a class="card link-card" href="/tools/${s}"><h2 class="h3">${esc(TOOLS[s].name)}</h2><p>${esc(TOOLS[s].description)}</p></a>`).join('')}</div>
  <p>Need everything at once? <a href="/">Run the full website audit</a>.</p>
</section>`;
    return html(reply, layout({ config, lang: 'en', path: '/tools/', title: 'Free SEO & Website Checker Tools', description: 'Free meta tag, robots.txt, sitemap, heading, Open Graph, image alt, broken link and speed checkers.', body, pageData: { page: 'tools', ui: t } }));
  });

  app.get('/tools/:slug', (req, reply) => {
    const tool = Object.hasOwn(TOOLS, req.params.slug) ? TOOLS[req.params.slug] : null;
    if (!tool) return html(reply, notFound(), 404);
    const t = UI.en;
    const checks = tool.checks.map((id) => describe(id, 'en').label);
    const body = `<section class="hero tool-hero">
  <div class="container narrow center">
    <p class="eyebrow">Free tool</p>
    <h1>${esc(tool.h1)}</h1>
    <p class="lead">${esc(tool.intro)}</p>
    ${auditForm(t, { tool: req.params.slug })}
  </div>
</section>
<section id="tool-result" class="container narrow" hidden></section>
${config.adsense?.client ? '<div class="container narrow" data-ad-placement="tool"></div>' : ''}
<article class="container narrow prose">
  <h2>Checks performed</h2>
  <ul class="checklist">${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
  ${tool.sections.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join('')}
  <h2>FAQ</h2>
  ${tool.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
  <div class="cta-box"><h2 class="h3">Check everything at once</h2><p>The full audit crawls up to ${config.crawler.maxPages} pages and runs 60+ checks across SEO, performance, accessibility and technical health.</p><a class="button" href="/">Run a free full audit</a></div>
  <p class="muted small">Other tools: ${TOOL_SLUGS.filter((s) => s !== req.params.slug).map((s) => `<a href="/tools/${s}">${esc(TOOLS[s].name)}</a>`).join(' · ')}</p>
</article>`;
    return html(
      reply,
      layout({
        config,
        lang: 'en',
        path: `/tools/${req.params.slug}`,
        title: tool.title,
        description: tool.description,
        body,
        jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: tool.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
        pageData: { page: 'tool', tool: req.params.slug, showOutline: Boolean(tool.showOutline), showSocial: Boolean(tool.showSocial), showImages: Boolean(tool.showImages) },
      }),
    );
  });

  // -------------------------------------------------------------- Pricing
  const pricing = (lang) => {
    const fr = lang === 'fr';
    const t = UI[lang];
    const plans = [
      {
        name: fr ? 'Gratuit' : 'Free',
        price: '0 €',
        items: fr
          ? ['Score global et par catégorie', `Jusqu’à ${config.crawler.maxPages} pages explorées`, 'Tous les problèmes listés', '5 problèmes détaillés avec correction', 'Lien de partage']
          : ['Overall and category scores', `Up to ${config.crawler.maxPages} pages crawled`, 'Every issue listed', '5 issues fully explained with fixes', 'Shareable link'],
        cta: `<a class="button" href="${fr ? '/fr/' : '/'}">${fr ? 'Lancer un audit' : 'Run an audit'}</a>`,
      },
      {
        name: fr ? 'Rapport complet' : 'Full report',
        price: fr ? '7,90 € une fois' : '€7.90 one-time',
        items: fr
          ? ['Tous les problèmes expliqués, avec URL concernées', 'Exemples de correction', 'Plan d’action personnalisé', 'Plan d’action prioritaire complet', 'Export PDF']
          : ['Every issue explained, with affected URLs', 'Fix examples', 'Personalised action plan', 'Full priority roadmap', 'PDF export'],
        cta: payments ? `<p class="muted small">${fr ? 'Disponible depuis chaque rapport.' : 'Available from any report.'}</p>` : `<p class="muted small">${fr ? 'Gratuit pendant la bêta : le rapport complet est offert.' : 'Free during beta: full reports are unlocked for everyone.'}</p>`,
      },
      {
        name: 'Pro monitoring',
        price: fr ? '14 € / mois (bientôt)' : '€14 / month (soon)',
        items: fr
          ? ['Audits automatiques chaque semaine', 'Historique et comparaison du score', 'Alertes e-mail sur les nouveaux problèmes', 'Plusieurs sites']
          : ['Automatic weekly audits', 'Score history and comparison', 'Email alerts for new issues', 'Several websites'],
        cta: `<button class="button secondary" data-interest="pro">${esc(t.report.comingSoon)}</button>`,
      },
    ];
    const body = `<section class="container">
  <h1 class="center">${fr ? 'Tarifs simples' : 'Simple pricing'}</h1>
  <p class="lead center">${fr ? 'Commencez gratuitement. Payez seulement si le rapport vous est utile.' : 'Start free. Pay only if the report is useful to you.'}</p>
  <div class="cards three pricing">${plans.map((p) => `<div class="card plan"><h2 class="h3">${esc(p.name)}</h2><p class="price">${esc(p.price)}</p><ul class="checklist">${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>${p.cta}</div>`).join('')}</div>
  <p class="muted small center">${fr ? 'Prix TTC indicatifs, susceptibles d’évoluer. Aucun abonnement caché, annulation à tout moment.' : 'Indicative prices, subject to change. No hidden subscription, cancel anytime.'}</p>
</section>`;
    return layout({ config, lang, path: fr ? '/fr/tarifs' : '/pricing', title: fr ? 'Tarifs · Auditeur SEO' : 'Pricing · Auditeur SEO', description: fr ? 'Audit gratuit, rapport complet à l’unité, monitoring Pro.' : 'Free audit, one-time full report, Pro monitoring.', alternates: [{ lang: 'en', path: '/pricing' }, { lang: 'fr', path: '/fr/tarifs' }], body, pageData: { page: 'pricing' } });
  };
  app.get('/pricing', (req, reply) => html(reply, pricing('en')));
  app.get('/fr/tarifs', (req, reply) => html(reply, pricing('fr')));

  // ------------------------------------------------------ Scoring method
  app.get('/how-scoring-works', (req, reply) => {
    const rows = Object.entries(CATALOG)
      .map(([id, c]) => `<tr><td>${esc(describe(id, 'en').label)}</td><td>${esc(c.category)}</td><td><span class="badge ${c.severity}">${c.severity}</span></td></tr>`)
      .join('');
    const body = `<article class="container narrow prose">
  <h1>How the score is calculated</h1>
  <p class="lead">No black box: every point comes from a measurable check. Nothing is estimated or guessed.</p>
  <h2>1. Checks</h2>
  <p>We run ${Object.keys(CATALOG).length} deterministic checks. Each failed check has a severity and a penalty: critical = ${PENALTY.critical}, warning = ${PENALTY.warning}, suggestion = ${PENALTY.info}.</p>
  <h2>2. Pages affected</h2>
  <p>For checks evaluated on every page, the penalty is scaled by the share of crawled pages affected: <code>penalty × (0.5 + 0.5 × affected / crawled)</code>. One page out of ten costs about half the penalty; all pages cost the full penalty.</p>
  <h2>3. Category score</h2>
  <p>Each category starts at 100 and is multiplied by <code>(1 − penalty / 100)</code> for every failed check. Example: one critical issue and one warning give <code>100 × 0.75 × 0.90 = 68</code>. Multiplying gives diminishing returns, so a site with many small issues is not crushed to zero.</p>
  <h2>4. Overall score</h2>
  <p>Weighted average: ${Object.entries(CATEGORY_WEIGHTS).map(([k, w]) => `${k} ${Math.round(w * 100)}%`).join(', ')}.</p>
  <h2>Limits</h2>
  <p>We crawl up to ${config.crawler.maxPages} pages (depth ${config.crawler.maxDepth}) and measure homepage resources only. Core Web Vitals are shown only when measured by Google PageSpeed Insights; we never estimate them. Colour contrast and keyboard behaviour need a real browser and are not covered yet.</p>
  <h2>All checks</h2>
  <div class="table-wrap"><table><thead><tr><th>Check</th><th>Category</th><th>Severity</th></tr></thead><tbody>${rows}</tbody></table></div>
</article>`;
    return html(reply, layout({ config, lang: 'en', path: '/how-scoring-works', title: 'How the Website Audit Score Is Calculated', description: 'Transparent scoring: severities, penalties, category weights and the full list of checks.', body }));
  });

  // ---------------------------------------------------------------- Legal
  for (const page of legalPages(config)) {
    app.get(page.path, (req, reply) => html(reply, layout({ config, lang: page.lang, path: page.path, title: page.title, description: page.description, body: `<article class="container narrow prose">${page.body}</article>`, alternates: page.alternates })));
  }

  // ------------------------------------------------------- robots/sitemap
  // ads.txt tells ad buyers which AdSense account may sell ads on this site.
  app.get('/ads.txt', (req, reply) => {
    if (!config.adsense?.client) return reply.code(404).type('text/plain').send('Not found');
    return reply.type('text/plain').send(`google.com, ${config.adsense.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  });

  app.get('/robots.txt', (req, reply) =>
    reply.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /r/\n\nSitemap: ${config.publicBaseUrl}/sitemap.xml\n`),
  );
  app.get('/sitemap.xml', (req, reply) => {
    const paths = ['/', '/fr/', '/tools/', ...TOOL_SLUGS.map((s) => `/tools/${s}`), '/pricing', '/fr/tarifs', '/how-scoring-works', '/privacy', '/fr/confidentialite', '/terms', '/fr/conditions'];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${config.publicBaseUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
    return reply.type('application/xml').send(xml);
  });

  const notFound = () =>
    layout({ config, lang: 'en', path: '/404', title: 'Page not found', description: 'This page does not exist.', noindex: true, body: '<section class="container narrow center"><h1>Page not found</h1><p><a class="button" href="/">Run a free website audit</a></p></section>' });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: { code: 'not_found', message: 'Not found.' } });
    return html(reply, notFound(), 404);
  });
}

