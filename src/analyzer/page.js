// Extracts objective facts from one HTML page. No judgement happens here:
// checks/*.js decide what is a problem. Keeping "facts" and "rules" apart
// makes both easy to test.

import * as cheerio from 'cheerio';

const NON_HTML_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|gz|rar|7z|mp3|mp4|webm|mov|avi|woff2?|ttf|eot|css|js|json|xml|txt|csv|docx?|xlsx?|pptx?|exe|dmg|apk)$/i;

export function siteKey(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function normalizeUrl(href, base) {
  try {
    const url = new URL(href, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    for (const param of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_eid$|ref$)/i.test(param)) url.searchParams.delete(param);
    }
    return url.href;
  } catch {
    return null;
  }
}

export function looksLikeHtmlUrl(href) {
  try {
    return !NON_HTML_EXT.test(new URL(href).pathname);
  } catch {
    return false;
  }
}

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

export function parsePage(html, pageUrl) {
  const $ = cheerio.load(html);
  const base = (() => {
    const href = $('base[href]').attr('href');
    return normalizeUrl(href || '', pageUrl) || pageUrl;
  })();
  const pageHost = siteKey(new URL(pageUrl).hostname);
  const isHttps = pageUrl.startsWith('https:');

  const meta = (name) => $(`meta[name="${name}" i]`).first().attr('content');
  const prop = (p) => $(`meta[property="${p}" i]`).first().attr('content') ?? $(`meta[name="${p}" i]`).first().attr('content');

  const titles = $('head title, title').map((_, el) => clean($(el).text())).get();
  const descriptions = $('meta[name="description" i]').map((_, el) => clean($(el).attr('content'))).get();
  const canonicals = $('link[rel~="canonical" i]').map((_, el) => $(el).attr('href')).get().filter(Boolean);

  const headings = $('h1, h2, h3, h4, h5, h6')
    .map((_, el) => ({ level: Number(el.tagName.slice(1)), text: clean($(el).text()).slice(0, 200) }))
    .get();

  const links = [];
  $('a[href]').each((_, el) => {
    const raw = ($(el).attr('href') || '').trim();
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript|data|sms):/i.test(raw)) return;
    const href = normalizeUrl(raw, base);
    if (!href) return;
    const rel = ($(el).attr('rel') || '').toLowerCase();
    links.push({
      href,
      text: clean($(el).text()).slice(0, 120),
      internal: siteKey(new URL(href).hostname) === pageHost,
      nofollow: rel.includes('nofollow'),
    });
  });

  const images = $('img')
    .map((_, el) => {
      const $el = $(el);
      const src = $el.attr('src') || $el.attr('data-src') || '';
      return {
        src: src && !src.startsWith('data:') ? normalizeUrl(src, base) : null,
        inline: src.startsWith('data:'),
        alt: $el.attr('alt') === undefined ? null : clean($el.attr('alt')),
        decorative: $el.attr('role') === 'presentation' || $el.attr('aria-hidden') === 'true',
        width: $el.attr('width') || null,
        height: $el.attr('height') || null,
        loading: ($el.attr('loading') || '').toLowerCase() || null,
      };
    })
    .get();

  const scripts = $('script[src]')
    .map((_, el) => {
      const $el = $(el);
      return {
        src: normalizeUrl($el.attr('src'), base),
        async: $el.attr('async') !== undefined,
        defer: $el.attr('defer') !== undefined,
        module: ($el.attr('type') || '').toLowerCase() === 'module',
        inHead: $el.closest('head').length > 0,
      };
    })
    .get()
    .filter((s) => s.src);

  const stylesheets = $('link[rel~="stylesheet" i][href]')
    .map((_, el) => ({
      href: normalizeUrl($(el).attr('href'), base),
      inHead: $(el).closest('head').length > 0,
      media: $(el).attr('media') || null,
    }))
    .get()
    .filter((s) => s.href);

  const jsonLd = $('script[type="application/ld+json" i]')
    .map((_, el) => {
      const raw = $(el).text();
      try {
        const data = JSON.parse(raw);
        const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
        const types = items.flatMap((i) => (Array.isArray(i?.['@type']) ? i['@type'] : [i?.['@type']])).filter(Boolean);
        return { valid: true, types };
      } catch (err) {
        return { valid: false, types: [], error: err.message.slice(0, 120) };
      }
    })
    .get();

  const hreflangs = $('link[rel~="alternate" i][hreflang]')
    .map((_, el) => ({ lang: $(el).attr('hreflang'), href: normalizeUrl($(el).attr('href') || '', base) }))
    .get();

  // --- Accessibility facts -------------------------------------------------
  const labelledIds = new Set($('label[for]').map((_, el) => $(el).attr('for')).get());
  const unlabeledInputs = $('input, select, textarea')
    .filter((_, el) => {
      const $el = $(el);
      const type = ($el.attr('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return false;
      const id = $el.attr('id');
      return !(
        (id && labelledIds.has(id)) ||
        $el.closest('label').length ||
        clean($el.attr('aria-label')) ||
        $el.attr('aria-labelledby') ||
        clean($el.attr('title'))
      );
    })
    .length;
  const unnamedButtons = $('button, [role="button"], input[type="submit"], input[type="button"]')
    .filter((_, el) => {
      const $el = $(el);
      return !(
        clean($el.text()) ||
        clean($el.attr('aria-label')) ||
        $el.attr('aria-labelledby') ||
        clean($el.attr('title')) ||
        clean($el.attr('value')) ||
        $el.find('img[alt]').filter((__, img) => clean($(img).attr('alt'))).length
      );
    })
    .length;
  const emptyLinks = $('a[href]')
    .filter((_, el) => {
      const $el = $(el);
      return !(
        clean($el.text()) ||
        clean($el.attr('aria-label')) ||
        $el.attr('aria-labelledby') ||
        clean($el.attr('title')) ||
        $el.find('img[alt]').filter((__, img) => clean($(img).attr('alt'))).length ||
        $el.find('svg title').length
      );
    })
    .length;
  const ids = $('[id]').map((_, el) => $(el).attr('id')).get();
  const seen = new Set();
  const duplicateIds = new Set();
  for (const id of ids) (seen.has(id) ? duplicateIds : seen).add(id);

  // --- Content facts ---------------------------------------------------------
  const $body = $('body').clone();
  $body.find('script, style, noscript, template, svg').remove();
  const bodyText = clean($body.text());
  const wordCount = bodyText ? bodyText.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;

  const mixedContent = isHttps
    ? $('img[src], script[src], link[href][rel~="stylesheet" i], iframe[src], video[src], audio[src], source[src]')
        .map((_, el) => $(el).attr('src') || $(el).attr('href'))
        .get()
        .filter((u) => /^http:\/\//i.test(u))
    : [];

  const viewport = meta('viewport') ?? null;

  return {
    lang: clean($('html').attr('lang')) || null,
    titles,
    title: titles[0] ?? null,
    descriptions,
    description: descriptions[0] ?? null,
    metaRobots: (meta('robots') || '').toLowerCase() || null,
    canonicals: canonicals.map((c) => normalizeUrl(c, base) || c),
    viewport,
    zoomDisabled: viewport ? /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0+)?\b/i.test(viewport) : false,
    charset: Boolean($('meta[charset]').length || $('meta[http-equiv="content-type" i]').length),
    favicon: Boolean($('link[rel~="icon" i]').length),
    og: {
      title: prop('og:title') || null,
      description: prop('og:description') || null,
      image: prop('og:image') || null,
      url: prop('og:url') || null,
      type: prop('og:type') || null,
    },
    twitterCard: meta('twitter:card') || null,
    jsonLd,
    microdata: $('[itemscope]').length > 0,
    hreflangs,
    headings,
    links,
    images,
    scripts,
    stylesheets,
    iframesWithoutTitle: $('iframe').filter((_, el) => !clean($(el).attr('title'))).length,
    unlabeledInputs,
    unnamedButtons,
    emptyLinks,
    duplicateIds: [...duplicateIds].slice(0, 20),
    positiveTabindex: $('[tabindex]').filter((_, el) => Number($(el).attr('tabindex')) > 0).length,
    wordCount,
    hasLoremIpsum: /lorem ipsum/i.test(bodyText),
    mixedContent: mixedContent.slice(0, 20),
    inlineStyleBytes: $('style').text().length,
    inlineScriptBytes: $('script:not([src])').text().length,
  };
}
