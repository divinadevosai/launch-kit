# <Name>: store listings

Packages in `launch/packages/` (made and checked by `package.mjs` on <date>): `<name>-<version>-chrome.zip` for Chrome and Edge, `<name>-<version>-firefox.zip` and `<name>-<version>-source.zip` for Firefox. Images are in `launch/store/`.

The shared text comes first; each store's own fields follow.

## Name
<from manifest.json>

## Short description (<n> characters, from manifest.json)
<manifest description>

## Description

<One line on what it does.>

<Who it's for and the problem, in two or three sentences.>

HOW IT WORKS
• <the actual click, key or gesture, and what happens>
• <…>

<WHAT IT DOES / FEATURES, if needed>

PRIVACY
• <only facts the code proves: what it reads, stores, sends>

<Price>. Made by <author>.

## Category
<one category>

## Search terms (Edge, up to 7)
<comma-separated>

## Images
| Slot | File |
|---|---|
| Store icon (128 × 128, Chrome) | `chrome-icon-128x128.png` |
| Logo (300 × 300, Edge) | `logo-300x300.png` |
| Small promotional tile (440 × 280, Chrome and Edge) | `promo-440x280.png` |
| Marquee (1400 × 560, Chrome, optional) | `marquee-1400x560.png` |
| Screenshots (1280 × 800, all three) | `1-…`, `2-…`, `3-…` |

## Links
- Website: <url>
- Privacy policy: <url>
- Support: <email or url>

---

## Chrome Web Store and Edge: privacy

### Single purpose description
> <one sentence>

### Permission justifications
- **<permission>:** <what it lets the extension do, when, and what it doesn't do>

### Remote code
**No, I am not using remote code.** <All JavaScript ships inside the package.>

### Data usage
Tick **<nothing / the boxes that apply>**. <Why: what the code sends off the device, or proof that it sends nothing.> Then tick the three certifications.

---

## Edge: notes for certification (Chrome: test instructions)
> <No account or login is needed.>
>
> HOW TO TEST
> 1. <…>
>
> Support: <contact>

---

## Firefox Add-ons

### Summary (≤ 250 characters)
<usually the manifest description>

### Categories
<one or two AMO categories>

### Add-on ID
`<name>@<domain>`: fixed for every future version.

### Data collection
`data_collection_permissions.required`: `<["none"] or the categories>`. <Why: the same facts as the privacy answers above.>

### Source code
<Is the code bundled or minified? If yes: upload `<name>-<version>-source.zip`, and add the build steps below to the notes.>

### Notes to reviewer
> <How to test, as above.>
>
> BUILD (if source is attached)
> Node <version>. `npm ci` then `npm run build`. The extension is in `dist/`; the upload is that folder with the Firefox manifest additions from package.mjs.
