#!/usr/bin/env node
// Store images from launch.json: Edge's 300×300 logo, Chrome's 128×128 store icon, the 440×280 promo tile,
// Chrome's optional 1400×560 marquee, and 1280×800 screenshots (Firefox takes the same screenshots).
// node stills.mjs <launch.json>  → <out>/store/*.png      (run shoot.mjs first: screenshots come from <out>/shots)
//
// launch.json additions:
// "brand": { "name": "Loci", "tagline": "Your week, as a *place*.", "logo": "../src/icons/128.png", "logoLarge": "logo.svg",
//            "by": "SWE3WE", "colors": { "bg": "#f4eee3", "ink": "#2a2119", "accent": "#a9852f", "deep": "#1f2a44" },
//            "fonts": { "display": "../dist/fonts/x.woff2", "displayItalic": "…", "body": "…", "displayWeight": 600 } },
// "store": { "tile": { "headline": "…", "text": "…" }, "marquee": { "shot": "palace", "crop": [300, 0, 980, 620] },
//            "screenshots": [ { "shot": "palace", "layout": "full" },
//                             { "shot": "search", "layout": "feature", "headline": "Where did I *see* that?", "text": "…", "crop": [0, 0, 640, 400] } ] }
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'frames.html');

/** Opens the frame template with launch.json's brand. Returns { page, frame(kind, options, path, transparent), close }. */
export async function openFrames(config, base) {
  const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(TEMPLATE).href);
  const url = (p) => (p ? pathToFileURL(resolve(base, p)).href : undefined);
  const b = config.brand ?? {};
  await page.evaluate((brand) => window.setBrand(brand), {
    ...b,
    name: b.name ?? config.name,
    logo: url(b.logo),
    logoLarge: url(b.logoLarge),
    fonts: Object.fromEntries(Object.entries(b.fonts ?? {}).map(([k, v]) => [k, typeof v === 'string' && /\.(woff2?|ttf|otf)$/.test(v) ? url(v) : v])),
  });
  return {
    page,
    url,
    async frame(kind, options, path, transparent = false) {
      await page.evaluate(([k, o]) => window.render(k, o), [kind, options]);
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#frame').screenshot({ path, omitBackground: transparent });
      return path;
    },
    close: () => browser.close(),
  };
}

export async function stills(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const base = dirname(resolve(configPath));
  const outDir = resolve(base, config.out ?? '.');
  const shots = join(outDir, 'shots');
  const store = join(outDir, 'store');
  mkdirSync(store, { recursive: true });
  const f = await openFrames(config, base);
  const shot = (name, hi) => pathToFileURL(join(shots, `${name}${hi ? '@2x' : ''}.png`)).href;
  const made = [];
  if (!config.brand?.logoLarge) console.warn('! brand.logoLarge is not set: the 300×300 logo is scaled up from brand.logo and may look soft. Point it at an SVG or a PNG of 300px or more.');
  made.push(await f.frame('logo', {}, join(store, 'logo-300x300.png'), true));
  made.push(await f.frame('storeicon', {}, join(store, 'chrome-icon-128x128.png'), true));
  made.push(await f.frame('tile', config.store?.tile ?? {}, join(store, 'promo-440x280.png')));
  const mq = config.store?.marquee;
  if (mq) made.push(await f.frame('marquee', { ...mq, shot: shot(mq.shot, true) }, join(store, 'marquee-1400x560.png')));
  let n = 0;
  for (const s of config.store?.screenshots ?? []) {
    n++;
    const name = `${n}-${s.shot}-1280x800.png`;
    made.push(await f.frame(s.layout ?? 'full', { ...s, shot: shot(s.shot, s.layout === 'feature') }, join(store, name)));
  }
  await f.close();
  return made;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[2]) {
    console.error('usage: node stills.mjs <launch.json>');
    process.exit(2);
  }
  for (const p of await stills(process.argv[2])) console.log(`image ${p}`);
}
