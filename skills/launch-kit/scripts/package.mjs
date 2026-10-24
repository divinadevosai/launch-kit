#!/usr/bin/env node
// One upload per store from one build: <name>-<version>-chrome.zip (also for Edge), -firefox.zip, and the
// -source.zip Firefox reviewers ask for when code is bundled or minified. Each is checked with lint.mjs.
// node package.mjs <build folder> [--out dir] [--firefox-id name@example.com] [--data none|browsingActivity,…]
//                  [--min-firefox 128.0] [--source <project folder>] [--stores chrome,firefox]
// Only the Firefox zip's manifest is changed; the build folder is left alone.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lintExtension } from './lint.mjs';

/** The Firefox version of a Chrome manifest: an add-on ID, declared data collection, and a background that runs. */
export function firefoxManifest(m, { id, data = ['none'], minVersion = '128.0' } = {}) {
  const out = structuredClone(m);
  const gecko = { ...(out.browser_specific_settings?.gecko ?? {}) };
  if (id) gecko.id = id;
  if (!gecko.data_collection_permissions) gecko.data_collection_permissions = { required: data };
  if (!gecko.strict_min_version || parseFloat(gecko.strict_min_version) < parseFloat(minVersion)) gecko.strict_min_version = minVersion;
  out.browser_specific_settings = { ...(out.browser_specific_settings ?? {}), gecko };
  // Firefox runs background scripts as an event page and warns about service_worker, which it doesn't support;
  // this zip is Firefox's alone, so it gets scripts only
  if (out.background?.service_worker) {
    const { service_worker: sw, ...rest } = out.background;
    out.background = { ...rest, scripts: rest.scripts ?? [sw] };
  }
  return out;
}

const slug = (s) => String(s).toLowerCase().replace(/__msg_\w+__/g, 'extension').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function zipFolder(folder, file) {
  rmSync(file, { force: true });
  execFileSync('zip', ['-qr', '-X', file, '.', '-x', '.DS_Store', '*/.DS_Store'], { cwd: folder });
}

export function packageExtension(build, opts = {}) {
  const m = JSON.parse(readFileSync(join(build, 'manifest.json'), 'utf8'));
  const outDir = resolve(opts.out ?? '.');
  mkdirSync(outDir, { recursive: true });
  // "Invisible Ink — see what AI sees" → invisible-ink
  const base = `${slug(m.short_name ?? String(m.name).split(/\s[—–-]\s|:/)[0])}-${m.version}`;
  const stores = opts.stores ?? ['chrome', 'firefox'];
  const made = [];

  if (stores.includes('chrome') || stores.includes('edge')) {
    const file = join(outDir, `${base}-chrome.zip`);
    zipFolder(resolve(build), file);
    made.push({ store: 'Chrome Web Store and Edge Add-ons', file, lint: lintExtension(resolve(build), ['chrome', 'edge']) });
  }
  if (stores.includes('firefox')) {
    const tmp = mkdtempSync(join(tmpdir(), 'lk-ff-'));
    cpSync(resolve(build), tmp, { recursive: true });
    const fm = firefoxManifest(m, { id: opts.firefoxId, data: opts.data, minVersion: opts.minFirefox });
    writeFileSync(join(tmp, 'manifest.json'), JSON.stringify(fm, null, 2) + '\n');
    const file = join(outDir, `${base}-firefox.zip`);
    zipFolder(tmp, file);
    made.push({ store: 'Firefox Add-ons', file, lint: lintExtension(tmp, ['firefox']) });
    rmSync(tmp, { recursive: true, force: true });
  }
  if (opts.source) {
    // what's committed, exactly: reviewers rebuild it and compare with the upload
    const repo = resolve(opts.source);
    const file = join(outDir, `${base}-source.zip`);
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repo }).toString().trim();
    execFileSync('git', ['archive', '--format=zip', `--output=${file}`, 'HEAD'], { cwd: repo });
    made.push({ store: 'Firefox source code', file, note: dirty ? 'uncommitted changes are not in the source zip: commit, rebuild and package again so the upload matches' : 'from the last commit' });
  }
  return made;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const build = args[0];
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i > 0 ? args[i + 1] : undefined;
  };
  if (!build || !existsSync(join(build, 'manifest.json'))) {
    console.error('usage: node package.mjs <build folder> [--out dir] [--firefox-id name@example.com] [--data none|a,b] [--min-firefox 128.0] [--source <project folder>] [--stores chrome,firefox]');
    process.exit(2);
  }
  const made = packageExtension(build, {
    out: flag('out'),
    firefoxId: flag('firefox-id'),
    data: flag('data')?.split(','),
    minFirefox: flag('min-firefox'),
    source: flag('source'),
    stores: flag('stores')?.split(','),
  });
  let failed = false;
  for (const p of made) {
    console.log(`\n${p.store}: ${p.file}`);
    if (p.note) console.log(`· ${p.note}`);
    for (const e of p.lint?.errors ?? []) console.log(`✗ ${e}`);
    for (const w of p.lint?.warnings ?? []) console.log(`! ${w}`);
    if (p.lint?.errors.length) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
