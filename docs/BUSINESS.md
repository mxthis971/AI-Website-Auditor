# Business model

**No revenue is guaranteed.** This document describes the plan to test demand cheaply, not a forecast.

## Funnel

```
Google (tools, FR/EN pages) · GitHub · shared reports
        ↓
Free audit (no signup)
        ↓
Value shown: score, issues, 5 fully explained fixes
        ↓
Full report (one-time)          ← V1.1
        ↓
Pro monitoring (subscription)   ← V1.3
```

## Offers

| Offer | Price (proposal) | Content |
| --- | --- | --- |
| Free | €0 | Scores, all issues listed, 5 issues fully explained, share link |
| Full report | €7.90 one-time | All explanations + affected URLs, AI action plan, full roadmap, PDF |
| Pro monitoring | €14/month (later) | Weekly audits, history, alerts, several sites |

### Why these prices
- Established tools sell subscriptions: e.g. SEOptimer lists $29/month (DIY) to $59/month (white label & embedding) on https://www.seoptimer.com/pricing (checked October 2026). Large suites (Semrush, Ahrefs) cost far more.
- A **one-time** report at €7.90 targets small business owners and freelancers who need one diagnosis, not a subscription. It sits in the €4.90–9.90 range of the brief, high enough to cover Stripe fees (EU cards: about 1.5% + €0.25) and AI cost.
- €14/month for monitoring stays well under the main competitors while being sustainable.
- Decide the final price from data: count `checkout_clicks` / `interest_*` in `/api/metrics`, then A/B test €4.90 vs €7.90 vs €9.90 once payments are live.

## Costs

| Item | Now | With growth |
| --- | --- | --- |
| Hosting | €0 (Render free) | ~$7/month (Starter + disk) then ~$25/month for more RAM/instances |
| Database | €0 (SQLite) | €0–19/month (Neon/Supabase/Turso free → paid tiers) |
| Domain | €0 (onrender.com subdomain) | ~€10/year for a .com |
| PageSpeed API | €0 (free quota) | €0 (quota is generous; cache results) |
| AI (optional) | €0 (off) | Pay per use. Cost depends on the model (`AI_MODEL`): the default `claude-opus-5-5` costs $4 / $20 per million input/output tokens; a summary is roughly 3–5k input + 1–2k output tokens. Generated only on demand for full reports and cached. Choose a cheaper model and set a spend limit in the Anthropic console if needed. |
| Stripe | €0 fixed | ~1.5% + €0.25 per EU card payment |
| Email (V1.4) | – | €0 on free tiers up to a few thousand emails/month |

## Metrics to watch (all available in `/api/metrics`)
- audits requested per day (acquisition), error rate, average duration
- tool usage per tool (which SEO pages bring people)
- checkout clicks / interest clicks per offer (demand before building)
- payments completed (conversion)

## Rules
- No dark patterns: no fake timers, no hidden subscription, cancel anytime, clear prices.
- No spam: transactional emails only, unsubscribe link everywhere, marketing only with opt-in.
- Legal pages are drafts: have them reviewed before charging (France: mentions légales, CGV, droit de rétractation for digital content, VAT).
