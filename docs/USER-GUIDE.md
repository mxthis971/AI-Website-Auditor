# User guide

1. Open the home page, paste your website address (e.g. `example.com`) and click **Analyze website**.
2. You are taken to your report page. Keep it open: progress is shown live (usually 10–60 seconds).
3. Read the report from top to bottom:
   - **Score**: overall and per category. See "How scoring works" for the formula.
   - **Executive summary**: the situation in three sentences.
   - **Critical issues → Warnings → Suggestions**: click an issue to see why it matters, its impact, how to fix it, an example and the affected URLs.
   - **Priority roadmap**: the order in which to fix things.
   - **Passed checks**: what is already fine.
4. **Share**: "Copy share link" gives a public link to the report. Anyone with the link can see it.
5. **PDF**: "Download PDF" opens the print dialog; choose "Save as PDF".
6. **Delete**: only the browser that ran the audit sees "Delete this report" (it keeps a private key). Reports are deleted automatically after 30 days anyway.

## Why did my audit fail?

| Message | Meaning |
| --- | --- |
| Domain not found | Typo in the address or the domain has no DNS record. |
| Took too long to respond | The homepage did not answer within 10 seconds. |
| Invalid SSL certificate | Browsers also show a warning; fix the certificate. |
| Private or local network | We only audit public websites. |
| HTTP 4xx/5xx | The homepage returns an error, so there is nothing to analyse. |

## Limits

Up to 10 pages, depth 2, homepage resources measured, JavaScript is not executed. Pages blocked by robots.txt are not crawled (except the address you submit).
