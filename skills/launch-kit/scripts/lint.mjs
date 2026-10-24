#!/usr/bin/env node
// Store pre-flight for a Manifest V3 browser extension: the checks the Chrome Web Store, Edge Add-ons and
// Firefox Add-ons (AMO) reject or warn on, run before you upload instead of after a review.
// node lint.mjs <built extension folder or .zip> [--store chrome,edge,firefox] [--json]
// Messages for one store only are prefixed with it. Exit code 1 if anything would be rejected.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, sep } from 'node:path';

// permission → the API it unlocks, so a permission the code never calls can be flagged
const API = {
  alarms: 'alarms', bookmarks: 'bookmarks', contextMenus: 'contextMenus', cookies: 'cookies', debugger: 'debugger',
  declarativeNetRequest: 'declarativeNetRequest', downloads: 'downloads', history: 'history', identity: 'identity',
  idle: 'idle', management: 'management', notifications: 'notifications', offscreen: 'offscreen', pageCapture: 'pageCapture',
  power: 'power', proxy: 'proxy', scripting: 'scripting', sessions: 'sessions', sidePanel: 'sidePanel', storage: 'storage',
  tabCapture: 'tabCapture', tabGroups: 'tabGroups', topSites: 'topSites', tts: 'tts', webNavigation: 'webNavigation',
  webRequest: 'webRequest', clipboardRead: null, clipboardWrite: null, activeTab: null, tabs: null, unlimitedStorage: null,
};
const BROAD_HOSTS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

// Chrome APIs Firefox doesn't have
const NOT_IN_FIREFOX = { offscreen: 'Firefox has no offscreen documents; its background page is a real page, so do the work there.', sidePanel: 'Firefox has sidebar_action instead of sidePanel.' };
export const STORES = ['chrome', 'edge', 'firefox'];

/** Lint an unpacked extension folder for the given stores. Returns { errors, warnings, notes, manifest }. */
export function lintExtension(dir, stores = STORES) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return { errors: ['No manifest.json at the top of the package. Zip the contents of the build folder, not the folder itself.'], warnings, notes, manifest: null };
  let m;
  try {
    m = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    return { errors: [`manifest.json isn't valid JSON: ${e.message}`], warnings, notes, manifest: null };
  }

  const files = walk(dir);
  const has = (p) => p && existsSync(join(dir, p));

  // ---- identity ----
  if (m.manifest_version !== 3) err(`manifest_version is ${m.manifest_version ?? 'missing'}; both stores only accept 3.`);
  const msg = (s) => (typeof s === 'string' && s.startsWith('__MSG_') ? null : s);
  if (!m.name) err('name is missing.');
  else if (msg(m.name) && m.name.length > 75) err(`name is ${m.name.length} characters; the limit is 75.`);
  if (stores.includes('edge') && m.short_name && msg(m.short_name) && m.short_name.length > 12) warn(`Edge: ` + `short_name "${m.short_name}" is ${m.short_name.length} characters; Edge warns above 12. Shorten it or remove it (the name is used instead).`);
  if (!m.description) err('description is missing; the stores show it as the short description.');
  else if (msg(m.description) && m.description.length > 132) err(`description is ${m.description.length} characters; the limit is 132.`);
  if (!/^\d{1,5}(\.\d{1,5}){0,3}$/.test(m.version ?? '') || String(m.version).split('.').some((n) => +n > 65535)) err(`version "${m.version}" must be 1–4 dot-separated numbers, each 0–65535.`);
  if (m.default_locale && !has('_locales')) err('default_locale is set but there is no _locales folder.');
  if (!m.default_locale && has('_locales')) err('There is a _locales folder but no default_locale.');

  // ---- icons ----
  const icons = m.icons ?? {};
  if (!icons['128']) err('No 128×128 icon in "icons"; both stores require it.');
  for (const [size, path] of Object.entries(icons)) checkIcon(dir, path, +size, `icons.${size}`, err, warn);
  const actionIcon = m.action?.default_icon;
  if (typeof actionIcon === 'string') checkIcon(dir, actionIcon, null, 'action.default_icon', err, warn);
  else for (const [size, path] of Object.entries(actionIcon ?? {})) checkIcon(dir, path, +size, `action.default_icon.${size}`, err, warn);

  // ---- files the stores reject or shouldn't ship ----
  for (const f of files) {
    const parts = f.split(sep);
    const bad = parts.find((p) => p.startsWith('_') && !(p === '_locales' && parts[0] === '_locales'));
    if (bad) err(`"${f}": names starting with "_" are reserved by the browser and get the package rejected. Rename it.`);
    if (parts.some((p) => p === 'node_modules' || p === '.git')) err(`"${f}": node_modules or .git is inside the package.`);
    if (/(^|\/)\.DS_Store$|Thumbs\.db$/.test(f)) warn(`"${f}": operating-system clutter in the package.`);
    if (f.endsWith('.map')) warn(`"${f}": a source map ships your original source; fine if intended, otherwise leave it out.`);
  }
  for (const ref of referencedFiles(m)) if (!has(ref)) err(`manifest.json refers to "${ref}", which isn't in the package.`);

  // ---- remote code: not allowed in Manifest V3 ----
  const csp = m.content_security_policy?.extension_pages ?? '';
  const scriptSrc = (/(?:^|;)\s*script-src([^;]*)/.exec(csp)?.[1] ?? '').trim();
  if (/https?:|\*|data:/.test(scriptSrc)) err(`content_security_policy lets extension pages load scripts from "${scriptSrc}". Manifest V3 doesn't allow remote code; bundle it.`);
  if (/'unsafe-eval'/.test(csp)) err("content_security_policy allows 'unsafe-eval', which Manifest V3 rejects.");
  const code = files.filter((f) => ['.js', '.mjs', '.html'].includes(extname(f)));
  const read = (f) => readFileSync(join(dir, f), 'utf8');
  for (const f of code) {
    const src = read(f);
    if (/<script[^>]+src=["']https?:/i.test(src)) err(`"${f}" loads a script from the internet. Manifest V3 forbids remote code; bundle it.`);
    if (/\bimport\s*\(\s*["'`]https?:/.test(src) || /\bimportScripts\s*\(\s*["'`]https?:/.test(src)) err(`"${f}" imports code from a URL. Manifest V3 forbids remote code.`);
    if (/\beval\s*\(|\bnew Function\s*\(/.test(src)) warn(`"${f}" uses eval or new Function. Reviewers look hard at it, and the default CSP blocks it.`);
  }

  // ---- permissions: every one needs a reason, and unused ones get versions rejected ----
  const allCode = code.map(read).join('\n');
  const perms = [...(m.permissions ?? [])];
  const optional = [...(m.optional_permissions ?? [])];
  for (const p of [...perms, ...optional]) {
    const api = API[p];
    if (api && !new RegExp(`\\b(?:chrome|browser)\\.${api}\\b`).test(allCode)) warn(`"${p}" is declared but chrome.${api} never appears in the code. Edge rejects unnecessary permissions: remove it, or check the code really uses it.`);
  }
  const hosts = [...(m.host_permissions ?? []), ...(m.optional_host_permissions ?? []), ...(m.content_scripts ?? []).flatMap((c) => c.matches ?? [])];
  const broad = hosts.filter((h) => BROAD_HOSTS.has(h));
  if (broad.length && (m.host_permissions ?? []).some((h) => BROAD_HOSTS.has(h))) warn('Access to every website is requested at install. This means a slower, stricter review; consider "activeTab" or optional_host_permissions requested with a button.');
  for (const w of m.web_accessible_resources ?? []) if ((w.matches ?? []).some((h) => BROAD_HOSTS.has(h)) && !w.use_dynamic_url) warn('web_accessible_resources are open to every site, which lets any page detect the extension. Narrow "matches" or set use_dynamic_url.');
  if (perms.includes('tabs') && !/\.(url|title|favIconUrl)\b/.test(allCode)) warn('"tabs" only adds access to tab URLs and titles; the tabs API works without it. Remove it if you don\'t read tab.url or tab.title.');

  if (stores.includes('firefox')) firefoxChecks(m, files, read, code, perms, err, warn);
  if (stores.includes('chrome')) notes.push('Chrome: the store icon is a separate 128×128 PNG upload whose artwork should be 96×96 with 16px of transparent padding (stills.mjs makes it).');

  notes.push(`Permissions to justify in the listing: ${[...perms, ...optional.map((p) => `${p} (optional)`), ...new Set(hosts)].join(', ') || 'none'}.`);
  const size = files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  notes.push(`${files.length} files, ${(size / 1024 / 1024).toFixed(2)} MB unpacked.`);
  if (size > 100 * 1024 * 1024) warn('The package is over 100 MB, which is slow to review and to install.');
  return { errors, warnings, notes, manifest: m };
}

function firefoxChecks(m, files, read, code, perms, err, warn) {
  const ff = (s) => `Firefox: ${s}`;
  const gecko = m.browser_specific_settings?.gecko ?? {};
  if (!gecko.id) err(ff('no add-on ID. Manifest V3 add-ons need a fixed one in browser_specific_settings.gecko.id, like "name@yourdomain" (Chrome ignores the key). package.mjs adds it to a Firefox build.'));
  if (m.background?.service_worker && !m.background?.scripts) err(ff('background.service_worker alone never runs: Firefox has no extension service workers. Add "scripts": ["' + m.background.service_worker + '"] next to it (Chrome 121+ uses service_worker and ignores scripts).'));
  const dcp = gecko.data_collection_permissions;
  if (!dcp) err(ff('no browser_specific_settings.gecko.data_collection_permissions. New add-ons can\'t be signed without it since November 2025. If nothing leaves the device: { "required": ["none"] }.'));
  else {
    if (!Array.isArray(dcp.required) || !dcp.required.length) err(ff('data_collection_permissions.required must list "none" or the kinds of data the add-on sends.'));
    const min = parseFloat(gecko.strict_min_version ?? '0');
    if (min < 128) warn(ff(`data_collection_permissions makes Firefox 127 and older refuse the add-on; set browser_specific_settings.gecko.strict_min_version to "128.0" (or "140.0" for Firefox's built-in consent screen). It is ${gecko.strict_min_version ? `"${gecko.strict_min_version}"` : 'not set'}.`));
  }
  for (const p of perms) if (NOT_IN_FIREFOX[p]) warn(ff(`"${p}": ${NOT_IN_FIREFOX[p]}`));
  // reviewers must be able to read the code: bundled or minified files need the source and build steps uploaded too
  const built = code.filter((f) => f.endsWith('.js') && read(f).split('\n').some((line) => line.length > 1500));
  if (built.length) warn(ff(`${built.join(', ')} ${built.length === 1 ? 'looks' : 'look'} minified or bundled. AMO will ask for the source code, a lockfile and build instructions that use open-source tools offline; package.mjs makes the source zip.`));
}

function checkIcon(dir, path, size, label, err, warn) {
  const full = join(dir, path ?? '');
  if (!path || !existsSync(full)) return err(`${label}: "${path}" isn't in the package.`);
  const buf = readFileSync(full);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return warn(`${label}: "${path}" isn't a PNG; the stores expect PNG icons.`);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== h) err(`${label}: "${path}" is ${w}×${h}; icons must be square.`);
  else if (size && w !== size) warn(`${label}: "${path}" is ${w}×${h}, not ${size}×${size}; it will be scaled and look soft.`);
}

function referencedFiles(m) {
  const out = [];
  const add = (p) => typeof p === 'string' && p && !/^https?:/.test(p) && out.push(p.replace(/^\//, '').split(/[?#]/)[0]);
  add(m.background?.service_worker);
  add(m.action?.default_popup);
  add(m.options_page);
  add(m.options_ui?.page);
  add(m.side_panel?.default_path);
  add(m.devtools_page);
  for (const v of Object.values(m.chrome_url_overrides ?? {})) add(v);
  for (const c of m.content_scripts ?? []) [...(c.js ?? []), ...(c.css ?? [])].forEach(add);
  return [...new Set(out)];
}

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p));
  }
  return out;
}

// ---- command line ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  const asJson = process.argv.includes('--json');
  const storeArg = process.argv.find((a) => a.startsWith('--store'));
  const stores = storeArg ? (storeArg.includes('=') ? storeArg.split('=')[1] : process.argv[process.argv.indexOf(storeArg) + 1]).split(',') : STORES;
  if (stores.some((st) => !STORES.includes(st))) {
    console.error(`--store takes ${STORES.join(', ')}`);
    process.exit(2);
  }
  if (!target) {
    console.error('usage: node lint.mjs <built extension folder or .zip> [--store chrome,edge,firefox] [--json]');
    process.exit(2);
  }
  let dir = target;
  let tmp = null;
  if (target.endsWith('.zip')) {
    tmp = mkdtempSync(join(tmpdir(), 'launch-lint-'));
    execFileSync('unzip', ['-qq', target, '-d', tmp]);
    dir = tmp;
  }
  const r = lintExtension(dir, stores);
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (asJson) console.log(JSON.stringify({ errors: r.errors, warnings: r.warnings, notes: r.notes }, null, 2));
  else {
    const name = r.manifest ? `${r.manifest.name} ${r.manifest.version}` : target;
    console.log(`Store pre-flight: ${name} (${stores.join(', ')})\n`);
    for (const e of r.errors) console.log(`✗ ${e}`);
    for (const w of r.warnings) console.log(`! ${w}`);
    for (const n of r.notes) console.log(`· ${n}`);
    console.log(`\n${r.errors.length} would be rejected, ${r.warnings.length} to check.`);
  }
  process.exit(r.errors.length ? 1 : 0);
}
