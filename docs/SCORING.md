# Scoring

The score is designed to be **explainable**: every point lost comes from a named check you can fix.

## 1. Severity and penalty

| Severity | Penalty | Meaning |
| --- | --- | --- |
| critical | 25 | Blocks indexing, security or usage (no HTTPS, robots.txt blocks all, broken internal links, missing title…) |
| warning | 10 | Clear negative impact (heavy images, missing meta description, no viewport…) |
| info | 3 | Improvement opportunity (structured data, lazy loading…) |

Some checks raise their own severity: slow server response > 1.8 s and `noindex` on the homepage become critical.

## 2. Pages affected

For checks evaluated page by page: `penalty × (0.5 + 0.5 × affected_pages / crawled_pages)`.
Example: a warning on 2 of 10 pages costs `10 × (0.5 + 0.5 × 0.2) = 6` points.

## 3. Category score

`category = 100 × Π (1 − penalty_i / 100)` over the failed checks of the category.
Example: 1 critical + 1 warning = `100 × 0.75 × 0.90 = 67.5 → 68`.
Multiplying gives diminishing returns: the score falls quickly with the first serious problems but never collapses to 0 because of many small ones.

## 4. Overall score

| Category | Weight |
| --- | --- |
| SEO | 30 % |
| Performance | 20 % |
| Accessibility | 20 % |
| Technical | 20 % |
| Content | 10 % |

## 5. Grades

90–100 excellent · 75–89 good · 50–74 needs work · 0–49 poor.

## Source of truth

`src/analyzer/scoring.js` (formula), `src/analyzer/checks.js` (rules and thresholds in `LIMITS`), `src/analyzer/catalog.js` (severity per check). The public page `/how-scoring-works` is generated from the same code, so documentation and behaviour cannot drift apart.
