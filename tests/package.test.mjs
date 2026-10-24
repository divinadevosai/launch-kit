import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firefoxManifest, packageExtension } from '../skills/launch-kit/scripts/package.mjs';

const chromeManifest = { manifest_version: 3, name: 'Invisible Ink — see what AI sees', version: '0.1.1', description: 'x', background: { service_worker: 'background.js' } };

test('the Firefox manifest gets an ID, data collection and a background that runs', () => {
  const m = firefoxManifest(chromeManifest, { id: 'ink@example.com' });
  assert.equal(m.browser_specific_settings.gecko.id, 'ink@example.com');
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
  assert.equal(m.browser_specific_settings.gecko.strict_min_version, '128.0');
  assert.deepEqual(m.background, { scripts: ['background.js'] });
  assert.equal(chromeManifest.browser_specific_settings, undefined, 'the input is not changed');
});

test('existing Firefox settings are kept, and the minimum only rises', () => {
  const m = firefoxManifest({ ...chromeManifest, browser_specific_settings: { gecko: { id: 'kept@example.com', strict_min_version: '140.0', data_collection_permissions: { required: ['browsingActivity'] } } } });
  assert.equal(m.browser_specific_settings.gecko.id, 'kept@example.com');
  assert.equal(m.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions.required, ['browsingActivity']);
});

test('packages a zip per store and the Firefox one passes its checks', () => {
  const build = mkdtempSync(join(tmpdir(), 'pkg-test-'));
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png, 0);
  png.writeUInt32BE(128, 16);
  png.writeUInt32BE(128, 20);
  mkdirSync(join(build, 'icons'));
  writeFileSync(join(build, 'icons/128.png'), png);
  writeFileSync(join(build, 'background.js'), 'chrome.runtime.id;');
  writeFileSync(join(build, 'manifest.json'), JSON.stringify({ ...chromeManifest, icons: { 128: 'icons/128.png' } }));
  const out = mkdtempSync(join(tmpdir(), 'pkg-out-'));
  const made = packageExtension(build, { out, firefoxId: 'ink@example.com' });
  assert.deepEqual(made.map((p) => p.file.split('/').pop()), ['invisible-ink-0.1.1-chrome.zip', 'invisible-ink-0.1.1-firefox.zip']);
  assert.deepEqual(made[1].lint.errors, []);
  const inside = JSON.parse(execFileSync('unzip', ['-p', made[1].file, 'manifest.json']).toString());
  assert.equal(inside.browser_specific_settings.gecko.id, 'ink@example.com');
});
