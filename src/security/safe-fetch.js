// A hardened HTTP client for fetching untrusted, user-supplied URLs.
//
// Why not plain fetch()? Because we need control over things fetch hides:
//  1. DNS pinning: we resolve the hostname ourselves, reject private IPs and
//     connect to *that exact IP*. This defeats "DNS rebinding", where a domain
//     first resolves to a public IP (passes the check) and then to 127.0.0.1.
//  2. Redirects are followed manually so every hop is re-validated.
//  3. Hard limits: timeout, maximum body size, maximum redirects.

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import zlib from 'node:zlib';
import { assertSafeUrl, isBlockedIp, UnsafeUrlError } from './url-guard.js';

export class FetchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
  }
}

/** Builds a dns.lookup-compatible function that refuses private addresses. */
export function createSafeLookup({ allowPrivateNetworks = false, resolver = dns.lookup } = {}) {
  return function safeLookup(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    resolver(hostname, { all: true, family: options.family || 0 }, (err, addresses) => {
      if (err) return callback(err);
      const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
      if (list.length === 0) return callback(new FetchError('dns_failed', `No address for ${hostname}`));
      if (!allowPrivateNetworks && list.some((a) => isBlockedIp(a.address))) {
        // Refuse the whole host if ANY record is private: mixed records are a classic rebinding trick.
        return callback(new UnsafeUrlError('private_address', `${hostname} resolves to a private or reserved address.`));
      }
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

// maxOutputLength protects against "zip bombs" (1 MB that inflates to 1 GB).
function decompress(buffer, encoding, maxOutputLength) {
  const opts = { maxOutputLength, finishFlush: zlib.constants.Z_SYNC_FLUSH };
  try {
    switch ((encoding || '').toLowerCase().trim()) {
      case 'gzip':
      case 'x-gzip':
        return zlib.gunzipSync(buffer, opts);
      case 'deflate':
        try {
          return zlib.inflateSync(buffer, opts);
        } catch {
          return zlib.inflateRawSync(buffer, opts);
        }
      case 'br':
        return zlib.brotliDecompressSync(buffer, { maxOutputLength });
      default:
        return buffer;
    }
  } catch {
    return Buffer.alloc(0);
  }
}

function singleRequest(url, { method, headers, timeoutMs, maxBodyBytes, lookup, readBody }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const started = performance.now();
    let ttfbMs = null;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const req = lib.request(
      url,
      {
        method,
        headers,
        lookup,
        agent: false, // no connection reuse across hosts: keeps the DNS pinning simple
        timeout: timeoutMs,
      },
      (res) => {
        ttfbMs = Math.round(performance.now() - started);
        const chunks = [];
        let transferred = 0;
        let truncated = false;
        const done = () => {
          const raw = Buffer.concat(chunks);
          finish(resolve, {
            status: res.statusCode,
            headers: res.headers,
            body: raw,
            transferBytes: transferred,
            truncated,
            ttfbMs,
            totalMs: Math.round(performance.now() - started),
          });
        };
        if (!readBody || method === 'HEAD') {
          res.resume();
          res.on('end', done);
          res.on('error', done);
          return;
        }
        res.on('data', (chunk) => {
          transferred += chunk.length;
          if (transferred > maxBodyBytes) {
            truncated = true;
            const keep = chunk.length - (transferred - maxBodyBytes);
            if (keep > 0) chunks.push(chunk.subarray(0, keep));
            res.destroy();
            done();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', done);
        res.on('error', (err) => (truncated ? done() : finish(reject, new FetchError('network_error', err.message))));
      },
    );

    const timer = setTimeout(() => {
      req.destroy();
      finish(reject, new FetchError('timeout', `Request timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    req.on('timeout', () => {
      req.destroy();
      finish(reject, new FetchError('timeout', `Request timed out after ${timeoutMs} ms`));
    });
    req.on('error', (err) => {
      if (err instanceof UnsafeUrlError) return finish(reject, err);
      const code = err.code || '';
      if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return finish(reject, new FetchError('dns_failed', `Domain not found: ${url.hostname}`));
      }
      if (code.startsWith('CERT_') || code.includes('SELF_SIGNED') || code === 'ERR_TLS_CERT_ALTNAME_INVALID' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        return finish(reject, new FetchError('tls_error', `Invalid SSL certificate: ${err.message}`));
      }
      if (code === 'ECONNREFUSED') return finish(reject, new FetchError('connection_refused', 'Connection refused'));
      if (code === 'ECONNRESET') return finish(reject, new FetchError('connection_reset', 'Connection reset'));
      return finish(reject, new FetchError('network_error', err.message));
    });
    req.end();
  });
}

/**
 * Fetch an untrusted URL safely.
 * @returns {Promise<{url, status, headers, body: Buffer, text: string, redirects, ttfbMs, totalMs, transferBytes, truncated}>}
 */
export async function safeFetch(input, options = {}) {
  const {
    method = 'GET',
    userAgent = 'AIWebsiteAuditorBot',
    timeoutMs = 10_000,
    maxBodyBytes = 3 * 1024 * 1024,
    maxRedirects = 5,
    allowPrivateNetworks = false,
    resolver,
    readBody = true,
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  } = options;

  const lookup = createSafeLookup({ allowPrivateNetworks, resolver });
  let url = typeof input === 'string' ? new URL(input) : new URL(input.href);
  const redirects = [];
  const visited = new Set();
  const started = performance.now();

  for (let hop = 0; ; hop++) {
    assertSafeUrl(url, { allowPrivateNetworks });
    if (visited.has(url.href)) throw new FetchError('redirect_loop', `Redirect loop detected at ${url.href}`);
    visited.add(url.href);

    const response = await singleRequest(url, {
      method,
      timeoutMs,
      maxBodyBytes,
      lookup,
      readBody,
      headers: {
        'user-agent': userAgent,
        accept,
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en;q=0.9,*;q=0.5',
      },
    });

    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      redirects.push({ url: url.href, status: response.status });
      if (hop >= maxRedirects) throw new FetchError('too_many_redirects', `More than ${maxRedirects} redirects`);
      let next;
      try {
        next = new URL(location, url);
      } catch {
        throw new FetchError('bad_redirect', `Invalid redirect target: ${location}`);
      }
      next.hash = '';
      url = next;
      continue;
    }

    const body = decompress(response.body, response.headers['content-encoding'], maxBodyBytes * 4);
    return {
      url: url.href,
      status: response.status,
      headers: response.headers,
      body,
      get text() {
        return body.toString('utf8');
      },
      redirects,
      ttfbMs: response.ttfbMs,
      totalMs: Math.round(performance.now() - started),
      transferBytes: response.transferBytes,
      truncated: response.truncated,
    };
  }
}
