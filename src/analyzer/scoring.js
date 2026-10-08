// Transparent scoring (documented in docs/SCORING.md).
//
// Each category starts at 100. Every failed check removes points:
//   critical = 30, warning = 12, info = 4
// For checks evaluated page by page, the penalty is scaled by how many pages
// are affected: factor = 0.5 + 0.5 × (affected pages / crawled pages).
// Example: a warning on 2 of 10 pages costs 12 × (0.5 + 0.5 × 0.2) = 7.2 points.
// Overall score = weighted average of the category scores.

import { CATALOG, CATEGORIES } from './catalog.js';

export const PENALTY = { critical: 30, warning: 12, info: 4 };
export const CATEGORY_WEIGHTS = { seo: 0.3, performance: 0.2, accessibility: 0.2, technical: 0.2, content: 0.1 };

export function penaltyFor(result) {
  const severity = result.severity || CATALOG[result.id]?.severity || 'info';
  const factor = result.scope === 'page' ? 0.5 + 0.5 * Math.min(1, result.ratio || 0) : 1;
  return Math.round(PENALTY[severity] * factor * 10) / 10;
}

export function scoreResults(results) {
  const categories = Object.fromEntries(CATEGORIES.map((c) => [c, { score: 100, failed: 0, passed: 0, penalty: 0 }]));
  const issues = [];
  const passed = [];

  for (const r of results) {
    const meta = CATALOG[r.id];
    if (!meta) throw new Error(`Unknown check id: ${r.id}`);
    const category = meta.category;
    const severity = r.severity || meta.severity;
    if (r.failed) {
      const penalty = penaltyFor({ ...r, severity });
      categories[category].penalty += penalty;
      categories[category].failed += 1;
      issues.push({
        id: r.id,
        category,
        severity,
        scope: r.scope,
        count: r.count,
        ratio: Math.round((r.ratio || 0) * 100) / 100,
        penalty,
        values: { count: r.count, ...(r.values || {}) },
        affected: r.affected || [],
      });
    } else {
      categories[category].passed += 1;
      passed.push({ id: r.id, category });
    }
  }

  for (const c of CATEGORIES) {
    categories[c].score = Math.max(0, Math.round(100 - categories[c].penalty));
    categories[c].penalty = Math.round(categories[c].penalty * 10) / 10;
  }
  const overall = Math.round(CATEGORIES.reduce((sum, c) => sum + categories[c].score * CATEGORY_WEIGHTS[c], 0));

  const order = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.penalty - a.penalty);
  return { overall, categories, issues, passed };
}

export function grade(score) {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'needs-work';
  return 'poor';
}
