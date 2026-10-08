// Front-end logic: no framework, no build step.
// Every piece of text coming from the API is inserted with textContent
// (never innerHTML), so a malicious website title cannot inject HTML/JS.
(function () {
  'use strict';

  var data = JSON.parse(document.getElementById('page-data').textContent);
  var ui = data.ui;
  var lang = data.lang;

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v; // CSSOM: allowed by our strict CSP
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) return child.forEach(function (c) { append(el, c); });
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { return null; }
  }
  function api(method, url, body, headers) {
    return fetch(url, {
      method: method,
      headers: Object.assign(body ? { 'content-type': 'application/json' } : {}, headers || {}),
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error((json.error && json.error.message) || ui.errorGeneric);
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }
  function fmtBytes(b) {
    if (!b && b !== 0) return '–';
    return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  }
  function scoreClass(s) { return s >= 90 ? 'good' : s >= 50 ? 'ok' : 'bad'; }

  // ------------------------------------------------------------------ form
  var form = document.querySelector('.audit-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input');
      var errorEl = form.querySelector('.form-error');
      var button = form.querySelector('button');
      var url = input.value.trim();
      errorEl.hidden = true;
      if (!url) { input.focus(); return; }
      button.disabled = true;
      var tool = form.getAttribute('data-tool');
      if (tool) return runTool(tool, url, form, button);
      api('POST', '/api/audits', { url: url, lang: lang })
        .then(function (res) {
          store('owner:' + res.id, res.ownerKey);
          window.location.href = res.reportUrl + (lang === 'fr' ? '?lang=fr' : '');
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          button.disabled = false;
        });
    });
  }

  // ------------------------------------------------------------- progress
  function progressText(p) {
    if (!p) return ui.progress.starting;
    var t = ui.progress[p.phase] || ui.progress.starting;
    return t.replace('{n}', p.pagesCrawled || 0).replace('{max}', p.maxPages || '');
  }

  // --------------------------------------------------------------- report
  var reportRoot = document.getElementById('report');
  if (data.page === 'report' && reportRoot) {
    var id = data.reportId;
    var params = new URLSearchParams(window.location.search);
    var sessionId = params.get('session_id');
    var claim = sessionId
      ? api('POST', '/api/reports/' + id + '/claim', { sessionId: sessionId }).then(function (r) {
          store('access:' + id, r.accessKey);
          history.replaceState(null, '', window.location.pathname + (lang === 'fr' ? '?lang=fr' : ''));
        }).catch(function () {})
      : Promise.resolve();
    claim.then(function () { poll(id); });
  }

  function poll(id) {
    api('GET', '/api/audits/' + id)
      .then(function (s) {
        if (s.status === 'done') return loadReport(id);
        if (s.status === 'failed') return showError(s.url, s.error && s.error.message);
        var text = reportRoot.querySelector('.progress-text');
        if (text) text.textContent = progressText(s.progress);
        setTimeout(function () { poll(id); }, 1500);
      })
      .catch(function (err) { showError(null, err.message); });
  }

  function showError(url, message) {
    reportRoot.textContent = '';
    append(reportRoot, h('div', { class: 'card error-card' },
      h('h1', { class: 'h2', text: url || ui.errorGeneric }),
      h('p', { text: message || ui.errorGeneric }),
      h('a', { class: 'button', href: lang === 'fr' ? '/fr/' : '/', text: ui.report.newAudit })));
  }

  function loadReport(id) {
    var key = store('access:' + id) || '';
    return api('GET', '/api/reports/' + id + '?lang=' + lang + (key ? '&key=' + encodeURIComponent(key) : ''))
      .then(function (r) { renderReport(id, r, key); })
      .catch(function (err) { showError(null, err.message); });
  }

  function scoreRing(score, grade) {
    var r = 54, c = 2 * Math.PI * r;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('class', 'ring ' + scoreClass(score));
    svg.setAttribute('aria-hidden', 'true');
    [['track', c], ['value', c * (1 - score / 100)]].forEach(function (pair) {
      var circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', '60'); circle.setAttribute('cy', '60'); circle.setAttribute('r', String(r));
      circle.setAttribute('class', pair[0]);
      circle.setAttribute('stroke-dasharray', String(c));
      circle.setAttribute('stroke-dashoffset', String(pair[0] === 'track' ? 0 : pair[1]));
      svg.appendChild(circle);
    });
    return h('div', { class: 'score-ring', role: 'img', 'aria-label': score + '/100' }, svg,
      h('div', { class: 'score-value' }, h('strong', { text: String(score) }), h('span', { text: '/100' })),
      h('p', { class: 'grade ' + scoreClass(score), text: ui.report.grade[grade] }));
  }

  function issueCard(issue) {
    var head = [
      h('span', { class: 'badge ' + issue.severity, text: issue.categoryLabel }),
      h('span', { class: 'issue-title', text: issue.title }),
    ];
    if (issue.locked) {
      return h('div', { class: 'issue locked' }, h('div', { class: 'issue-head' }, head, h('span', { class: 'lock', title: ui.report.locked, text: '🔒' })), h('p', { class: 'muted small', text: ui.report.locked }));
    }
    var summary = h('summary', null, head);
    var body = h('div', { class: 'issue-body' },
      h('h4', { text: ui.report.why }), h('p', { text: issue.explanation }),
      h('h4', { text: ui.report.impact }), h('p', { text: issue.impact }),
      h('h4', { text: ui.report.fix }), h('p', { text: issue.fix }),
      issue.example ? [h('h4', { text: ui.report.example }), h('pre', null, h('code', { text: issue.example }))] : null,
      issue.affected && issue.affected.length ? [
        h('h4', { text: ui.report.affected + ' (' + issue.count + ')' }),
        h('ul', { class: 'affected' }, issue.affected.map(function (a) {
          return h('li', null, h('a', { href: a.url, rel: 'nofollow noopener', target: '_blank', text: a.url }), a.detail ? h('span', { class: 'muted', text: ' — ' + a.detail }) : null);
        })),
      ] : null);
    return h('details', { class: 'issue' }, summary, body);
  }

  function renderReport(id, r, key) {
    document.title = new URL(r.url).hostname + ' · ' + r.score.overall + '/100 · ' + ui.report.title;
    reportRoot.textContent = '';
    var ownerKey = store('owner:' + id);
    var date = new Date(r.createdAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    var header = h('div', { class: 'report-header' },
      h('div', null,
        h('p', { class: 'eyebrow', text: ui.report.title }),
        h('h1', { class: 'h2 break', text: r.url }),
        h('p', { class: 'muted small', text: date })),
      h('div', { class: 'actions no-print' },
        h('button', { class: 'button secondary', onclick: function (e) { copyLink(e.target, id); }, text: ui.report.share }),
        h('button', { class: 'button secondary', onclick: function () { window.print(); }, text: ui.report.pdf })));

    var categories = h('div', { class: 'categories' }, r.score.categories.map(function (c) {
      return h('div', { class: 'category' },
        h('div', { class: 'category-head' }, h('span', { text: c.label }), h('strong', { class: scoreClass(c.score), text: String(c.score) })),
        h('div', { class: 'bar' }, h('span', { class: 'fill ' + scoreClass(c.score), style: 'width:' + c.score + '%' })));
    }));

    var stats = h('div', { class: 'stats' },
      stat(r.stats.pagesCrawled, ui.report.stats.pages),
      stat(r.stats.linksChecked, ui.report.stats.links),
      stat(fmtBytes(r.stats.homepageWeightBytes), ui.report.stats.weight),
      stat((r.stats.ttfbMs || 0) + ' ms', ui.report.stats.ttfb));

    append(reportRoot, [
      header,
      r.partial ? h('p', { class: 'notice', text: ui.report.partial }) : null,
      h('div', { class: 'score-panel card' }, scoreRing(r.score.overall, r.score.grade), h('div', { class: 'score-side' }, h('p', { class: 'eyebrow', text: ui.report.yourScore }), categories)),
      stats,
      h('section', { class: 'card' }, h('h2', { class: 'h3', text: ui.report.summary }), h('p', { text: r.summary })),
      aiSection(id, r, key),
      cwvSection(r),
    ]);

    [['critical', ui.report.critical], ['warning', ui.report.warning], ['info', ui.report.info]].forEach(function (group) {
      var items = r.issues.filter(function (i) { return i.severity === group[0]; });
      if (!items.length) return;
      append(reportRoot, h('section', { class: 'issues' }, h('h2', { class: 'h3' }, h('span', { class: 'dot ' + group[0] }), group[1] + ' (' + items.length + ')'), items.map(issueCard)));
    });

    if (r.lockedCount > 0) append(reportRoot, unlockBox(id));

    append(reportRoot, [
      h('section', { class: 'card' }, h('h2', { class: 'h3', text: ui.report.roadmap }), r.roadmap.map(function (g) {
        return h('div', { class: 'roadmap-group' }, h('h3', { class: 'h4', text: g.label }), h('ol', null, g.items.map(function (t) { return h('li', { text: t }); }), g.more ? h('li', { class: 'muted', text: '+ ' + g.more + '…' }) : null));
      })),
      h('details', { class: 'card passed' }, h('summary', null, h('span', { class: 'dot pass' }), ui.report.passed + ' (' + r.counts.passed + ')'), h('ul', { class: 'checklist' }, r.passed.map(function (p) { return h('li', { text: p.label }); }))),
      h('details', { class: 'card' }, h('summary', { text: ui.report.pages + ' (' + r.stats.pagesCrawled + ')' }), h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, ['URL', 'HTTP', 'Title', 'Words', 'TTFB'].map(function (t) { return h('th', { text: t }); }))),
        h('tbody', null, r.pages.map(function (p) {
          return h('tr', null, h('td', { class: 'break', text: p.url }), h('td', { text: String(p.status || p.error || '–') }), h('td', { text: p.title || '–' }), h('td', { text: p.wordCount == null ? '–' : String(p.wordCount) }), h('td', { text: p.ttfbMs == null ? '–' : p.ttfbMs + ' ms' }));
        }))))),
      h('section', { class: 'card cta-box no-print' }, h('h2', { class: 'h3', text: ui.report.monitorTitle }), h('p', { text: ui.report.monitorText }), interestButton('pro')),
      h('p', { class: 'center no-print' },
        h('a', { class: 'button', href: lang === 'fr' ? '/fr/' : '/', text: ui.report.newAudit }),
        ownerKey ? h('button', { class: 'link-button', onclick: function () { deleteReport(id, ownerKey); }, text: ui.report.delete }) : null),
      h('p', { class: 'center muted small', text: ui.report.generatedBy }),
    ]);
  }

  function stat(value, label) { return h('div', { class: 'stat card' }, h('strong', { text: String(value) }), h('span', { class: 'muted small', text: label })); }

  function aiSection(id, r, key) {
    if (!r.aiEnabled || !r.full) return null;
    var box = h('section', { class: 'card ai-box' }, h('h2', { class: 'h3', text: '✨ ' + ui.report.aiTitle }));
    function render(ai) {
      box.textContent = '';
      append(box, [
        h('h2', { class: 'h3', text: '✨ ' + ui.report.aiTitle }),
        h('p', { text: ai.summary }),
        h('ol', null, ai.priorities.map(function (p) {
          return h('li', null, h('strong', { text: p.issueId }), h('p', { text: p.why }), h('ul', null, p.steps.map(function (s) { return h('li', { text: s }); })));
        })),
        ai.quickWins.length ? [h('h3', { class: 'h4', text: ui.report.quickWins }), h('ul', null, ai.quickWins.map(function (q) { return h('li', { text: q }); }))] : null,
        ai.suggestedTitle ? [h('h3', { class: 'h4', text: ui.report.suggestedTitle }), h('pre', null, h('code', { text: ai.suggestedTitle }))] : null,
        ai.suggestedDescription ? [h('h3', { class: 'h4', text: ui.report.suggestedDescription }), h('pre', null, h('code', { text: ai.suggestedDescription }))] : null,
        h('p', { class: 'muted small', text: 'AI · ' + ai.model }),
      ]);
    }
    if (r.ai) { render(r.ai); return box; }
    var button = h('button', { class: 'button', text: ui.report.aiButton, onclick: function () {
      button.disabled = true;
      button.textContent = ui.report.aiLoading;
      api('POST', '/api/reports/' + id + '/ai-summary', { lang: lang, key: key })
        .then(render)
        .catch(function (err) { button.disabled = false; button.textContent = ui.report.aiButton; append(box, h('p', { class: 'form-error', text: err.message })); });
    } });
    append(box, button);
    return box;
  }

  function cwvSection(r) {
    if (!r.pagespeed) return h('p', { class: 'muted small', text: ui.report.noCwv });
    var m = r.pagespeed.metrics;
    return h('section', { class: 'card' }, h('h2', { class: 'h3', text: ui.report.cwv }), h('div', { class: 'stats' },
      Object.keys(m).map(function (k) { return h('div', { class: 'stat' }, h('strong', { class: m[k].rating === 'good' ? 'good' : m[k].rating === 'poor' ? 'bad' : 'ok', text: m[k].display }), h('span', { class: 'muted small', text: k.toUpperCase() + ' · ' + m[k].source })); }),
      r.pagespeed.lighthouse.performance != null ? stat(r.pagespeed.lighthouse.performance, 'Lighthouse performance') : null));
  }

  function unlockBox(id) {
    var button;
    var box = h('section', { class: 'card cta-box no-print' }, h('h2', { class: 'h3', text: ui.report.unlockTitle }), h('p', { text: ui.report.unlockText }));
    button = h('button', { class: 'button', text: ui.report.unlockButton, onclick: function () {
      button.disabled = true;
      api('POST', '/api/reports/' + id + '/checkout', { lang: lang })
        .then(function (res) { window.location.href = res.checkoutUrl; })
        .catch(function (err) { button.disabled = false; append(box, h('p', { class: 'form-error', text: err.message })); });
    } });
    append(box, button);
    return box;
  }

  function interestButton(plan) {
    var b = h('button', { class: 'button secondary', 'data-interest': plan, text: ui.report.comingSoon });
    b.addEventListener('click', onInterest);
    return b;
  }
  function onInterest(e) {
    var b = e.currentTarget;
    b.disabled = true;
    api('POST', '/api/interest', { plan: b.getAttribute('data-interest') }).catch(function () {});
    b.textContent = ui.report.thanksInterest;
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-interest]'), function (b) { b.addEventListener('click', onInterest); });

  function copyLink(button, id) {
    var url = window.location.origin + '/r/' + id;
    var done = function () { button.textContent = ui.report.copied; };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt('', url); });
    else window.prompt('', url);
  }

  function deleteReport(id, ownerKey) {
    if (!window.confirm(ui.report.confirmDelete)) return;
    api('DELETE', '/api/reports/' + id, null, { 'x-owner-key': ownerKey }).then(function () {
      store('owner:' + id, null);
      store('access:' + id, null);
      reportRoot.textContent = '';
      append(reportRoot, h('div', { class: 'card center' }, h('p', { text: ui.report.deleted }), h('a', { class: 'button', href: lang === 'fr' ? '/fr/' : '/', text: ui.report.newAudit })));
    }).catch(function (err) { window.alert(err.message); });
  }

  // ----------------------------------------------------------------- tools
  function runTool(tool, url, form, button) {
    var progress = document.querySelector('.progress');
    var out = document.getElementById('tool-result');
    var errorEl = form.querySelector('.form-error');
    progress.hidden = false;
    progress.querySelector('.progress-text').textContent = ui.progress.fetching_homepage;
    api('POST', '/api/tools/' + tool, { url: url, lang: lang })
      .then(function (r) {
        out.textContent = '';
        out.hidden = false;
        var issues = r.issues.map(function (i) {
          return issueCard({ severity: i.severity, categoryLabel: i.severity, title: i.title, explanation: i.explanation, impact: i.impact, fix: i.fix, example: i.example, affected: i.affected, count: i.count });
        });
        append(out, [
          h('h2', { class: 'break', text: r.url }),
          issues.length ? h('section', { class: 'issues' }, issues) : h('p', { class: 'notice good-notice', text: '✓ ' + r.passed.length + ' / ' + r.passed.length }),
          h('details', { class: 'card passed', open: !issues.length }, h('summary', { text: ui.report.passed + ' (' + r.passed.length + ')' }), h('ul', { class: 'checklist' }, r.passed.map(function (p) { return h('li', { text: p.label }); }))),
          toolExtras(r),
          h('div', { class: 'cta-box card' }, h('p', { text: 'Want the full picture? Run a complete audit of this site.' }), h('a', { class: 'button', href: '/', text: 'Full website audit' })),
        ]);
        out.scrollIntoView({ behavior: 'smooth' });
      })
      .catch(function (err) { errorEl.textContent = err.message; errorEl.hidden = false; })
      .then(function () { progress.hidden = true; button.disabled = false; });
  }

  function toolExtras(r) {
    var hp = r.homepage;
    if (!hp) return null;
    if (data.showOutline) {
      return h('section', { class: 'card' }, h('h3', { text: 'Heading outline' }), h('ul', { class: 'outline' }, hp.headings.map(function (x) {
        return h('li', { class: 'lvl' + x.level }, h('span', { class: 'badge info', text: 'H' + x.level }), ' ', x.text || '(empty)');
      })));
    }
    if (data.showSocial) {
      return h('section', { class: 'card' }, h('h3', { text: 'Share preview' }), h('div', { class: 'social-card' },
        hp.og.image ? h('img', { src: hp.og.image, alt: '', loading: 'lazy' }) : h('div', { class: 'social-placeholder', text: 'No og:image' }),
        h('div', { class: 'social-text' }, h('small', { class: 'muted', text: new URL(r.url).hostname }), h('strong', { text: hp.og.title || hp.title || '(no title)' }), h('p', { class: 'small', text: hp.og.description || hp.description || '' }))));
    }
    if (data.showImages) {
      return h('section', { class: 'card' }, h('h3', { text: 'Images (' + hp.images.length + ')' }), h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { text: 'Image' }), h('th', { text: 'alt' }))),
        h('tbody', null, hp.images.map(function (i) { return h('tr', null, h('td', { class: 'break', text: i.src || '(inline)' }), h('td', { class: i.alt === null ? 'bad' : '', text: i.alt === null ? 'missing' : i.alt === '' ? '(empty: decorative)' : i.alt })); })))));
    }
    return null;
  }
})();
