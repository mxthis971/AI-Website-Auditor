# Security

The product fetches arbitrary URLs supplied by anonymous users. That is the classic setup for **SSRF** (Server-Side Request Forgery): tricking the server into requesting internal resources. Defences, in order:

| Threat | Defence | Code |
| --- | --- | --- |
| Non-web protocols (`file:`, `ftp:`, `javascript:`, `gopher:`) | Only `http:`/`https:` accepted | `url-guard.js` |
| Internal ports (SSH, databases) | Only ports 80/443 | `url-guard.js` |
| `localhost`, `.local`, `.internal`, single-label hosts | Hostname blocklist | `url-guard.js` |
| Private / loopback / link-local / CGNAT / multicast / reserved IPv4 | `net.BlockList` of all special ranges (incl. cloud metadata `169.254.169.254`, `100.100.100.200`) | `url-guard.js` |
| IPv6 tricks (`::1`, `fe80::`, `fc00::`, IPv4-mapped `::ffff:127.0.0.1`, 6to4, Teredo) | IPv6 allow-list: only global unicast `2000::/3` minus tunnelling ranges; mapped addresses judged as IPv4 | `url-guard.js` |
| Decimal/hex/octal IPs (`http://2130706433`) | WHATWG URL parser normalises them, then they are blocked | tested |
| Domain resolving to a private IP | Custom DNS lookup refuses if **any** record is private | `safe-fetch.js` |
| DNS rebinding (check public, then connect private) | The socket connects to the exact IP our lookup validated (no second resolution) | `safe-fetch.js` |
| Redirect to an internal target | Redirects followed manually; every hop re-validated; loops detected; max 5 | `safe-fetch.js` |
| Credentials in URL | Rejected | `url-guard.js` |
| Huge responses / zip bombs | Max 3 MB transferred, max 12 MB after decompression | `safe-fetch.js` |
| Slow servers (slowloris) | Per-request timeout and global audit deadline | `crawler.js` |
| Infinite crawl / traps | Max pages, max depth, de-duplication, tracking params stripped, non-HTML skipped | `crawler.js` |
| Abuse / resource exhaustion | Per-IP rate limits, max concurrent audits, bounded queue (503 when full), bounded link/asset checks | `server.js`, `jobs.js` |
| XSS from audited content | Browser renders all API text with `textContent`; server escapes HTML; strict CSP without inline scripts | `app.js`, `layout.js` |
| Prompt injection via website content | Site text sent to the AI is marked as untrusted data; output constrained by JSON schema; unknown ids dropped | `ai/summary.js` |
| Fake payment notifications | Stripe webhook HMAC signature verified with timing-safe compare and 5-minute replay window | `payments/stripe.js` |
| Unlocking someone else's report | Access key is random, stored hashed; claim checks the Stripe session belongs to that report | `server.js` |
| Secrets in Git | Only `.env.example` is committed; `.env` is git-ignored; secrets live in the host's environment settings | `.gitignore` |

`ALLOW_PRIVATE_NETWORKS` exists only for local development and tests. Never set it in production.

All of the above is covered by automated tests (`tests/url-guard.test.js`, `tests/safe-fetch.test.js`, `tests/audit.test.js`, `tests/api.test.js`).

## Reporting a vulnerability

Please open a private security advisory on GitHub rather than a public issue.
