// Turns a stored (language-neutral) report into what the user sees:
// localized texts, executive summary, priority roadmap, and free/full gating.
// Gating happens HERE, on the server: locked details are never sent to the
// browser, so they cannot be revealed with "Inspect element".

import { describe, CATEGORY_LABELS, CATEGORIES } from '../analyzer/catalog.js';
import { grade } from '../analyzer/scoring.js';

export const FREE_DETAILED_ISSUES = 5;

const T = {
  en: {
    summaryIntro: (url, score, g) => `${url} scores ${score}/100 (${g}).`,
    grades: { excellent: 'excellent', good: 'good', 'needs-work': 'needs work', poor: 'poor' },
    counts: (c, w, i) => `We found ${c} critical issue(s), ${w} warning(s) and ${i} minor suggestion(s).`,
    first: (t) => `Fix first: ${t}.`,
    best: (cat, s) => `Strongest area: ${cat} (${s}/100).`,
    worst: (cat, s) => `Weakest area: ${cat} (${s}/100).`,
    clean: 'No significant problems were detected on the crawled pages.',
    roadmap: { now: 'Fix now', next: 'Next', later: 'When you have time' },
  },
  fr: {
    summaryIntro: (url, score, g) => `${url} obtient ${score}/100 (${g}).`,
    grades: { excellent: 'excellent', good: 'bon', 'needs-work': 'à améliorer', poor: 'faible' },
    counts: (c, w, i) => `Nous avons trouvé ${c} problème(s) critique(s), ${w} avertissement(s) et ${i} suggestion(s) mineure(s).`,
    first: (t) => `À corriger en premier : ${t}.`,
    best: (cat, s) => `Point fort : ${cat} (${s}/100).`,
    worst: (cat, s) => `Point faible : ${cat} (${s}/100).`,
    clean: 'Aucun problème important détecté sur les pages explorées.',
    roadmap: { now: 'À corriger maintenant', next: 'Ensuite', later: 'Quand vous aurez le temps' },
  },
};

export function executiveSummary(report, lang = 'en') {
  const t = T[lang] || T.en;
  const labels = CATEGORY_LABELS[lang] || CATEGORY_LABELS.en;
  const host = new URL(report.url).hostname;
  const by = (s) => report.issues.filter((i) => i.severity === s).length;
  const cats = CATEGORIES.map((c) => [c, report.score.categories[c].score]).sort((a, b) => b[1] - a[1]);
  const parts = [t.summaryIntro(host, report.score.overall, t.grades[grade(report.score.overall)])];
  if (!report.issues.length) {
    parts.push(t.clean);
  } else {
    parts.push(t.counts(by('critical'), by('warning'), by('info')));
    const top = report.issues.slice(0, 3).map((i) => describe(i.id, lang, i.values).title.toLowerCase());
    parts.push(t.first(top.join('; ')));
  }
  parts.push(t.best(labels[cats[0][0]], cats[0][1]));
  if (cats.at(-1)[1] < 100) parts.push(t.worst(labels[cats.at(-1)[0]], cats.at(-1)[1]));
  return parts.join(' ');
}

/**
 * @param {object} report stored report
 * @param {{lang?: string, full?: boolean}} opts full=false hides details beyond the first issues
 */
export function buildView(report, { lang = 'en', full = true, ai = null } = {}) {
  const l = T[lang] ? lang : 'en';
  const labels = CATEGORY_LABELS[l];
  const issues = report.issues.map((issue, index) => {
    const text = describe(issue.id, l, issue.values);
    const unlocked = full || index < FREE_DETAILED_ISSUES;
    const base = { id: issue.id, category: issue.category, categoryLabel: labels[issue.category], severity: issue.severity, count: issue.count, title: text.title, label: text.label, locked: !unlocked };
    if (!unlocked) return base;
    return { ...base, explanation: text.explanation, impact: text.impact, fix: text.fix, example: text.example, affected: issue.affected, penalty: issue.penalty };
  });

  const roadmap = [
    { key: 'now', label: T[l].roadmap.now, items: issues.filter((i) => i.severity === 'critical').map((i) => i.title) },
    { key: 'next', label: T[l].roadmap.next, items: issues.filter((i) => i.severity === 'warning').map((i) => i.title) },
    { key: 'later', label: T[l].roadmap.later, items: issues.filter((i) => i.severity === 'info').map((i) => i.title) },
  ].filter((g) => g.items.length);

  return {
    url: report.url,
    createdAt: report.createdAt,
    durationMs: report.durationMs,
    partial: report.partial,
    lang: l,
    full,
    score: {
      overall: report.score.overall,
      grade: grade(report.score.overall),
      categories: CATEGORIES.map((c) => ({ key: c, label: labels[c], ...report.score.categories[c] })),
    },
    summary: executiveSummary(report, l),
    ai: full ? ai : null,
    issues,
    lockedCount: issues.filter((i) => i.locked).length,
    counts: {
      critical: issues.filter((i) => i.severity === 'critical').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
      passed: report.passed.length,
    },
    passed: report.passed.map((p) => ({ id: p.id, category: p.category, label: describe(p.id, l).label })),
    roadmap: full ? roadmap : roadmap.map((g) => ({ ...g, items: g.items.slice(0, 2), more: Math.max(0, g.items.length - 2) })),
    stats: report.stats,
    pagespeed: report.pagespeed,
    pages: full ? report.pages : report.pages.slice(0, 3),
    // Older reports have no fixes; the free view only learns how many pages have some.
    fixes: full ? report.fixes || [] : [],
    fixesCount: (report.fixes || []).length,
  };
}
