// Before/after comparison between two audits of the same site (paid re-checks).
// Issues are matched by their check id: present before and gone now = fixed.

import { describe, CATEGORY_LABELS, CATEGORIES } from '../analyzer/catalog.js';

export function compareReports(before, after, { lang = 'en', previousId = null } = {}) {
  const l = CATEGORY_LABELS[lang] ? lang : 'en';
  const title = (issue) => describe(issue.id, l, issue.values)?.title || issue.id;
  const beforeIds = new Set(before.issues.map((i) => i.id));
  const afterIds = new Set(after.issues.map((i) => i.id));
  return {
    previousId,
    previousCreatedAt: before.createdAt,
    previousPages: before.stats?.pagesCrawled ?? null,
    score: { before: before.score.overall, after: after.score.overall, delta: after.score.overall - before.score.overall },
    categories: CATEGORIES.map((c) => ({
      key: c,
      label: CATEGORY_LABELS[l][c],
      before: before.score.categories[c]?.score ?? null,
      after: after.score.categories[c]?.score ?? null,
    })),
    fixed: before.issues.filter((i) => !afterIds.has(i.id)).map((i) => ({ id: i.id, severity: i.severity, title: title(i) })),
    added: after.issues.filter((i) => !beforeIds.has(i.id)).map((i) => ({ id: i.id, severity: i.severity, title: title(i) })),
    remaining: after.issues.filter((i) => beforeIds.has(i.id)).length,
  };
}
