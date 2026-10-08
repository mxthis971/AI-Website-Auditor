// Page routes (server-rendered HTML). Interactive parts (audit form,
// report rendering) are handled by /static/js/app.js.

import { UI } from '../i18n/ui.js';
import { TOOLS, TOOL_SLUGS } from './tools.js';
import { TOOLS_FR, TOOL_BY_FR_SLUG } from './tools-fr.js';
import { layout, auditForm, esc } from './layout.js';
import { CATEGORY_WEIGHTS, PENALTY } from '../analyzer/scoring.js';
import { CATALOG, CATEGORY_LABELS, describe } from '../analyzer/catalog.js';
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
  <p><a href="${lang === 'fr' ? '/fr/outils/' : '/tools/'}">${esc(t.nav.tools)} →</a> · <a href="${lang === 'fr' ? '/fr/calcul-du-score' : '/how-scoring-works'}">${esc(t.nav.scoring)} →</a></p>
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
    if (!report) return html(reply, notFound(langFromCookie(req.headers.cookie) || 'en'), 404);
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
  // English at /tools/<slug>, French at /fr/outils/<slug-fr>. Same checks.
  const toolsIndexPath = (lang) => (lang === 'fr' ? '/fr/outils/' : '/tools/');
  const toolPath = (lang, key) => (lang === 'fr' ? `/fr/outils/${TOOLS_FR[key].slug}` : `/tools/${key}`);
  const toolText = (lang, key) => (lang === 'fr' ? { ...TOOLS[key], ...TOOLS_FR[key] } : TOOLS[key]);
  const toolAlternates = (key) => [{ lang: 'en', path: toolPath('en', key) }, { lang: 'fr', path: toolPath('fr', key) }];

  const toolsIndex = (lang) => {
    const t = UI[lang];
    const body = `<section class="container narrow">
  <h1>${esc(t.tool.indexTitle)}</h1>
  <p class="lead">${esc(t.tool.indexLead)}</p>
  <div class="cards two">${TOOL_SLUGS.map((k) => `<a class="card link-card" href="${toolPath(lang, k)}"><h2 class="h3">${esc(toolText(lang, k).name)}</h2><p>${esc(toolText(lang, k).description)}</p></a>`).join('')}</div>
  <p>${esc(t.tool.indexMore)} <a href="${lang === 'fr' ? '/fr/' : '/'}">${esc(t.tool.indexMoreLink)}</a>.</p>
</section>`;
    return layout({
      config,
      lang,
      path: toolsIndexPath(lang),
      title: lang === 'fr' ? 'Outils SEO gratuits : vérificateurs de site web' : 'Free SEO & Website Checker Tools',
      description: lang === 'fr' ? 'Vérificateurs gratuits : balises meta, robots.txt, sitemap, titres, Open Graph, attributs alt, liens cassés et vitesse.' : 'Free meta tag, robots.txt, sitemap, heading, Open Graph, image alt, broken link and speed checkers.',
      alternates: [{ lang: 'en', path: '/tools/' }, { lang: 'fr', path: '/fr/outils/' }],
      body,
      pageData: { page: 'tools' },
    });
  };

  const toolPage = (lang, key) => {
    const t = UI[lang];
    const tool = toolText(lang, key);
    const checks = tool.checks.map((id) => describe(id, lang).label);
    const fill = (str) => str.replace('{pages}', config.crawler.maxPages).replace('{checks}', Object.keys(CATALOG).length);
    const body = `<section class="hero tool-hero">
  <div class="container narrow center">
    <p class="eyebrow">${esc(t.tool.eyebrow)}</p>
    <h1>${esc(tool.h1)}</h1>
    <p class="lead">${esc(tool.intro)}</p>
    ${auditForm(t, { tool: key })}
  </div>
</section>
<section id="tool-result" class="container narrow" hidden></section>
${config.adsense?.client ? '<div class="container narrow" data-ad-placement="tool"></div>' : ''}
<article class="container narrow prose">
  <h2>${esc(t.tool.checksTitle)}</h2>
  <ul class="checklist">${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
  ${tool.sections.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join('')}
  <h2>${esc(t.tool.faq)}</h2>
  ${tool.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
  <div class="cta-box"><h2 class="h3">${esc(t.tool.ctaTitle)}</h2><p>${esc(fill(t.tool.ctaText))}</p><a class="button" href="${lang === 'fr' ? '/fr/' : '/'}">${esc(t.tool.ctaButton)}</a></div>
  <p class="muted small">${esc(t.tool.others)}${lang === 'fr' ? ' :' : ':'} ${TOOL_SLUGS.filter((k) => k !== key).map((k) => `<a href="${toolPath(lang, k)}">${esc(toolText(lang, k).name)}</a>`).join(' · ')}</p>
</article>`;
    return layout({
      config,
      lang,
      path: toolPath(lang, key),
      title: tool.title,
      description: tool.description,
      alternates: toolAlternates(key),
      body,
      jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: tool.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      pageData: { page: 'tool', tool: key, showOutline: Boolean(TOOLS[key].showOutline), showSocial: Boolean(TOOLS[key].showSocial), showImages: Boolean(TOOLS[key].showImages) },
    });
  };

  app.get('/tools', (req, reply) => reply.redirect('/tools/', 301));
  app.get('/tools/', (req, reply) => html(reply, toolsIndex('en')));
  app.get('/fr/outils', (req, reply) => reply.redirect('/fr/outils/', 301));
  app.get('/fr/outils/', (req, reply) => html(reply, toolsIndex('fr')));
  app.get('/tools/:slug', (req, reply) => (Object.hasOwn(TOOLS, req.params.slug) ? html(reply, toolPage('en', req.params.slug)) : html(reply, notFound('en'), 404)));
  app.get('/fr/outils/:slug', (req, reply) => (Object.hasOwn(TOOL_BY_FR_SLUG, req.params.slug) ? html(reply, toolPage('fr', TOOL_BY_FR_SLUG[req.params.slug])) : html(reply, notFound('fr'), 404)));

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
  const scoringPage = (lang) => {
    const fr = lang === 'fr';
    const cats = CATEGORY_LABELS[lang];
    const sev = UI[lang].severity;
    const rows = Object.entries(CATALOG)
      .map(([id, c]) => `<tr><td>${esc(describe(id, lang).label)}</td><td>${esc(cats[c.category] || c.category)}</td><td><span class="badge ${c.severity}">${esc(sev[c.severity])}</span></td></tr>`)
      .join('');
    const weights = Object.entries(CATEGORY_WEIGHTS).map(([k, w]) => `${cats[k] || k} ${Math.round(w * 100)} %`).join(', ');
    const n = Object.keys(CATALOG).length;
    const { maxPages, maxDepth } = config.crawler;
    const body = fr
      ? `<article class="container narrow prose">
  <h1>Comment le score est calculé</h1>
  <p class="lead">Aucune boîte noire : chaque point vient d’un contrôle mesurable. Rien n’est estimé ni deviné.</p>
  <h2>1. Contrôles</h2>
  <p>Nous exécutons ${n} contrôles déterministes. Chaque contrôle échoué a une gravité et une pénalité : critique = ${PENALTY.critical}, avertissement = ${PENALTY.warning}, suggestion = ${PENALTY.info}.</p>
  <h2>2. Pages concernées</h2>
  <p>Pour les contrôles faits sur chaque page, la pénalité dépend de la part des pages explorées qui sont concernées : <code>pénalité × (0,5 + 0,5 × concernées / explorées)</code>. Une page sur dix coûte environ la moitié de la pénalité ; toutes les pages coûtent la pénalité entière.</p>
  <h2>3. Score par catégorie</h2>
  <p>Chaque catégorie part de 100 et est multipliée par <code>(1 − pénalité / 100)</code> pour chaque contrôle échoué. Exemple : un problème critique et un avertissement donnent <code>100 × 0,75 × 0,90 = 68</code>. La multiplication atténue l’effet de cumul : un site avec beaucoup de petits défauts ne tombe pas à zéro.</p>
  <h2>4. Score global</h2>
  <p>Moyenne pondérée : ${esc(weights)}.</p>
  <h2>Limites</h2>
  <p>Nous explorons jusqu’à ${maxPages} pages (profondeur ${maxDepth}) et mesurons uniquement les ressources de la page d’accueil. Les Core Web Vitals ne sont affichés que s’ils sont mesurés par Google PageSpeed Insights ; nous ne les estimons jamais. Le contraste des couleurs et la navigation au clavier demandent un vrai navigateur et ne sont pas encore couverts.</p>
  <h2>Tous les contrôles</h2>
  <div class="table-wrap"><table><thead><tr><th>Contrôle</th><th>Catégorie</th><th>Gravité</th></tr></thead><tbody>${rows}</tbody></table></div>
</article>`
      : `<article class="container narrow prose">
  <h1>How the score is calculated</h1>
  <p class="lead">No black box: every point comes from a measurable check. Nothing is estimated or guessed.</p>
  <h2>1. Checks</h2>
  <p>We run ${n} deterministic checks. Each failed check has a severity and a penalty: critical = ${PENALTY.critical}, warning = ${PENALTY.warning}, suggestion = ${PENALTY.info}.</p>
  <h2>2. Pages affected</h2>
  <p>For checks evaluated on every page, the penalty is scaled by the share of crawled pages affected: <code>penalty × (0.5 + 0.5 × affected / crawled)</code>. One page out of ten costs about half the penalty; all pages cost the full penalty.</p>
  <h2>3. Category score</h2>
  <p>Each category starts at 100 and is multiplied by <code>(1 − penalty / 100)</code> for every failed check. Example: one critical issue and one warning give <code>100 × 0.75 × 0.90 = 68</code>. Multiplying gives diminishing returns, so a site with many small issues is not crushed to zero.</p>
  <h2>4. Overall score</h2>
  <p>Weighted average: ${esc(weights.replace(/ %/g, '%'))}.</p>
  <h2>Limits</h2>
  <p>We crawl up to ${maxPages} pages (depth ${maxDepth}) and measure homepage resources only. Core Web Vitals are shown only when measured by Google PageSpeed Insights; we never estimate them. Colour contrast and keyboard behaviour need a real browser and are not covered yet.</p>
  <h2>All checks</h2>
  <div class="table-wrap"><table><thead><tr><th>Check</th><th>Category</th><th>Severity</th></tr></thead><tbody>${rows}</tbody></table></div>
</article>`;
    return layout({
      config,
      lang,
      path: fr ? '/fr/calcul-du-score' : '/how-scoring-works',
      title: fr ? 'Comment le score de l’audit est calculé' : 'How the Website Audit Score Is Calculated',
      description: fr ? 'Score transparent : gravités, pénalités, poids des catégories et liste complète des contrôles.' : 'Transparent scoring: severities, penalties, category weights and the full list of checks.',
      alternates: [{ lang: 'en', path: '/how-scoring-works' }, { lang: 'fr', path: '/fr/calcul-du-score' }],
      body,
    });
  };
  app.get('/how-scoring-works', (req, reply) => html(reply, scoringPage('en')));
  app.get('/fr/calcul-du-score', (req, reply) => html(reply, scoringPage('fr')));

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
    const paths = ['/', '/fr/', '/tools/', '/fr/outils/', ...TOOL_SLUGS.flatMap((k) => [toolPath('en', k), toolPath('fr', k)]), '/pricing', '/fr/tarifs', '/how-scoring-works', '/fr/calcul-du-score', '/privacy', '/fr/confidentialite', '/terms', '/fr/conditions', '/legal', '/fr/mentions-legales'];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${config.publicBaseUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
    return reply.type('application/xml').send(xml);
  });

  const notFound = (lang = 'en') => {
    const t = UI[lang].notFound;
    return layout({ config, lang, path: '/404', title: t.title, description: t.text, noindex: true, body: `<section class="container narrow center"><h1>${esc(t.title)}</h1><p class="lead">${esc(t.text)}</p><p><a class="button" href="${lang === 'fr' ? '/fr/' : '/'}">${esc(t.button)}</a></p></section>` });
  };

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: { code: 'not_found', message: 'Not found.' } });
    const lang = req.url.startsWith('/fr/') || langFromCookie(req.headers.cookie) === 'fr' ? 'fr' : 'en';
    return html(reply, notFound(lang), 404);
  });
}

