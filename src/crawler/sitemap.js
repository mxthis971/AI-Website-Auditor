// Tiny sitemap.xml reader. We only need <loc> values and the document type,
// so a regex-based extraction is enough and avoids an XML dependency.

export function parseSitemap(xml) {
  const text = String(xml || '');
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  const isUrlset = /<urlset[\s>]/i.test(text);
  const locs = [...text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, '&').trim(),
  );
  return {
    valid: isIndex || isUrlset,
    type: isIndex ? 'index' : isUrlset ? 'urlset' : 'unknown',
    locs,
  };
}
