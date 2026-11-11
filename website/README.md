# Say Yes — Beauty · Coffee · Bar

A redesigned public website for Say Yes Beauty Space in Tbilisi, based on the owner's
screenshots and publicly available content at https://say-yes-space.com/.

The original 43 photographs/assets, 32 menu items and prices, six service categories,
gallery, story, founder, products and external booking/contact links are retained.
`source-content.json` records the source content; `asset-map.json` maps originals to
optimized, locally hosted WebP images. `original.css` records the source visual palette.

The new presentation uses warm paper, sage, graphite and butter-yellow accents, editorial layouts, a photo
collage, an accessible full menu, lightbox, service dialogs and a Russian / Georgian / English language switch.
Motion is bundled locally from the official vanilla JavaScript API. No CRM code,
customer data, API or production domain configuration is included or modified.

## Build

- `npm ci`
- `python3 render.py` to regenerate static content from source JSON
- `npm run build` to bundle JavaScript and copy the stylesheet
- `npm run check` for JavaScript syntax

All generated files live in `dist/`. Text and images are visible without JavaScript;
JavaScript enhances tabs, dialogs, mobile navigation, language preferences and scroll animations.
Reduced motion disables animated entrances, image zoom and ticker movement.

The new Site is separate from the existing say-yes-space.com deployment.

## GSAP scroll scenes

GSAP and ScrollTrigger are bundled locally in `src/scroll-scenes.js`. They own
hero/section entrances, subtle desktop photo parallax and collage rotation.
Motion retains menu and dialog feedback; properties are not animated
by both engines on the same element. Touch layouts use only short entrances.
No scroll hijacking, section pinning or animated layout dimensions are used.
GSAP matchMedia reverts scroll effects when reduced motion changes or the
viewport crosses the desktop breakpoint. Focused blocks are revealed immediately.
Menu category changes refresh trigger positions after document height changes.

Verification: production build, JavaScript syntax checks and source-content/asset
integrity. Browser QA is unavailable in this managed session; physical iPhone and
Safari behavior have not been verified.

## Languages and palette

`npm run build` renders complete static pages at `/ru/`, `/ka/` and `/en/`,
including translated menu descriptions, services, gallery text, metadata and
accessible labels. The root defaults to Russian; a stored explicit selection
redirects future root visits to the chosen language. Locale links preserve the
current anchor and work without JavaScript. `locales/catalog.py` contains the
authored English and Georgian translations; missing Russian translations fail
the locale build. Booking and social links, images and menu prices are unchanged.
The 30-second game and its runtime, timer and styles have been removed. The
interface now uses graphite buttons and sage accents instead of oxblood.

## Owner video edit and visit information

`dist/video/` contains a silent 8.8-second H.264 montage (720×960) and a
540×720 mobile version, plus three short, manually played service films.
Social UI and embedded captions were cropped rather than generatively replaced.
The hero source is attached only when playback is permitted or requested.
Reduced motion, Save-Data and slow connections disable automatic loading;
background or off-screen playback is paused. Every film can be paused.

`video-edit.json` documents the edit. To reproduce with owner recordings, run
`python3 scripts/edit-videos.py --source-directory /path/to/recordings`. Four
other uploaded recordings exceeded the 32 MiB executor transfer limit and were
not used. Originals are not committed.

`reviews.json` records three sourced guest review summaries with dates and
original links. They are not quotations or live Google ratings. Google Maps
embedding and directions use the verified Kostava 71 address. Daily hours
10:00–22:00 were explicitly confirmed by the owner. All additions are translated
to RU/KA/EN. Staff profiles and before/after claims require verified material
and have not been invented from the videos.

## Location in the GitHub repository

This directory is the public website; the repository root contains a separate
CRM application. Run all website commands from `website/`.

Requirements: Node.js 22+ and Python 3. To build:

```sh
cd website
npm ci
npm run build
npm test
npm run check
```

To serve the finished website locally:

```sh
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080/`. Serve `dist/` as the web root: assets and language
pages use absolute paths such as `/assets/`, `/video/` and `/ka/`. Opening the
HTML directly as a file or under a subpath is not supported.

`npm run test:media` additionally requires `ffprobe`. Video re-editing requires
FFmpeg and Pillow; neither is needed to build or serve the already prepared videos.
The retained `.openai/hosting.json` identifies the existing Sites publication;
copying to GitHub does not change its domain or visitor access.

Imported source snapshot: `2a63c002361a79c6e43b3950b5433a99ed932e28`.
Raw uploads, local databases, Git metadata, node_modules and credentials are excluded.
