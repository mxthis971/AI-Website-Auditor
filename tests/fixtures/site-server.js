// A fake website served on 127.0.0.1 for tests. Each route simulates a
// situation the auditor must handle (missing H1, broken links, redirects,
// slow responses, heavy images, multilingual pages…).

import http from 'node:http';
import zlib from 'node:zlib';

const page = ({ title = 'Fixture page title for tests', description = 'A meta description that is long enough to pass the length check, around eighty chars.', body = '', head = '', lang = 'en' } = {}) => `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${title === null ? '' : `<title>${title}</title>`}
${description === null ? '' : `<meta name="description" content="${description}">`}
${head}
</head><body>${body}</body></html>`;

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

export function defaultRoutes() {
  return {
    '/': () => ({
      body: page({
        head: '<link rel="canonical" href="/"><meta property="og:title" content="Home"><meta property="og:description" content="Desc"><link rel="icon" href="/favicon.ico"><script src="/blocking.js"></script>',
        body: `<h1>Welcome</h1><h2>Section</h2><p>${words(260)}</p>
          <a href="/about">About</a> <a href="/no-h1">No H1</a> <a href="/multi-h1">Multi</a>
          <a href="/missing-page">Broken</a> <a href="/redirect-1">Redirected</a> <a href="/privacy">Privacy policy</a>
          <a href="/fr/">Français</a>
          <img src="/big.jpg" alt="Big"> <img src="/small.png">
          <form><input type="text" name="q"></form>`,
      }),
    }),
    '/about': () => ({ body: page({ title: 'About us | Fixture', head: '<link rel="canonical" href="/about">', body: `<h1>About</h1><h4>Skipped level</h4><p>${words(250)}</p><a href="/">Home</a>` }) }),
    '/no-h1': () => ({ body: page({ title: null, description: null, body: `<p>${words(50)}</p><p>lorem ipsum dolor sit amet</p>` }) }),
    '/multi-h1': () => ({ body: page({ title: 'Multi H1 page | Fixture', body: `<h1>One</h1><h1>Two</h1><p>${words(220)}</p>` }) }),
    '/privacy': () => ({ body: page({ title: 'Privacy policy | Fixture', body: `<h1>Privacy</h1><p>${words(230)}</p>` }) }),
    '/fr/': () => ({
      body: page({
        lang: 'fr',
        title: 'Accueil en français | Fixture',
        head: '<link rel="alternate" hreflang="fr" href="/fr/"><link rel="alternate" hreflang="en-UK" href="/"><link rel="alternate" hreflang="english" href="/">',
        body: `<h1>Bienvenue</h1><p>${words(230)}</p>`,
      }),
    }),
    '/redirect-1': () => ({ status: 301, headers: { location: '/redirect-2' } }),
    '/redirect-2': () => ({ status: 302, headers: { location: '/about' } }),
    '/blocking.js': () => ({ body: `console.log(1);${' '.repeat(3000)}`, headers: { 'content-type': 'application/javascript' } }),
    '/big.jpg': () => ({ body: Buffer.alloc(400 * 1024, 1), headers: { 'content-type': 'image/jpeg' } }),
    '/small.png': () => ({ body: Buffer.alloc(2 * 1024, 1), headers: { 'content-type': 'image/png', 'cache-control': 'max-age=31536000' } }),
    '/favicon.ico': () => ({ body: Buffer.alloc(100), headers: { 'content-type': 'image/x-icon' } }),
    '/robots.txt': () => ({ body: 'User-agent: *\nDisallow: /private\n', headers: { 'content-type': 'text/plain' } }),
    '/sitemap.xml': () => ({ body: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>/about</loc></url></urlset>', headers: { 'content-type': 'application/xml' } }),
  };
}

/**
 * Starts the fixture server. `routes` maps a path to a function returning
 * { status, headers, body, delayMs, gzip }. Unknown paths return 404.
 */
export function startSite(routes = defaultRoutes()) {
  const hits = [];
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    hits.push({ method: req.method, path, ua: req.headers['user-agent'] });
    const route = routes[path];
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/html' });
      return res.end('<html><body>Not found</body></html>');
    }
    const r = route(req) || {};
    if (r.delayMs) await new Promise((resolve) => setTimeout(resolve, r.delayMs));
    let body = r.body ?? '';
    const headers = { 'content-type': 'text/html; charset=utf-8', ...(r.headers || {}) };
    if (r.gzip) {
      body = zlib.gzipSync(body);
      headers['content-encoding'] = 'gzip';
    }
    if (r.stream) {
      // Endless body: used to test the max size limit.
      res.writeHead(r.status || 200, headers);
      const chunk = Buffer.alloc(64 * 1024, 97);
      const timer = setInterval(() => {
        if (!res.write(chunk)) return;
      }, 1);
      res.on('close', () => clearInterval(timer));
      return;
    }
    headers['content-length'] = Buffer.byteLength(body);
    res.writeHead(r.status || 200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        hits,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
      });
    });
  });
}
