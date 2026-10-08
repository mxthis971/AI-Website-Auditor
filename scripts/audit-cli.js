#!/usr/bin/env node
// Command-line audit:  npm run audit:cli -- https://example.com [--json] [--lang=fr]
import { runAudit } from '../src/audit.js';
import { loadConfig } from '../src/config.js';
import { buildView } from '../src/report/view.js';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const lang = args.find((a) => a.startsWith('--lang='))?.split('=')[1] || 'en';
if (!url) {
  console.error('Usage: npm run audit:cli -- <url> [--json] [--lang=fr]');
  process.exit(1);
}

try {
  const report = await runAudit(url, { config: loadConfig(), onProgress: (p) => process.stderr.write(`\r${p.phase} ${p.pagesCrawled ?? ''}      `) });
  process.stderr.write('\n');
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const view = buildView(report, { lang, full: true });
    console.log(`\n${view.url}\nOverall: ${view.score.overall}/100`);
    for (const c of view.score.categories) console.log(`  ${c.label.padEnd(15)} ${String(c.score).padStart(3)}`);
    console.log(`\n${view.summary}\n`);
    for (const i of view.issues) console.log(`[${i.severity.toUpperCase()}] ${i.title}`);
  }
} catch (err) {
  console.error(`\nAudit failed: ${err.message}`);
  process.exit(2);
}
