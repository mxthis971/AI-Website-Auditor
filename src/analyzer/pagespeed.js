// Optional: Google PageSpeed Insights (free API, key recommended).
// Gives real Lighthouse scores and Core Web Vitals, which cannot be measured
// reliably without a real browser. If no key is configured, we skip it and
// say so in the report instead of inventing numbers.

const THRESHOLDS = {
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  tbt: [200, 600],
};

function rate(metric, value) {
  const [good, poor] = THRESHOLDS[metric];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

const display = (metric, value) => (metric === 'cls' ? value.toFixed(2) : `${(value / 1000).toFixed(1)} s`);

export function extractPagespeed(json) {
  const lh = json.lighthouseResult || {};
  const field = json.loadingExperience?.metrics || {};
  const metrics = {};
  const fieldMap = { lcp: 'LARGEST_CONTENTFUL_PAINT_MS', cls: 'CUMULATIVE_LAYOUT_SHIFT_SCORE', inp: 'INTERACTION_TO_NEXT_PAINT' };
  let source = 'lab';
  for (const [key, name] of Object.entries(fieldMap)) {
    const m = field[name];
    if (m && typeof m.percentile === 'number') {
      const value = key === 'cls' ? m.percentile / 100 : m.percentile;
      metrics[key] = { value, display: key === 'inp' ? `${value} ms` : display(key, value), rating: rate(key, value), source: 'field' };
      source = 'field';
    }
  }
  const audits = lh.audits || {};
  if (!metrics.lcp && audits['largest-contentful-paint']?.numericValue != null) {
    const v = audits['largest-contentful-paint'].numericValue;
    metrics.lcp = { value: Math.round(v), display: display('lcp', v), rating: rate('lcp', v), source: 'lab' };
  }
  if (!metrics.cls && audits['cumulative-layout-shift']?.numericValue != null) {
    const v = audits['cumulative-layout-shift'].numericValue;
    metrics.cls = { value: v, display: display('cls', v), rating: rate('cls', v), source: 'lab' };
  }
  if (!metrics.inp && audits['total-blocking-time']?.numericValue != null) {
    const v = audits['total-blocking-time'].numericValue;
    metrics.tbt = { value: Math.round(v), display: `${Math.round(v)} ms`, rating: rate('tbt', v), source: 'lab' };
  }
  const cat = lh.categories || {};
  const score = (k) => (cat[k]?.score != null ? Math.round(cat[k].score * 100) : null);
  return {
    strategy: 'mobile',
    source,
    lighthouse: { performance: score('performance'), accessibility: score('accessibility'), seo: score('seo'), bestPractices: score('best-practices') },
    metrics,
  };
}

export async function runPagespeed(url, { apiKey, timeoutMs = 60_000, fetchImpl = fetch } = {}) {
  if (!apiKey) return null;
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', 'mobile');
  for (const c of ['performance', 'accessibility', 'seo', 'best-practices']) endpoint.searchParams.append('category', c);
  endpoint.searchParams.set('key', apiKey);
  const res = await fetchImpl(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`PageSpeed API answered ${res.status}`);
  return extractPagespeed(await res.json());
}
