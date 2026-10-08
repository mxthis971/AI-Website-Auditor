// Stripe integration (one-time "full report" purchase) using Stripe's REST API.
// Card data never touches our server: the visitor pays on Stripe's hosted
// Checkout page, then Stripe notifies us through a signed webhook.

import crypto from 'node:crypto';

const API = 'https://api.stripe.com/v1';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out);
    else if (v !== undefined && v !== null) out.append(key, String(v));
  }
  return out;
}

async function stripeRequest(secretKey, method, path, body, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: body ? form(body).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe error: ${json.error?.message || res.status}`);
  return json;
}

export function createCheckoutSession({ secretKey, priceId, reportId, baseUrl, lang = 'en', fetchImpl }) {
  return stripeRequest(
    secretKey,
    'POST',
    '/checkout/sessions',
    {
      mode: 'payment',
      line_items: { 0: { price: priceId, quantity: 1 } },
      client_reference_id: reportId,
      metadata: { report_id: reportId },
      locale: lang === 'fr' ? 'fr' : 'en',
      success_url: `${baseUrl}/r/${reportId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/r/${reportId}`,
    },
    fetchImpl,
  );
}

export function retrieveCheckoutSession({ secretKey, sessionId, fetchImpl }) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error('Invalid session id');
  return stripeRequest(secretKey, 'GET', `/checkout/sessions/${sessionId}`, null, fetchImpl);
}

/**
 * Verifies the Stripe-Signature header (HMAC-SHA256 of "timestamp.payload").
 * Without this check anyone could POST a fake "payment succeeded" event.
 */
export function verifyWebhookSignature(rawBody, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries([]);
  const signatures = [];
  for (const item of String(header).split(',')) {
    const [k, v] = item.split('=');
    if (k === 't') parts.t = v;
    if (k === 'v1' && v) signatures.push(v);
  }
  const timestamp = Number(parts.t);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

export function signPayloadForTests(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
