#!/usr/bin/env node
// Real screenshots of a built extension, for the store images and the promo video.
// node shoot.mjs <launch.json>  → <out>/shots/<name>.png (and <name>@2x.png)
//
// launch.json (paths are relative to it):
// {
//   "extension": "../dist",                       the built, unpacked extension
//   "out": ".",                                   where shots/, store/ and video/ go
//   "serve": { "dir": "../demo", "host": "demo.example" },   optional: serve a folder at http://<host>/
//   "grant": ["history"],                         optional permissions to grant up front (prompts can't be clicked)
//   "shots": [
//     { "name": "popup", "open": "extension:popup.html", "size": [1280, 800] },
//     { "name": "page", "open": "http://demo.example/", "steps": [
//         { "worker": "await run(tab)" },          run code in the extension's service worker; `tab` is the shot's tab
//         { "click": "#try" }, { "press": "Escape" }, { "mouse": [520, 420] },
//         { "scroll": 600 }, { "eval": "document.body.classList.add('x')" }, { "wait": 800 } ] }
//   ]
// }
// Needs Playwright (PLAYWRIGHT=<path to playwright's index.mjs> if it isn't installed where node can find it).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };

export async function shoot(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const base = dirname(resolve(configPath));
  const out = resolve(base, config.out ?? '.', 'shots');
  mkdirSync(out, { recursive: true });
  const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

  // a throwaway copy of the extension that may open the demo host without a click,
  // because the toolbar button and permission prompts can't be automated
  const ext = mkdtempSync(join(tmpdir(), 'lk-ext-'));
  cpSync(resolve(base, config.extension), ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
  const host = config.serve?.host ?? 'launch.localhost';
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), `http://${host}/*`])];
  // optional permissions stay optional (the page may show a different first screen without them) unless listed in "grant"
  manifest.permissions = [...new Set([...(manifest.permissions ?? []), ...(config.grant ?? [])])];
  writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));

  let server = null;
  let port = 0;
  if (config.serve?.dir) {
    const root = resolve(base, config.serve.dir);
    server = createServer((req, res) => {
      let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      if (p.endsWith('/')) p += 'index.html';
      try {
        res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(join(root, p)));
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  }

  const profile = mkdtempSync(join(tmpdir(), 'lk-p-')); // short path: Chromium's socket name has a length limit
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--disable-features=DisableLoadExtensionCommandLineSwitch', '--no-proxy-server',
      ...(server ? [`--host-resolver-rules=MAP ${host}:80 127.0.0.1:${port}`] : [])],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null));
  const id = sw ? new URL(sw.url()).host : null;

  const done = [];
  for (const shot of config.shots ?? []) {
    const [w, h] = shot.size ?? [1280, 800];
    for (const scale of [1, 2]) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: w, height: h });
      if (scale !== 1) {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
      }
      const url = shot.open.startsWith('extension:') ? `chrome-extension://${id}/${shot.open.slice(10)}` : shot.open;
      await page.goto(url, { waitUntil: 'load' });
      await page.bringToFront();
      await page.evaluate(() => document.fonts?.ready);
      for (const step of shot.steps ?? []) await runStep(step, { page, sw, url });
      await page.waitForTimeout(shot.settle ?? 600);
      const file = join(out, `${shot.name}${scale === 2 ? '@2x' : ''}.png`);
      await page.screenshot({ path: file });
      await page.close();
      if (scale === 1) done.push(file);
    }
  }
  await ctx.close();
  server?.close();
  rmSync(ext, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
  return done;
}

async function runStep(step, { page, sw }) {
  if (step.worker) {
    if (!sw) throw new Error('"worker" step: the extension has no service worker');
    await sw.evaluate(async (code) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return new Function('tab', `return (async () => { ${code} })()`)(tab);
    }, step.worker);
  } else if (step.click) await page.click(step.click);
  else if (step.press) await page.keyboard.press(step.press);
  else if (step.mouse) await page.mouse.move(...step.mouse);
  else if (step.scroll != null) await page.evaluate((y) => scrollTo(0, y), step.scroll);
  else if (step.eval) await page.evaluate(step.eval);
  else if (step.wait) await page.waitForTimeout(step.wait);
  else throw new Error(`unknown step ${JSON.stringify(step)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[2]) {
    console.error('usage: node shoot.mjs <launch.json>');
    process.exit(2);
  }
  const files = await shoot(process.argv[2]);
  console.log(files.map((f) => `shot ${f}`).join('\n'));
}
