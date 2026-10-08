import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuditUrl, isBlockedIp, UnsafeUrlError } from '../src/security/url-guard.js';
import { createSafeLookup } from '../src/security/safe-fetch.js';

const rejects = (input, code) => {
  assert.throws(() => parseAuditUrl(input), (err) => err instanceof UnsafeUrlError && err.code === code, `${input} should be rejected with ${code}`);
};

test('valid URLs are normalised', () => {
  assert.equal(parseAuditUrl('example.com').href, 'https://example.com/');
  assert.equal(parseAuditUrl('  https://www.example.com/page?x=1#top ').href, 'https://www.example.com/page?x=1');
  assert.equal(parseAuditUrl('http://example.com:80/').href, 'http://example.com/');
  assert.equal(parseAuditUrl('example.com:443/path').href, 'https://example.com/path');
});

test('invalid input is rejected', () => {
  rejects('', 'invalid_url');
  rejects('   ', 'invalid_url');
  rejects('not a url', 'invalid_url');
  rejects('intranet', 'invalid_url');
  rejects(`https://example.com/${'a'.repeat(3000)}`, 'invalid_url');
  assert.throws(() => parseAuditUrl(42), UnsafeUrlError);
});

test('only http and https are allowed', () => {
  for (const u of ['ftp://example.com', 'file:///etc/hosts', 'javascript:alert(1)', 'data:text/html,hi', 'gopher://example.com']) {
    rejects(u, 'unsupported_protocol');
  }
});

test('credentials and non-standard ports are rejected', () => {
  rejects('https://user:pass@example.com', 'credentials_in_url');
  rejects('https://example.com:8080', 'port_not_allowed');
  rejects('http://example.com:22', 'port_not_allowed');
});

test('local and private destinations are rejected (SSRF)', () => {
  const blocked = [
    'localhost', 'http://localhost/', 'app.localhost', 'printer.local', 'db.internal', 'router.home.arpa',
    '127.0.0.1', '127.1.2.3', '0.0.0.0', '10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.100.100.200', '224.0.0.1', '255.255.255.255',
    'http://[::1]/', 'http://[::]/', 'http://[fe80::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:a9fe:a9fe]/',
    // Alternative IPv4 notations are normalised by the URL parser, then blocked.
    'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://127.1/',
  ];
  for (const u of blocked) rejects(u, 'private_address');
});

test('public IPs are allowed', () => {
  assert.equal(parseAuditUrl('http://93.184.216.34/').hostname, '93.184.216.34');
  assert.equal(parseAuditUrl('http://[2606:4700::1111]/').hostname, '[2606:4700::1111]');
});

test('isBlockedIp covers IPv4 and IPv6 special ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.1.1', '192.168.0.10', '169.254.1.1', '100.64.0.1', '198.18.0.1', '::1', 'fc00::1', 'fe80::abcd', 'ff02::1', '2001:db8::1', '2002:7f00:1::1', '::ffff:10.0.0.1', 'not-an-ip']) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2a00:1450:4007::64']) {
    assert.equal(isBlockedIp(ip), false, ip);
  }
});

test('an explicit allow-list only allows the listed address', () => {
  assert.equal(parseAuditUrl('http://127.0.0.1:3000/', { allowPrivateNetworks: ['127.0.0.1'] }).port, '3000');
  assert.throws(() => parseAuditUrl('http://169.254.169.254/', { allowPrivateNetworks: ['127.0.0.1'] }), UnsafeUrlError);
});

const fakeResolver = (records) => (host, opts, cb) => cb(null, records.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
const lookupAsync = (lookup) => new Promise((resolve) => lookup('site.example.org', { all: true }, (err, res) => resolve({ err, res })));

test('DNS answers pointing to private addresses are refused (anti DNS rebinding)', async () => {
  let r = await lookupAsync(createSafeLookup({ resolver: fakeResolver(['10.0.0.5']) }));
  assert.equal(r.err?.code, 'private_address');
  r = await lookupAsync(createSafeLookup({ resolver: fakeResolver(['93.184.216.34', '127.0.0.1']) }));
  assert.equal(r.err?.code, 'private_address', 'mixed public + private records must be refused');
  r = await lookupAsync(createSafeLookup({ resolver: fakeResolver(['93.184.216.34']) }));
  assert.equal(r.err, null);
  assert.equal(r.res[0].address, '93.184.216.34');
});

test('lookup supports the single-address callback form', async () => {
  const lookup = createSafeLookup({ resolver: fakeResolver(['93.184.216.34']) });
  const address = await new Promise((resolve) => lookup('site.example.org', {}, (err, addr) => resolve(addr)));
  assert.equal(address, '93.184.216.34');
});
