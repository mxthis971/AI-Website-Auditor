// URL validation and IP filtering: the first line of defence against SSRF.
//
// SSRF ("Server-Side Request Forgery") = tricking our server into fetching a
// URL the attacker could not reach themselves, e.g. http://127.0.0.1:6379
// (a local database) or http://169.254.169.254 (cloud credentials).
// Rule: only public http(s) websites on standard ports may be audited.

import net from 'node:net';

export class UnsafeUrlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.code = code;
  }
}

const ALLOWED_PORTS = new Set(['', '80', '443']);
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa', '.corp', '.test', '.invalid', '.example'];
const MAX_URL_LENGTH = 2048;

// IPv4 ranges that are never public internet hosts.
const blockedV4 = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT (also Alibaba metadata 100.100.100.200)
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (AWS/GCP/Azure metadata 169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]) {
  blockedV4.addSubnet(network, prefix, 'ipv4');
}

// For IPv6 we use an allow-list: only global unicast (2000::/3) is accepted,
// minus ranges that tunnel/embed IPv4 or are reserved for documentation.
const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new net.BlockList();
for (const [network, prefix] of [
  ['2001::', 32], // Teredo (embeds IPv4)
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 (embeds IPv4)
  ['2001:10::', 28], // ORCHID
  ['2001:20::', 28], // ORCHIDv2
]) {
  blockedV6.addSubnet(network, prefix, 'ipv6');
}

/** True when `ip` must never be contacted by the crawler. */
export function isBlockedIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return blockedV4.check(ip, 'ipv4');
  if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:127.0.0.1) -> judge the embedded IPv4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    if (!globalV6.check(lower, 'ipv6')) return true;
    return blockedV6.check(lower, 'ipv6');
  }
  return true; // not an IP at all: refuse
}

/**
 * Turns user input into a safe, normalised URL object or throws UnsafeUrlError.
 * Example: "example.com" -> URL("https://example.com/")
 */
export function parseAuditUrl(input, { allowPrivateNetworks = false } = {}) {
  if (typeof input !== 'string') throw new UnsafeUrlError('invalid_url', 'URL must be a string.');
  let raw = input.trim();
  if (!raw) throw new UnsafeUrlError('invalid_url', 'Please enter a URL.');
  if (raw.length > MAX_URL_LENGTH) throw new UnsafeUrlError('invalid_url', 'URL is too long.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[^:/]+:\d+/.test(raw)) {
      throw new UnsafeUrlError('unsupported_protocol', 'Only http and https URLs can be audited.');
    }
    raw = `https://${raw}`;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('invalid_url', 'This does not look like a valid URL.');
  }
  assertSafeUrl(url, { allowPrivateNetworks });
  url.hash = '';
  return url;
}

/** Checks an already-parsed URL (also used for every redirect hop and link). */
export function assertSafeUrl(url, { allowPrivateNetworks = false } = {}) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('unsupported_protocol', 'Only http and https URLs can be audited.');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('credentials_in_url', 'URLs containing credentials are not allowed.');
  }
  if (allowPrivateNetworks === true) return url;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const bareHost = host.replace(/^\[|\]$/g, '');
  // Tests can allow a specific list of addresses (e.g. ['127.0.0.1']) and
  // still verify that everything else is blocked.
  if (Array.isArray(allowPrivateNetworks) && allowPrivateNetworks.includes(bareHost)) return url;

  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError('port_not_allowed', 'Only standard web ports (80, 443) are allowed.');
  }
  if (net.isIP(bareHost)) {
    if (isBlockedIp(bareHost)) {
      throw new UnsafeUrlError('private_address', 'Private, local or reserved addresses cannot be audited.');
    }
    return url;
  }
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError('private_address', 'Local or internal hostnames cannot be audited.');
  }
  if (!host.includes('.')) {
    throw new UnsafeUrlError('invalid_url', 'Please enter a public domain name, e.g. example.com.');
  }
  return url;
}
