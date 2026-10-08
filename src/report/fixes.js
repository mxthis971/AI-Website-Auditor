// Ready-to-paste fixes for the paid report: for each page with a title,
// description, H1, Open Graph or image alt problem, the exact HTML to put in
// place. Built from the page's own content (H1, first paragraph, site name),
// without AI, so the same site always gets the same suggestions.

const TITLE_MAX = 60;
const TITLE_MIN = 15;
const DESC_MIN = 50;
const DESC_MAX = 155;
const MAX_ALT_PER_PAGE = 10;

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Cuts at a word boundary so the result is at most `max` characters. */
export function cut(s, max, ellipsis = '') {
  const clean = String(s || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const room = max - ellipsis.length;
  const at = clean.lastIndexOf(' ', room);
  return clean.slice(0, at > room * 0.6 ? at : room).replace(/[\s,;:.–-]+$/, '') + ellipsis;
}

/** "Contact – Boulangerie Martin" → "Boulangerie Martin" (the part repeated on every page). */
export function siteNameOf(home, hostname) {
  if (home?.og?.siteName) return home.og.siteName.trim();
  const parts = String(home?.title || '').split(/\s+[|–—-]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts.at(-1);
  if (parts[0] && parts[0].length <= 30) return parts[0];
  return hostname.replace(/^www\./, '');
}

function slugWords(url) {
  const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
  const words = decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

function proposeTitle(f, url, siteName, isHome) {
  const h1 = f.headings.find((h) => h.level === 1)?.text;
  const base = isHome ? (h1 || f.title || siteName) : (h1 || slugWords(url) || f.title || siteName);
  const core = cut(base.split(/\s+[|–—]\s+/)[0], TITLE_MAX);
  const withBrand = core.toLowerCase().includes(siteName.toLowerCase()) ? core : `${core} | ${siteName}`;
  const title = withBrand.length <= TITLE_MAX ? withBrand : core;
  return title.length >= TITLE_MIN ? title : null;
}

function proposeDescription(f) {
  if (!f.firstText) return null;
  const d = cut(f.firstText, DESC_MAX, '…');
  return d.length >= DESC_MIN ? d : null;
}

function altFromFile(src) {
  try {
    return slugWords(src).replace(/\b\d{2,}\b/g, '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * @param {{pages: object[], finalUrl: string}} site crawl result (pages carry `facts`)
 * @returns {{url: string, items: {kind: string, current: string|null, code: string}[]}[]}
 */
export function buildFixes(site) {
  const pages = site.pages.filter((p) => p.facts && p.status >= 200 && p.status < 300);
  if (!pages.length) return [];
  const home = pages[0].facts;
  const siteName = siteNameOf(home, new URL(site.finalUrl).hostname);
  const titleCount = new Map();
  const descCount = new Map();
  for (const p of pages) {
    if (p.facts.title) titleCount.set(p.facts.title, (titleCount.get(p.facts.title) || 0) + 1);
    if (p.facts.description) descCount.set(p.facts.description, (descCount.get(p.facts.description) || 0) + 1);
  }

  const out = [];
  pages.forEach((p, index) => {
    const f = p.facts;
    const items = [];
    const title = f.title;
    const titleBad = !title || title.length < TITLE_MIN || title.length > TITLE_MAX || titleCount.get(title) > 1;
    const newTitle = titleBad ? proposeTitle(f, p.finalUrl, siteName, index === 0) : null;
    if (newTitle && newTitle !== title) items.push({ kind: 'title', current: title, code: `<title>${text(newTitle)}</title>` });

    const desc = f.description;
    const descBad = !desc || desc.length < DESC_MIN || desc.length > DESC_MAX + 5 || descCount.get(desc) > 1;
    const newDesc = descBad ? proposeDescription(f) : null;
    if (newDesc && newDesc !== desc) items.push({ kind: 'description', current: desc, code: `<meta name="description" content="${attr(newDesc)}">` });

    if (!f.headings.some((h) => h.level === 1)) {
      const h1 = cut((newTitle || title || slugWords(p.finalUrl) || siteName).split(/\s+[|–—]\s+/)[0], 70);
      if (h1) items.push({ kind: 'h1', current: null, code: `<h1>${text(h1)}</h1>` });
    }

    const missingOg = ['title', 'description'].filter((k) => !f.og[k]);
    if (missingOg.length) {
      const lines = [];
      if (!f.og.title) lines.push(`<meta property="og:title" content="${attr(newTitle || title || siteName)}">`);
      if (!f.og.description && (newDesc || desc)) lines.push(`<meta property="og:description" content="${attr(newDesc || desc)}">`);
      if (lines.length) items.push({ kind: 'og', current: null, code: lines.join('\n') });
    }

    const noAlt = f.images.filter((i) => i.alt === null && !i.decorative && i.src).slice(0, MAX_ALT_PER_PAGE);
    if (noAlt.length) {
      items.push({ kind: 'alt', current: null, code: noAlt.map((i) => `<img src="${attr(i.src)}" alt="${attr(altFromFile(i.src) || '…')}">`).join('\n') });
    }

    if (items.length) out.push({ url: p.finalUrl, items });
  });
  return out;
}
