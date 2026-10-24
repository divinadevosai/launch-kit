# Launch kit

A Claude Code plugin that takes a browser extension from "it works" to a finished Chrome Web Store and Edge Add-ons submission, in one session.

It checks the package for the things the stores reject before you upload. It photographs the extension really working, in its own colours and fonts. It writes the listing, permission justifications and privacy answers from what the code actually does, fills in a privacy policy, and cuts a short promo video.

![A store screenshot made by the kit for Loci](docs/example-search.png)

## Install

```
/plugin marketplace add divinadevosai/launch-kit
/plugin install launch-kit@swe3we
```

Then ask Claude something like *"get this extension ready for the Edge store"* and the `launch-kit` skill takes over.

It needs Node 18+, [Playwright](https://playwright.dev) with Chromium for screenshots, and `ffmpeg` for the video.

## What it does

| Step | What you get |
|---|---|
| **Pre-flight** (`lint.mjs`) | Catches rejections before review: names starting with `_`, `short_name` over 12 characters, a description over 132, remote code, unsafe CSP, missing or wrong-sized icons, files the manifest points at that aren't there, and permissions the code never calls. |
| **Fact-finding** | Reads the code for every permission, network call and bit of storage, so nothing in the listing is a guess. |
| **Screenshots** (`shoot.mjs`) | Loads the built extension in Chromium and photographs real moments, from extension pages or a demo page served on a `.example` address. |
| **Store images** (`stills.mjs`) | 300×300 logo, 440×280 promo tile, and 1280×800 screenshots: full-bleed or framed with a headline. |
| **Listing** | Description, single purpose, a justification per permission, remote-code and data-usage answers, and step-by-step notes for the reviewer. |
| **Privacy policy** | A one-file page to host anywhere, matching the data-usage answers. |
| **Promo video** (`video.mjs`) | 1080p: title cards, screenshots with a slow push in, screen recordings, captions, an end card and a quiet score. |

The scripts work on their own too:

```sh
node skills/launch-kit/scripts/lint.mjs path/to/dist-or.zip
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

It's the process behind [Glide](https://microsoftedge.microsoft.com/addons/detail/cdkijlnjnhdckkpepdehmmhehalpfghe) and [Invisible Ink](https://microsoftedge.microsoft.com/addons/detail/jbncjedcdohkmokiojopopddapilcnef) on Edge Add-ons, turned into a skill. The pre-flight checks are the mistakes those launches actually hit.

MIT licence. Made by [SWE3WE](https://swe3we.dev).
