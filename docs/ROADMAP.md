# Roadmap

Status legend: ✅ done · 🟡 code ready, needs configuration · ⬜ to do

## V1 – Free audit (MVP) ✅
Crawler, 60+ checks, scoring, web report, share link, PDF via print, 8 free tools, EN/FR, SSRF protections, tests, CI.

## V1.1 – Premium report 🟡
Stripe one-time payment, server-side gating, AI action plan. Needs: Stripe + Anthropic keys, persistent database (paid instance or hosted DB).
- ⬜ Server-generated PDF (e.g. via a PDF service) if "print to PDF" is not enough for buyers.

## V1.2 – Accounts ⬜
Email magic-link login (no passwords). Needs a transactional email provider (e.g. Resend / Brevo free tiers). Attach reports to an account.

## V1.3 – Monitoring ⬜
Stripe subscription (Checkout `mode=subscription`, webhooks `customer.subscription.*` for activation, renewal, cancellation). Scheduled audits (cron), score history and comparison, several sites.

## V1.4 – Alerts ⬜
Emails: audit finished, report available, new problem detected, subscription confirmation. One-click unsubscribe in every email, preference page. No marketing emails without explicit opt-in.

## V1.5 – Better AI recommendations ⬜
Page-specific suggestions (titles, descriptions, alt text) with "Generate" buttons.

## V2 – Automatic fixes ⬜
"Generate better title" → preview → "Apply" for compatible platforms (WordPress plugin / Shopify app). Always ask for confirmation.

## V2.1 – Public API ⬜ · V2.2 – CLI ✅ (basic: `npm run audit:cli`) · V2.3 – Browser extension ⬜

## V3 – GitHub / CI integration ⬜
GitHub Action that audits a preview deployment and comments on the pull request.

## Technical debt to address before growth
- Move SQLite to a persistent/hosted database.
- Move the in-process queue to a shared queue if running several instances.
- Translate API error messages (currently English only).
- Headless-browser checks (colour contrast, JavaScript-rendered content) on a separate worker.
