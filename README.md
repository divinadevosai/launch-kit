# Launch kit

A Claude Code plugin that takes a browser extension from "it works" to finished submissions for the **Chrome Web Store**, **Edge Add-ons** and **Firefox Add-ons**, in one session.

It checks the package for the things each store rejects before you upload, and makes a package per store, including the Firefox version and the source zip Mozilla's reviewers ask for. It photographs the extension really working, in its own colours and fonts. It writes the listing, permission justifications and privacy answers from what the code actually does, fills in a privacy policy, and cuts a short promo video.

![A store screenshot made by the kit for Loci](docs/example-search.png)

## Install

```
/plugin marketplace add divinadevosai/launch-kit
/plugin install launch-kit@swe3we
```

Then ask Claude something like *"get this extension ready for Chrome, Edge and Firefox"* and the `launch-kit` skill takes over.

It needs Node 18+, [Playwright](https://playwright.dev) with Chromium for screenshots, and `ffmpeg` for the video.

## What it does

| Step | What you get |
|---|---|
| **Pre-flight** (`lint.mjs`) | Catches rejections before review, per store: names starting with `_`, `short_name` over 12 characters, a description over 132, remote code, unsafe CSP, missing or wrong-sized icons, missing files, and permissions the code never calls. For Firefox: the add-on ID, the background script, the data-collection declaration new add-ons need, Chrome-only APIs, and bundled code that needs its source uploaded. |
| **Packages** (`package.mjs`) | One zip for Chrome and Edge, a Firefox zip with the manifest changes Firefox needs (your build isn't touched), and the source zip from the last commit. Each is checked as it's made. |
| **Fact-finding** | Reads the code for every permission, network call and bit of storage, so nothing in the listing is a guess. |
| **Screenshots** (`shoot.mjs`) | Loads the built extension in Chromium and photographs real moments, from extension pages or a demo page served on a `.example` address. |
| **Store images** (`stills.mjs`) | Edge's 300×300 logo, Chrome's padded 128×128 store icon, the 440×280 promo tile, Chrome's 1400×560 marquee, and 1280×800 screenshots: full-bleed or framed with a headline. |
| **Listing** | Description, single purpose, a justification per permission, remote-code and data-usage answers, Firefox's summary and data-collection declaration, and step-by-step notes for each store's reviewer. |
| **Submission** | A walk-through of each store's form in its own order. |
| **Privacy policy** | A one-file page to host anywhere, matching the data-usage answers. |
| **Promo video** (`video.mjs`) | 1080p: title cards, screenshots with a slow push in, screen recordings, captions, an end card and a quiet score. |

The scripts work on their own too:

```sh
node skills/launch-kit/scripts/lint.mjs path/to/dist-or.zip [--store chrome,edge,firefox]
node skills/launch-kit/scripts/package.mjs path/to/dist --firefox-id name@example.com --source .
node skills/launch-kit/scripts/shoot.mjs launch/launch.json
node skills/launch-kit/scripts/stills.mjs launch/launch.json
node skills/launch-kit/scripts/video.mjs launch/launch.json
```

`launch.json` describes the brand, the shots, the store images and the video. See [`templates/launch.example.json`](skills/launch-kit/templates/launch.example.json).

## Example

Everything below was made by the kit for [Loci](https://swe3we.dev), an extension that turns your browsing history into a memory palace.

![Feature slide](docs/example-feature.png)

![Promo tile](docs/example-tile.png)

## Why

It's the process behind [Glide](https://microsoftedge.microsoft.com/addons/detail/cdkijlnjnhdckkpepdehmmhehalpfghe) and [Invisible Ink](https://microsoftedge.microsoft.com/addons/detail/jbncjedcdohkmokiojopopddapilcnef) on Edge Add-ons, turned into a skill. The pre-flight checks are the mistakes those launches actually hit. The Firefox packages it makes for Invisible Ink and Loci pass Mozilla's own linter (`web-ext lint`) with no errors or warnings; for Glide, it correctly flags the camera code Firefox can't run as it is.

MIT licence. Made by [SWE3WE](https://swe3we.dev).
