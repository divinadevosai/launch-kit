import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { lintExtension } from '../skills/launch-kit/scripts/lint.mjs';

// a minimal square PNG header of the given size: enough for the size check
const png = (n) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(n, 16);
  b.writeUInt32BE(n, 20);
  return b;
};

function ext(manifest, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lint-test-'));
  const all = { 'icons/16.png': png(16), 'icons/48.png': png(48), 'icons/128.png': png(128), 'background.js': 'chrome.storage.local.get();', ...files };
  for (const [p, c] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Test', version: '1.0.0', description: 'A test extension.',
    icons: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    background: { service_worker: 'background.js' }, permissions: ['storage'], ...manifest,
  }));
  return dir;
}

test('a clean extension passes for Chrome and Edge', () => {
  const r = lintExtension(ext({}), ['chrome', 'edge']);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('catches what got our own uploads rejected or warned', () => {
  const r = lintExtension(ext({ short_name: 'Invisible Ink' }, { '_next/app.js': '' }));
  assert.ok(r.errors.some((e) => e.includes('_next')), 'underscore folder');
  assert.ok(r.warnings.some((w) => w.includes('short_name')), 'short_name over 12');
});

test('limits on name, description and version', () => {
  const r = lintExtension(ext({ description: 'x'.repeat(133), version: '1.0.0.0.1' }));
  assert.ok(r.errors.some((e) => e.includes('133 characters')));
  assert.ok(r.errors.some((e) => e.includes('version')));
});

test('remote code is rejected', () => {
  const r = lintExtension(ext({ content_security_policy: { extension_pages: "script-src 'self' https://cdn.example.com" } }, { 'popup.html': '<script src="https://cdn.example.com/x.js"></script>' }));
  assert.equal(r.errors.filter((e) => /remote code|from the internet/.test(e)).length, 2);
});

test('permissions the code never uses are flagged, used ones are not', () => {
  const r = lintExtension(ext({ permissions: ['storage', 'history', 'alarms'] }, { 'background.js': 'chrome.storage.local.get(); chrome.alarms.create("x", {});' }));
  assert.ok(r.warnings.some((w) => w.includes('"history"')));
  assert.ok(!r.warnings.some((w) => w.includes('"alarms"') || w.includes('"storage"')));
});

test('missing files and bad icons', () => {
  const r = lintExtension(ext({ action: { default_popup: 'popup.html', default_icon: { 32: 'icons/32.png' } } }, { 'icons/48.png': png(64) }));
  assert.ok(r.errors.some((e) => e.includes('popup.html')));
  assert.ok(r.errors.some((e) => e.includes('icons/32.png')));
  assert.ok(r.warnings.some((w) => w.includes('64×64')));
});

test('a zipped folder instead of its contents is explained', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lint-test-'));
  assert.match(lintExtension(dir).errors[0], /Zip the contents/);
});

test('_locales is allowed at the top, nowhere else', () => {
  const ok = lintExtension(ext({ default_locale: 'en', name: '__MSG_name__' }, { '_locales/en/messages.json': '{}' }), ['chrome']);
  assert.deepEqual(ok.errors, []);
  const bad = lintExtension(ext({}, { 'lib/_locales/x.json': '{}' }));
  assert.ok(bad.errors.some((e) => e.includes('lib/_locales')));
});

test('Firefox: what AMO needs that Chrome doesn\'t', () => {
  const r = lintExtension(ext({}), ['firefox']);
  assert.ok(r.errors.some((e) => e.includes('add-on ID')));
  assert.ok(r.errors.some((e) => e.includes('service_worker alone')));
  assert.ok(r.errors.some((e) => e.includes('data_collection_permissions')));
  // Chrome and Edge don't care
  assert.deepEqual(lintExtension(ext({}), ['chrome', 'edge']).errors, []);
});

test('Firefox: a ready manifest passes, an old minimum version is flagged', () => {
  const gecko = { id: 'test@example.com', data_collection_permissions: { required: ['none'] }, strict_min_version: '128.0' };
  const ok = lintExtension(ext({ background: { service_worker: 'background.js', scripts: ['background.js'] }, browser_specific_settings: { gecko } }), ['firefox']);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  const old = lintExtension(ext({ background: { scripts: ['background.js'] }, browser_specific_settings: { gecko: { ...gecko, strict_min_version: '115.0' } } }), ['firefox']);
  assert.ok(old.warnings.some((w) => w.includes('strict_min_version')));
});

test('Firefox: Chrome-only APIs and minified code are flagged', () => {
  const r = lintExtension(ext({ permissions: ['offscreen', 'storage'] }, { 'background.js': 'chrome.storage.local.get();chrome.offscreen.createDocument();' + 'x'.repeat(2000) }), ['firefox']);
  assert.ok(r.warnings.some((w) => w.includes('offscreen documents')));
  assert.ok(r.warnings.some((w) => w.includes('minified or bundled')));
});

test('the short_name warning is Edge\'s only', () => {
  assert.equal(lintExtension(ext({ short_name: 'Invisible Ink' }), ['chrome', 'firefox']).warnings.filter((w) => w.includes('short_name')).length, 0);
});
