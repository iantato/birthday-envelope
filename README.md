# Birthday Envelope

Phases 1-5, available Phase 6 polish, and Phase 7 local validation for `../PLAN.md`. This is a fresh,
static Astro project using strict TypeScript and plain CSS, without a client
framework, backend, remote fonts, or media dependencies.

## Current Scope

The home page shows a closed, responsive white envelope with fine fold seams,
a subtle paper shadow, optional label/seal, and a small hint. A full-envelope
native button opens the flap, then lifts the paper behind the front pocket.
Duplicate activation is locked while opening, and the raised-paper button is
enabled only when the lift finishes. Reduced-motion preferences skip the motion
immediately, including when the preference changes during opening.

The raised-paper button opens a full-height native dialog containing the
configured letter, sign-off, and sender name. Close with the sticky "Back to
envelope" control or Escape; the envelope stays open and focus returns to the
paper. Reopening preserves the reader's scroll position and revealed wish.
The letter is personalized for Arshelle with the supplied birthday message,
followed by a single candle and "Open again" to reset the whole experience.
Photos, the placeholder signature, and the extra placeholder final note are
omitted. Music is optional and opt-in.

## Development

Use Node.js **22.23.4 or newer**, as required by the installed Astro 7.4.7
release, and npm 9.6.5 or newer. Run these commands from `birthday-envelope/`:

```sh
npm install
npm run dev
```

Open the local URL printed by Astro (normally `http://localhost:4321`).

```sh
npm run check
npm run build
npm run preview
```

`check` validates Astro and TypeScript files. `build` runs the check first and
creates static output in `dist/`. `preview` serves that production output.
`package-lock.json` records the installed dependency versions; use `npm ci`
for a reproducible clean installation.

## Personalization

Edit `src/data/siteContent.ts` for the page title, language, description, names,
letter paragraphs, captions, image/audio paths, seal details, and wish. The
current configuration contains Arshelle's name and the supplied personal letter.

Base design tokens are in `src/styles/global.css`. Override them through the
config's `theme` object, for example `theme: { '--bg': '#f6f6f6' }`. Envelope
paper/seal settings apply to the envelope now. Change `envelope.label` to name
the recipient or set it to an empty string to omit it. Set `sealEnabled` to
`false` for no sticker; `sealText` and `sealColor` customize the small round
sticker. `paperColor` controls the paper, flap, and bottom fold. `openLabel` and
`letterLabel` are accessible button names; `hint`, `openingHint`, and `liftedHint`
are the status text beneath the envelope. The paper preview uses the letter
greeting and three decorative lines, never the entire letter.

Edit `letter.paragraphs` to supply the full letter, one string per paragraph.
Text is escaped normally; HTML is not interpreted. Paired `**bold text**` markers
render as accessible strong emphasis. Newlines inside a paragraph
are preserved. `letter.signOff`, `senderName`, and `letter.closeLabel` control
the closing signature and reader close button. The same `envelope.paperColor`
is used for the preview and expanded reading surface. Leaving both signature
fields empty omits the signature; empty final heading/message fields omit that
copy while keeping replay available.

Place photos in `public/images/` and use paths like `/images/photo-1.webp` in
the config. Three original neutral SVG placeholders are included. Replace
their alt text and captions when supplying actual photos. Aim for 3-5 photos,
compressed to practical sizes. The gallery uses a single column on phones and
two columns on wider screens. Tapping a photo opens a native enlargement dialog.
Missing/empty image sources display a neutral unavailable placeholder instead
of a broken-image icon; an empty memories array omits the gallery altogether.
The `gallery` object controls its heading, button labels, and fallback text.

Place a licensed song in `public/audio/` and set `song.src`, for example
`/audio/our-song.mp3`. Keep the source empty to omit the audio element and play
control entirely. No song is bundled. Playback starts only from the play button,
never when loading the page or opening the envelope/letter. Play errors produce
an inline message. The `song` object includes editable play/pause labels and
error copy. Replay pauses playback and returns it to the beginning.

The `candle` object controls the prompt, accessible button name, hint, and wish.
The wish is announced once and stays revealed across reader close/reopen until
replay. `finalHeading`, `finalMessage`, and `replayLabel` control the last section.

### Phase 6 Personalization Status

Arshelle's name and the full supplied letter are configured, preserving the
original wording, heart emojis, and bold emphasis. `memories: []` removes the
entire photo section and enlargement dialog without requesting any photo assets.
No photos are needed for this version. The unsupplied sender signature and
extra placeholder final note are omitted; the candle and replay remain.
Before the site is gift-ready:

- The envelope currently reads "For Arshelle". Adjust it if the real envelope
  uses different wording. `recipientName` does not automatically replace that label.
- Supply a photo or description of the real envelope before changing paper
  color, label position, flap geometry, or sticker to match it. Color/sticker
  settings are in the content config; placement and folds are in
  `src/styles/envelope.css` and `src/components/EnvelopeScene.astro`.
- Supply a licensed song only if desired; leaving `song.src` empty is complete
  supported behavior, not a missing requirement.

The content-personalization item in `../PLAN.md` is complete. Physical-envelope
matching remains open until a photo or description is supplied.

Polish includes balanced headings, improved paragraph/caption wrapping, restrained
photo hover/press feedback, a safe-area-aware sticky photo close control, and
instant seal reset on replay. Photo button names describe the image; failed
photos announce their unavailable state and restore their original names if
the image recovers. The candle hint is linked to its accessible button.

Phase 6 verification passed the production build/type check without diagnostics,
all five specified widths, long-caption photo scrolling, accessible ID references,
failed-image label recovery, photo Escape/focus return, candle reveal, and replay.
Physical-device and OS-level reduced-motion testing remain for final validation.

## Structure

```text
public/favicon.svg           Local stationery favicon
public/images/memory-*.svg   Three neutral photo placeholders
public/audio/README.md       Optional audio instructions
src/pages/index.astro        Envelope home page and page metadata
src/data/siteContent.ts      Typed personalization configuration
src/components/              Envelope, reader, music, memories, candle, final note
src/scripts/experience.ts    Central state, media, dialogs, wish, and replay reset
src/styles/global.css       Tokens, typography, safe-area layout, focus styles
src/styles/envelope.css     Responsive envelope geometry, layers, and controls
src/styles/reader.css       Full-height paper dialog, typography, page scroll lock
```

The canonical implementation plan stays at `../PLAN.md` to avoid maintaining
two divergent copies.

## Opening Behavior

The flap rotates for 600ms and switches behind the letter at 300ms. Paper
movement starts at 350ms and lasts 850ms. The controller completes on the
paper's `transform` transition event, with a bounded fallback for browsers
that suppress it. Opacity and unrelated transition events cannot unlock the
paper early. In reduced-motion mode, transitions are disabled and the state
changes synchronously. A bottom-clipped paper slot prevents the sheet from
escaping beneath the envelope at intermediate frames. Short viewports scale
the composition down to leave room above for the flap and paper.

Phase 3 validation covered the production build at 320, 375, 390, 768, and
1280px widths, plus short desktop and phone-landscape heights. Sealed/lifted
screenshots at 390px and 1280px and an intermediate animation frame are saved
in `../.playwright-mcp/phase-3-*.png`. Browser checks exercised repeated clicks,
keyboard Enter/Space, focus transfer, transition event filtering, and the
missing-event fallback. Reduced-motion logic and mid-opening preference changes
were tested with a mocked media-query result; real iOS Safari and OS-level
reduced-motion preference testing remain for final cross-browser validation.

## Reader Behavior

The second tap opens a native modal dialog with a single vertical scroll
surface. The close control stays visible as the letter scrolls. The surface
uses `100dvh` with a `100vh` fallback, safe-area padding, 16-18px text, and a
restrained 180ms opacity/8px entry animation only when motion is permitted.
Native modal behavior keeps background controls inert. The controller locks
the page with a fixed body, restores its original scroll position on close,
and returns focus to the paper. Button close, Escape, programmatic close, and
development hot-reload cleanup all release the scroll lock. The reader keeps
its own scroll position when closed and reopened.

Phase 4 production validation covered 320, 375, 390, 768, and 1280px widths,
plus landscape. A 1,000-word sample was inserted only in the browser for testing;
the content configuration was not replaced. Checks covered internal scrolling,
sticky close visibility, background scroll locking/restoration, native modal
focus isolation, Escape, keyboard activation, and repeated close/reopen cycles
with preserved reading positions. Screenshots are in
`../.playwright-mcp/phase-4-*.png`. Type checking and production build passed
without diagnostics. Physical iPhone/iOS Safari and OS-level reduced-motion
testing remain part of final cross-browser validation.

## Supporting Features

Photo enlargement is a second native modal above the reader. Escape or "Back
to letter" closes only the photo and returns focus to its thumbnail. The reader
and page scroll lock remain active. Large photos use `object-fit: contain` to
preserve the complete image, while gallery thumbnails use a 4:3 crop.

The candle is a real button. Activating it fades the flame and politely announces
the configured wish; repeated activation cannot hide or repeat it. Motion is
disabled for reduced-motion preferences.

The single `resetExperience()` function in `src/scripts/experience.ts` stops and
rewinds music, invalidates pending playback, closes both dialogs, resets the
reader/page scroll, restores the candle and hints, reseals the envelope, releases
the page scroll lock, and returns focus to the envelope button. The same reset
also handles development cleanup without moving focus.

Phase 5 checks covered all five specified widths, captioned local SVG assets,
photo enlargement/escape/focus, image failure fallbacks, one-shot wishes, and
three full replay cycles (including replay with both dialogs open). Audio was
tested with a generated silent WAV in browser memory and a temporary configured
source, then the default empty source was restored. Checks covered no autoplay,
real play/pause, playback rejection, reset/rewind, and delayed play resolution
after replay. No test audio or copyrighted recording is shipped. Screenshots
are saved in `../.playwright-mcp/phase-5-*.png`. Final physical-device, iOS Safari,
and real OS reduced-motion checks remain for Phase 7.

## Repeatable Acceptance Tests

Install the test browsers once after installing npm dependencies:

```sh
npx playwright install chromium webkit
npm run test:e2e
```

`test:e2e` runs the type check and production build, then starts its own Astro
preview at `http://127.0.0.1:4330`. Stop any existing Astro preview for this
project first (`npm run astro -- preview stop`); Astro permits only one preview
instance per project. The suite deliberately does not reuse an existing server
that might serve a stale build. It stops its test server when finished.

The configuration is `playwright.config.ts`; tests are in
`tests/experience.spec.ts`. Seven projects cover Chromium at 320, 375, 390,
768, and 1280px, a touch-enabled mobile Chromium context, and mobile-sized
WebKit. Each project tests the sealed view and local assets, two deliberate
taps, repeated input, personalized text and emphasis, absence of photos, the one-shot candle,
close/reopen, replay twice, keyboard focus, a 1,000-word letter, page scroll
restoration, native browser reduced-motion emulation and mid-opening preference
changes, and audio error/reset behavior. Gallery-specific tests were replaced
with the photo-free personalization regression test for this version.

The post-personalization run completed with **55 passed, 1 skipped, 0 failed**.
This includes the full configured letter, both bold passages, Arshelle's envelope
label, no rendered photos or photo requests, and no placeholder signature/final note.
The skipped
case is real WAV playback in Windows WebKit, which returned
`MEDIA_ERR_SRC_NOT_SUPPORTED` for the generated silent fixture despite reporting
WAV capability. Chromium play/pause/no-autoplay/rewind checks passed; WebKit
still runs audio rejection and pending-playback reset tests. The fixture injects
optional audio markup before the bundled controller binds; it does not replace
the personal config or ship a recording in `dist/`.

`npm run check` and the final production build both completed with zero errors,
warnings, or hints. Generated test reports are excluded from type checking and
Git. Results and sealed/lifted screenshots are in `test-results/`; the HTML
report is `playwright-report/index.html`. To inspect it:

```sh
npx playwright show-report
```

These checks validate a local, deployable application, not a completed gift or
public deployment. Remaining release checks are:

- Complete the outstanding Phase 6 physical-envelope matching task using real inputs.
- Test on a physical iPhone/iOS Safari, including safe areas, touch scrolling,
  OS reduced motion, and the actual licensed audio file if music is configured.
- Test the final deployed HTTPS URL over cellular data and check the printed
  QR code from two phones. Automated WebKit is not physical Safari validation.

## Deployment and QR Code

The regenerated `dist/` folder is ready for static deployment. After personalizing
and completing the release checks, deploy it to a
static host such as Cloudflare Pages or Netlify. Use `npm run build` as the
build command and `dist` as the output directory, with this folder as the
project root. Root-relative asset paths assume deployment at the domain root.

Test the actual deployed HTTPS URL on a phone before generating a QR code.
Point the code to that stable URL, print it inside the physical envelope, and
test the printed code from two phones. Do not use a localhost or preview URL.

The page includes `noindex,nofollow` to discourage search indexing, but this is
**not access control**. Anyone with the URL can view the site and its assets.
Publish only personal content, photos, and music you have permission to share.
