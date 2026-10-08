# Deployment

## Option A (recommended to start): Render, free plan, Docker

What you get for €0: HTTPS URL `https://<name>.onrender.com`, auto-deploy on every push to `main`, health checks.

Free-plan limits (Render docs, checked October 2026, see https://render.com/docs/free):
- the service **sleeps after 15 minutes without traffic**; the next visitor waits about a minute;
- 750 instance hours per month per workspace;
- **ephemeral disk**: the SQLite database is wiped on every redeploy/restart/sleep, so shared report links stop working after a while;
- Render says free instances are for testing and hobby projects, not production;
- outbound bandwidth on the free Hobby workspace is small (5 GB/month after Render's August 2026 plan change, overage billed).

This is fine to put the MVP online and test demand. Before selling reports, move to a paid instance (Render Starter, about $7/month) with a persistent disk, or plug a hosted database.

Steps:
1. Create an account at https://render.com (sign in with GitHub).
2. **New → Blueprint**, pick the `AI-Website-Auditor` repository. Render reads `render.yaml`.
3. Fill the asked variables:
   - `PUBLIC_BASE_URL` = the URL Render gives you (e.g. `https://ai-website-auditor.onrender.com`), without trailing slash.
   - leave the optional keys empty for now.
4. Deploy. Check `https://<your-url>/api/health` returns `{"ok":true}`.
5. Run an audit on a site you own.

## Option B: any Docker host / VPS

```bash
docker build -t ai-website-auditor .
docker run -d -p 3000:3000 -v auditor-data:/app/data \
  -e PUBLIC_BASE_URL=https://your-domain.com \
  -e METRICS_TOKEN=$(openssl rand -hex 16) \
  ai-website-auditor
```

The volume `/app/data` keeps the database across restarts. Put a reverse proxy with HTTPS in front (Caddy does it automatically).

## Turning on optional features

Set these in the host's environment settings (Render: service → Environment). Never in Git.

| Feature | What to do | Variables |
| --- | --- | --- |
| Core Web Vitals + Lighthouse | Google Cloud Console → enable "PageSpeed Insights API" → create an API key (free quota) | `PAGESPEED_API_KEY` |
| AI action plan | https://console.anthropic.com → API key (paid per use, set a monthly spend limit) | `ANTHROPIC_API_KEY`, optionally `AI_MODEL` |
| Paid full report | Stripe account → create a product "Full website report" with a one-time price → copy the price id; create a webhook endpoint `https://<your-url>/api/stripe/webhook` with event `checkout.session.completed` → copy the signing secret; copy the secret key | `STRIPE_SECRET_KEY`, `STRIPE_REPORT_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` |
| Metrics | any long random string | `METRICS_TOKEN` |

Payments only activate when all three Stripe variables are set. Until then, full reports are free ("beta mode") and clicks on paid offers are counted in `/api/metrics` to measure demand.

Use Stripe **test mode** keys first and pay with card `4242 4242 4242 4242`.

## After deployment

1. Add the domain in Google Search Console and submit `https://<your-url>/sitemap.xml`.
2. Same in Bing Webmaster Tools.
3. Update the "Cloud version" link in README.md.
4. Complete the placeholders in the legal pages (`src/web/legal.js`).
