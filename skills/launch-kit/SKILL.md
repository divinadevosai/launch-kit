---
name: launch-kit
description: Get a browser extension ready for the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO), end to end - a pre-flight check for what each store rejects, a package per store, real screenshots, store images, listing text, permission justifications, privacy answers, a privacy policy page and a promo video. Use when someone wants to publish, launch, submit, update or port an extension to Chrome, Edge or Firefox, write its store listing, make its screenshots or promo video, or find out why a store rejected it.
---

# Launch kit

Takes a built Manifest V3 extension to finished submissions for the Chrome Web Store, Edge Add-ons and Firefox Add-ons. Everything you say in the listing must be true of the code, so read the code before writing a word, and look at every image you make before calling it done.

The scripts are in `scripts/` next to this file. They need Node 18+, Playwright with Chromium (set `PLAYWRIGHT` to Playwright's `index.mjs` if `import('playwright')` fails), and `ffmpeg` for the video.

## 1. Pre-flight

Build the extension, then:

```sh
node <this skill>/scripts/lint.mjs <build folder or zip> [--store chrome,edge,firefox]
```

It checks all three stores unless `--store` narrows it; messages for one store start with its name.

- `✗` lines get the package rejected. Fix every one before going further.
- `!` lines are what reviewers query. Fix them, or know exactly why they're fine; an unused permission should be removed, not justified.
- The `·` notes list the permissions you'll have to justify.

Run it again on the exact zips you upload, last thing (step 8 does this).

**Firefox** usually needs more than a manifest tweak. `lint.mjs` flags what Firefox lacks; Chrome-only APIs (`offscreen`, `sidePanel`) need real porting, and only `package.mjs` fixes the manifest. If the extension can't work on Firefox without code changes, say so and leave Firefox out rather than ship something broken.

## 2. Find out what the extension really does

The listing, the privacy answers and the privacy policy all come from this, so be precise:

- **Each permission**: which file calls it and why. Search for `chrome.<api>` uses.
- **Network**: any `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, remote `src` or `connect-src` in the CSP. Where does data go?
- **Storage**: what is saved with `chrome.storage`, `localStorage` or IndexedDB, and for how long.
- **Pages it touches**: content scripts, host permissions, `activeTab`, what it reads or changes there.
- **Remote code**: there must be none in Manifest V3.

Write this down as plain facts. If the code sends data somewhere, the listing and privacy policy must say so; never describe it as private, local or "nothing leaves your computer" unless the code proves it.

## 3. launch.json

Create `launch/launch.json` in the project; paths in it are relative to it. A full example is `templates/launch.example.json`.

- **brand**: name, a short tagline, the icon, a large logo (an SVG or a PNG of 300px or more; draw one if only small icons exist, matching the icon exactly), colours and font files taken from the extension's own CSS so the images look like the product. In text fields, `*word*` sets a word in the accent colour (italic in titles).
- **shots**: 3 to 5 moments that show the extension doing its job. Open extension pages with `"open": "extension:popup.html"`, or serve a demo folder (`"serve": { "dir": "../demo", "host": "something.example" }`) and open `http://something.example/`. Steps can click, type with `eval`, wait, move the mouse, scroll, or run code in the service worker (`{ "worker": "await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })" }`) to do what a toolbar click would. List optional permissions in `"grant"` only if the shot needs them granted.
- Use example data only: a demo page or the extension's sample mode, `.example` or `.invalid` domains, made-up names. Never screenshot real history, accounts or personal data.

## 4. Screenshots and store images

```sh
node <this skill>/scripts/shoot.mjs launch/launch.json    # → launch/shots/*.png and *@2x.png
node <this skill>/scripts/stills.mjs launch/launch.json   # → launch/store/*.png
```

Open every PNG and look. Check that the shot shows the right moment, nothing is cut off or overlapping, text is readable, and crops (`"crop": [x, y, w, h]` in 1280×800 coordinates) frame the important part. Fix and re-run until each one is right.

Store images:
- `logo-300x300.png`: Edge's logo.
- `chrome-icon-128x128.png`: Chrome's store icon (96×96 artwork with transparent padding).
- `promo-440x280.png`: the small promotional tile, Chrome (required) and Edge.
- `marquee-1400x560.png`: Chrome's marquee, only made if `store.marquee` is set; optional, but needed to be featured.
- 1280×800 screenshots for all three stores. Lead with a full-bleed shot of the extension working, then 1 or 2 `feature` slides with a short headline each. Chrome takes up to 5.

## 5. Listing text

Write `launch/store.md` from `templates/listing.md`, with a section per store you're submitting to. Rules:

- **Short description** = the manifest `description` (132 characters at most). Say what it does, for whom, in plain words.
- **Description**: what it does, how to use it (the actual clicks or keys), and the privacy facts from step 2. No superlatives, no claims the code doesn't back, no keyword stuffing.
- **Single purpose**: one sentence. Every permission must serve it.
- **Permission justifications**: one or two sentences each: what it lets the extension do, when, and what it doesn't do. Reviewers reject vague ones ("needed for functionality").
- **Data usage**: "collected" means it leaves the user's device. Tick only what the code sends off the device. If nothing does, tick nothing, and make sure step 2 proves it.
- **Certification notes** (Edge), **notes to reviewer** (Firefox), and the test instructions field (Chrome): steps a reviewer can follow in two minutes with no account: where to click, what they'll see, how to see a result (a demo page if needed).
- **Firefox summary**: 250 characters at most; the manifest description usually works as is.
- **Firefox data collection**: the `data_collection_permissions` in the Firefox package must match the listing and the privacy policy. `["none"]` only if nothing leaves the device.

## 6. Privacy policy

Fill in `templates/privacy.html` (it has a comment explaining each part) and host it anywhere public, such as the project's website or GitHub Pages. It must say the same as the data usage answers: what's read, what's stored and where, what's sent and to whom, how to delete it, and a contact address. Put its URL in the listing.

## 7. Promo video

Add `"video": { "scenes": [...] }` to launch.json: a title card or two that state the problem, screenshots with captions showing the answer, real screen recordings (`"clip"`) if you have them, and an end card. Keep it 15 to 40 seconds.

```sh
node <this skill>/scripts/video.mjs launch/launch.json    # → launch/video/<name>-promo.mp4
```

Check it by pulling frames (`ffmpeg -ss <t> -i video.mp4 -frames:v 1 frame.png`) at each scene and looking at them.

## 8. Package

```sh
node <this skill>/scripts/package.mjs <build folder> --out launch/packages --firefox-id <name>@<their domain> --source <project folder>
```

- `<name>-<version>-chrome.zip`: upload to the Chrome Web Store and Edge Add-ons.
- `<name>-<version>-firefox.zip`: the same build with Firefox's manifest additions: the add-on ID, `data_collection_permissions` (`--data none` by default; pass the real categories if data leaves the device), `strict_min_version` 128, and background `scripts` instead of `service_worker`. The build folder isn't changed.
- `<name>-<version>-source.zip` (with `--source`): the last commit, for AMO when the code is bundled or minified. Commit before packaging so it matches the build. Write the build steps for the reviewer (install command, build command, Node version) in the Firefox notes.

The add-on ID must stay the same for every future Firefox version; write it into the project (for example in the build script) so the next release uses it too. Each zip is checked again as it's made. If `npx web-ext lint --source-dir <unzipped firefox package>` can run, use it as well: it's Mozilla's own linter.

## 9. Submit

Walk the user through each store's form, in its order, pasting from `store.md`.

**Chrome Web Store** (chrome.google.com/webstore/devconsole; a one-time developer registration fee):
1. New item → upload the chrome zip.
2. Store listing: description, category, language, store icon, screenshots, small promo tile, marquee if made, website and support links.
3. Privacy: single purpose, a justification per permission, remote code, data usage, privacy policy URL.
4. Distribution: visibility and regions. Then submit for review.

**Edge Add-ons** (partner.microsoft.com, Edge program; free):
1. Create new extension → upload the same chrome zip.
2. Availability and markets, then Properties: category, privacy policy URL, website, support.
3. Store listings: description, 300×300 logo, promo tile, screenshots, search terms.
4. Submit, with the certification notes.

**Firefox Add-ons** (addons.mozilla.org/developers; free):
1. Submit a new add-on → "On this site" to be listed on AMO → upload the firefox zip. Fix anything its automatic validation reports.
2. If asked whether the code is minified or bundled, say yes when it is and upload the source zip with the build steps.
3. Describe it: name, summary, description, categories, support email or website, licence, privacy policy if anything is collected.
4. Notes to reviewer, then submit. Add screenshots on the listing's edit page once it exists.

## 10. Hand over

Give the user: the zips that passed, `store.md` in each store's order, the images, the privacy policy URL and the video. Say plainly anything you couldn't verify, especially anything about Firefox you could only check statically.

## Store facts

| | Chrome Web Store | Edge Add-ons | Firefox Add-ons |
|---|---|---|---|
| Account | one-time registration fee | free | free |
| Name | 75 characters | the manifest name | the manifest name |
| Short description | manifest `description`, 132 characters | same | summary, 250 characters |
| `short_name` | | warns above 12 characters | |
| Icon | 128×128 store icon: 96×96 art, transparent padding | 300×300 logo | from the manifest |
| Screenshots | 1280×800 or 640×400, 1 to 5 | 1280×800 or 640×400 | 1280×800 works |
| Promo images | 440×280 tile required; 1400×560 marquee optional | 440×280 tile | none |
| Background | `service_worker` | `service_worker` | `scripts` (no extension service workers) |
| Add-on ID | assigned by the store | assigned by the store | `browser_specific_settings.gecko.id`, fixed forever |
| Data collection | privacy form | privacy form | `gecko.data_collection_permissions` in the manifest, required for new add-ons; Firefox 128+ |
| Bundled or minified code | fine | fine | upload the source and build steps |
| Files named `_*` | rejected (except `_locales`) | rejected | |
| Remote code | not allowed in Manifest V3 | not allowed | not allowed |
| Unneeded permissions | slows review | version rejected | queried in review |
