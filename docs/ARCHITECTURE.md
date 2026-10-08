# Architecture

## Why this stack

| Need | Choice | Why (vs alternatives) |
| --- | --- | --- |
| Runtime | Node.js 22 | One language for server and browser; built-in `fetch`, `node:test`, `node:sqlite`. |
| HTTP server | Fastify 5 | Fast, small, good plugins (rate limit, static). Express is slower and older; a framework like Next.js adds a build step we don't need. |
| HTML parsing | Cheerio | jQuery-like API on a real HTML5 parser; no browser needed. A headless browser (Playwright) would be more complete but needs ~1 GB RAM: impossible on free hosting. |
| Storage | SQLite via `node:sqlite` | Zero dependency, one file. Postgres (Neon/Supabase free tiers) is the migration path; the `Store` class is the only place to change. |
| Frontend | Server-rendered HTML + vanilla JS | Instant pages, perfect for SEO, nothing to build. React/Next would add weight for little gain at this stage. |
| Hosting | Docker on Render free tier | Commercial use allowed, deploys from GitHub, HTTPS included. Vercel Hobby forbids commercial use; Cloudflare Workers' free CPU limit (10 ms) is too short to parse HTML. The Dockerfile runs anywhere (Koyeb, Fly.io, a VPS). |

## Request flow

```
POST /api/audits {url}
  → parseAuditUrl()          validate + normalise, reject private/unsafe targets
  → Store.createReport()     id + owner key (hash stored)
  → AuditQueue.enqueue()     max 2 audits in parallel, max 20 waiting
  ← 202 {id, ownerKey}

Browser opens /r/<id> and polls GET /api/audits/<id> (progress)

AuditQueue → runAudit()
  ├─ runPagespeed()  (optional, parallel, on Google's servers)
  └─ crawlSite()
       1. homepage (safeFetch)            → fails fast with a clear message
       2. robots.txt + sitemap.xml
       3. BFS crawl of internal pages     (max pages, max depth, robots.txt respected)
       4. link checks                     (HEAD, GET fallback, max 60)
       5. homepage assets weight          (max 40)
       6. http → https redirect check
  → runChecks()   deterministic rules → failed/passed + affected URLs
  → scoreResults() category + overall scores
  → Store.saveResult()

GET /api/reports/<id>?lang=fr → buildView(): localised texts, summary, roadmap, gating
```

## Design rules

1. **Facts, rules and texts are separate.** `page.js` extracts facts, `checks.js` decides, `catalog.js` explains. Each is testable alone.
2. **AI never measures.** It receives computed findings and returns explanations validated against a JSON schema; unknown issue ids are dropped.
3. **Gating happens on the server.** Locked details are never sent to the browser.
4. **Everything is bounded**: pages, depth, time, bytes, redirects, concurrency, queue, requests per IP.

## Data model (SQLite)

`reports(id, url, lang, status, progress, data JSON, error, ai JSON, owner_key_hash, access_key_hash, paid, stripe_session, duration_ms, pages_crawled, created_at, updated_at)`
`counters(name, value)`: anonymous counters (audits requested, tool usage, checkout clicks, interest clicks).

## Observability

- Structured JSON logs (pino) without IP addresses: audit done/failed with duration, pages and score.
- `GET /api/metrics` (Bearer `METRICS_TOKEN`): uptime, memory, queue, audits in the last 24 h and all time (count, error rate, average duration, pages crawled, paid), counters.
- `GET /api/health` for the hosting health check.

## Known limits

- In-process queue: one server instance only (fine for the free tier). To scale: move jobs to a queue (e.g. a `jobs` table polled by workers, or Redis).
- Render free disk is ephemeral: the SQLite file is lost on redeploy/restart. Move to a hosted database before relying on paid reports (see ROADMAP).
- No JavaScript rendering: content injected only by JavaScript is invisible to the crawler (like many crawlers). Core Web Vitals come from PageSpeed when a key is set.
