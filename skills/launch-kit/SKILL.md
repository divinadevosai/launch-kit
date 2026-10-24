---
name: launch-kit
description: Get a browser extension ready for the Chrome Web Store and Microsoft Edge Add-ons, end to end - a pre-flight check for what stores reject, real screenshots, store images, listing text, permission justifications, privacy answers, a privacy policy page and a promo video. Use when someone wants to publish, launch, submit or update an extension, write its store listing, make its screenshots or promo video, or find out why a store rejected it.
---

# Launch kit

Takes a built Manifest V3 extension to a finished store submission. Everything you say in the listing must be true of the code, so read the code before writing a word, and look at every image you make before calling it done.

The scripts are in `scripts/` next to this file. They need Node 18+, Playwright with Chromium (set `PLAYWRIGHT` to Playwright's `index.mjs` if `import('playwright')` fails), and `ffmpeg` for the video.

## 1. Pre-flight

Build the extension, then:

```sh
node <this skill>/scripts/lint.mjs <build folder or zip>
```

- `✗` lines get the package rejected. Fix every one before going further.
- `!` lines are what reviewers query. Fix them, or know exactly why they're fine; an unused permission should be removed, not justified.
- The `·` notes list the permissions you'll have to justify.

Run it again on the exact zip you upload, last thing.

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

Store images: `logo-300x300.png` (Edge's logo), `promo-440x280.png` (small promotional tile), and 1280×800 screenshots. Lead with a full-bleed shot of the extension working, then 1 or 2 `feature` slides with a short headline each.

## 5. Listing text

Write `launch/store.md` from `templates/listing.md`. Rules:

- **Short description** = the manifest `description` (132 characters at most). Say what it does, for whom, in plain words.
- **Description**: what it does, how to use it (the actual clicks or keys), and the privacy facts from step 2. No superlatives, no claims the code doesn't back, no keyword stuffing.
- **Single purpose**: one sentence. Every permission must serve it.
- **Permission justifications**: one or two sentences each: what it lets the extension do, when, and what it doesn't do. Reviewers reject vague ones ("needed for functionality").
- **Data usage**: "collected" means it leaves the user's device. Tick only what the code sends off the device. If nothing does, tick nothing, and make sure step 2 proves it.
- **Certification notes**: steps a reviewer can follow in two minutes with no account: where to click, what they'll see, how to see a result (a demo page if needed).

## 6. Privacy policy

Fill in `templates/privacy.html` (it has a comment explaining each part) and host it anywhere public, such as the project's website or GitHub Pages. It must say the same as the data usage answers: what's read, what's stored and where, what's sent and to whom, how to delete it, and a contact address. Put its URL in the listing.

## 7. Promo video

Add `"video": { "scenes": [...] }` to launch.json: a title card or two that state the problem, screenshots with captions showing the answer, real screen recordings (`"clip"`) if you have them, and an end card. Keep it 15 to 40 seconds.

```sh
node <this skill>/scripts/video.mjs launch/launch.json    # → launch/video/<name>-promo.mp4
```

Check it by pulling frames (`ffmpeg -ss <t> -i video.mp4 -frames:v 1 frame.png`) at each scene and looking at them.

## 8. Hand over

Give the user: the zip that passed the lint, `store.md` in the order the store's form asks for things, the images, the privacy policy URL and the video. Say plainly anything you couldn't verify.

## Store facts

| | Chrome Web Store | Edge Add-ons |
|---|---|---|
| Name | 75 characters | same manifest name |
| Short description | manifest `description`, 132 characters | same |
| `short_name` | | warns above 12 characters |
| Icon | 128×128 PNG required | 300×300 logo in the listing |
| Screenshots | 1280×800 or 640×400 | 1280×800 or 640×400 |
| Small promo tile | 440×280 | 440×280 |
| Files named `_*` | rejected (except `_locales`) | rejected |
| Remote code | not allowed in Manifest V3 | not allowed |
| Unneeded permissions | slows review | version rejected |
