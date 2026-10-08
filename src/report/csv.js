// CSV export of a report: one row per issue and affected URL, for a developer
// or a spreadsheet. ";" for French (Excel FR), "," otherwise. A UTF-8 BOM makes
// Excel read accents correctly.

const HEAD = {
  en: ['Severity', 'Category', 'Issue', 'URL', 'Detail', 'How to fix'],
  fr: ['Gravité', 'Catégorie', 'Problème', 'URL', 'Détail', 'Correction'],
};

// A cell starting with = + - @ would run as a formula in a spreadsheet
// (CSV injection): a website title is attacker-controlled text.
const safe = (v) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

export function reportToCsv(view, { severityLabels }) {
  const sep = view.lang === 'fr' ? ';' : ',';
  const cell = (v) => {
    const s = safe(v);
    return /["\n;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [HEAD[view.lang] || HEAD.en];
  for (const issue of view.issues) {
    const base = [severityLabels[issue.severity] || issue.severity, issue.categoryLabel, issue.title];
    const affected = issue.affected?.length ? issue.affected : [{ url: '', detail: '' }];
    for (const a of affected) rows.push([...base, a.url, a.detail || '', issue.fix || '']);
  }
  return '﻿' + rows.map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}
