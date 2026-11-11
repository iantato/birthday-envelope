import { test, expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { platform } from 'node:process';
import { siteContent } from '../src/data/siteContent';
import { transitionCandle, type CandleState } from '../src/scripts/candleState';

const scene = '[data-envelope-scene]';
const paper = '[data-letter-preview]';
const reader = '[data-letter-dialog]';

async function lift(page: Page) {
  await page.locator('[data-envelope-open]').click();
  await expect(page.locator(scene)).toHaveAttribute('data-stage', 'lifted');
  await expect(page.locator(paper)).toBeEnabled();
  await expect(page.locator(reader)).not.toBeVisible();
}

async function read(page: Page) {
  await lift(page);
  await page.locator(paper).click();
  await expect(page.locator(reader)).toBeVisible();
}

async function permissionAudioContext(page: Page) {
  // Windows WebKit can lack Web Audio. These permission-only cases never create nodes.
  await page.evaluate(() => {
    if (!window.AudioContext) Object.defineProperty(window, 'AudioContext', { configurable: true, value: class extends EventTarget {
      state = 'suspended';
      resume() { this.state = 'running'; return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
    } });
  });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // Assert errors after the test as well as during interaction.
  (page as Page & { acceptanceErrors: string[] }).acceptanceErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { acceptanceErrors: string[] }).acceptanceErrors).toEqual([]);
});

test('sealed page, local assets, semantics and viewport', async ({ page, request }, info) => {
  await page.goto('/');
  await expect(page.locator(scene)).toHaveAttribute('data-stage', 'sealed');
  await expect(page.locator(paper)).toBeDisabled();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('audio[data-audio]')).toHaveCount(1);
  await expect(page.locator('audio[data-audio]')).toBeHidden();
  expect(await page.locator('audio[data-audio]').evaluate((el: HTMLAudioElement) => ({
    src: new URL(el.src).pathname, preload: el.preload, loop: el.loop, controls: el.controls,
    outsideDialog: !el.closest('dialog'),
  }))).toEqual({ src: '/audio/saksi-ang-langit-piano.mp3', preload: 'auto', loop: true, controls: false, outsideDialog: true });
  for (const asset of ['/favicon.svg', '/images/memory-1.svg', '/images/memory-2.svg', '/images/memory-3.svg']) {
    expect((await request.get(asset)).ok()).toBeTruthy();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(await page.evaluate(() => [...document.querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby]')].every((el) =>
    ['aria-controls', 'aria-labelledby', 'aria-describedby'].every((attr) => !el.hasAttribute(attr) || el.getAttribute(attr)!.split(/\s+/).every((id) => document.getElementById(id)))))).toBeTruthy();
  await page.screenshot({ path: info.outputPath('sealed.png') });
  await lift(page);
  await page.screenshot({ path: info.outputPath('lifted.png') });
});

test('two taps, one-shot wish, close/reopen and replay twice', async ({ page, hasTouch }) => {
  await page.goto('/');
  for (let cycle = 0; cycle < 2; cycle++) {
    const open = page.locator('[data-envelope-open]');
    if (hasTouch) await open.tap(); else await open.click();
    await open.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.locator(scene)).toHaveAttribute('data-stage', 'lifted');
    await expect(page.locator(reader)).not.toBeVisible();
    if (hasTouch) await page.locator(paper).tap(); else await page.locator(paper).click();
    await expect(page.locator(reader)).toBeVisible();
    const candle = page.locator('[data-candle-trigger]');
    if (hasTouch) await candle.tap(); else await candle.click();
    await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
    const wish = await page.locator('[data-candle-wish]').textContent();
    expect(wish?.length).toBeGreaterThan(0);
    await candle.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator('[data-candle-wish]')).toHaveText(wish!);
    await page.keyboard.press('Escape');
    await expect(page.locator(paper)).toBeFocused();
    await page.locator(paper).click();
    await expect(page.locator('[data-candle-wish]')).toHaveText(wish!);
    await expect(page.locator('.candle-flame')).toHaveCSS('opacity', '0');
    await expect(page.locator('.candle-smoke')).toHaveCSS('animation-name', 'none');
    await page.locator('[data-replay]').click();
    await expect(page.locator(scene)).toHaveAttribute('data-stage', 'sealed');
    await expect(open).toBeFocused();
    await expect(candle).toBeEnabled();
    await expect(page.locator('[data-candle-wish]')).toHaveText('');
    expect(await page.evaluate(() => scrollY === 0 && !document.body.classList.contains('letter-reading'))).toBeTruthy();
  }
});

test('candle state machine maps success, failure, cancel, fallback and reset', () => {
  expect(transitionCandle('idle', 'ready')).toBe('requesting-permission');
  expect(transitionCandle('requesting-permission', 'allowed')).toBe('calibrating');
  expect(transitionCandle('calibrating', 'calibrated')).toBe('listening');
  expect(transitionCandle('listening', 'blow')).toBe('extinguishing');
  expect(transitionCandle('extinguishing', 'finished')).toBe('revealed');
  const states: CandleState[] = ['idle', 'requesting-permission', 'calibrating', 'listening', 'fallback-ready', 'extinguishing', 'revealed'];
  for (const state of states) expect(transitionCandle(state, 'reset')).toBe('idle');
  for (const state of ['requesting-permission', 'calibrating', 'listening'] as const) {
    expect(transitionCandle(state, 'failed')).toBe('fallback-ready');
    expect(transitionCandle(state, 'cancel')).toBe('idle');
  }
  for (const state of states.slice(0, 5)) expect(transitionCandle(state, 'tap')).toBe('extinguishing');
  expect(transitionCandle('listening', 'timeout')).toBe('fallback-ready');
  expect(transitionCandle('idle', 'blow')).toBe('idle');
  expect(transitionCandle('extinguishing', 'tap')).toBe('extinguishing');
  expect(transitionCandle('extinguishing', 'blow')).toBe('extinguishing');
  expect(transitionCandle('extinguishing', 'failed')).toBe('extinguishing');
  expect(transitionCandle('revealed', 'tap')).toBe('revealed');
  expect(transitionCandle('revealed', 'allowed')).toBe('revealed');
});

test('candle consent copy, denied microphone, keyboard fallback and Replay reset', async ({ page }) => {
  await page.goto('/');
  await read(page);
  const section = page.locator('[data-candle-section]');
  const ready = page.getByRole('button', { name: siteContent.candle.readyLabel, exact: true });
  const fallback = page.getByRole('button', { name: 'Tap to blow instead', exact: true });
  const status = page.locator('[data-candle-status]');
  await expect(section).toHaveAttribute('data-candle-state', 'idle');
  await expect(page.locator('#candle-hint')).toHaveText(siteContent.candle.hint);
  await expect(page.locator('#candle-privacy')).toHaveCount(0);
  await expect(ready).toBeEnabled();
  await expect(fallback).toBeEnabled();
  await expect(page.locator('[data-candle-cancel]')).toBeHidden();
  await permissionAudioContext(page);
  // Deterministic denial: never depend on the host machine's microphone/permissions.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => Promise.reject(new DOMException('Test denial', 'NotAllowedError')),
    } });
  });
  await ready.focus();
  await page.keyboard.press('Enter');
  await expect(section).toHaveAttribute('data-candle-state', 'fallback-ready');
  await expect(status).toHaveText(siteContent.candle.deniedMessage);
  await fallback.focus();
  await expect(fallback).toBeEnabled();
  await page.keyboard.press('Space');
  await expect(section).toHaveAttribute('data-candle-state', 'revealed');
  await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
  await expect(fallback).toBeDisabled();
  await expect(status).toHaveText(siteContent.candle.doneLabel);
  await page.locator('[data-replay]').click();
  await read(page);
  await expect(section).toHaveAttribute('data-candle-state', 'idle');
  await expect(ready).toBeEnabled();
  await expect(fallback).toBeEnabled();
  await expect(status).toHaveText('');
  await expect(page.locator('[data-candle-wish]')).toHaveText('');
  await expect(page.locator('[data-candle-trigger]')).toHaveAttribute('data-blown', 'false');
  await fallback.click();
  await expect(section).toHaveAttribute('data-candle-state', 'revealed');
  expect(await page.locator(reader).evaluate((el) => el.scrollWidth === el.clientWidth)).toBeTruthy();
});

test('Replay cancels an in-flight candle reveal', async ({ page }) => {
  await page.goto('/');
  await read(page);
  await page.locator('[data-candle-fallback]').evaluate((button: HTMLButtonElement) => {
    button.click();
    document.querySelector<HTMLButtonElement>('[data-replay]')!.click();
  });
  await read(page);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'idle');
  await expect(page.locator('[data-candle-wish]')).toHaveText('');
});

test('reference-inspired signed ending places the wish button above an illustrated cake', async ({ page }, info) => {
  await page.goto('/');
  await read(page);
  await page.evaluate(() => document.fonts.ready);
  const ready = page.getByRole('button', { name: 'make a wish', exact: true });
  await expect(ready).toBeEnabled();
  await expect(page.getByRole('button', { name: "I'm ready", exact: true })).toHaveCount(0);
  await expect(page.locator('.reader-signature')).toContainText('Love,');
  await expect(page.locator('.reader-sender')).toHaveText('Christian');
  await expect(page.locator('.birthday-cake')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.wish-divider')).toHaveAttribute('aria-hidden', 'true');
  const order = await page.evaluate(() => {
    const signature = document.querySelector('.reader-signature')!.getBoundingClientRect();
    const heading = document.querySelector('#candle-heading')!.getBoundingClientRect();
    const ready = document.querySelector('[data-candle-ready]')!.getBoundingClientRect();
    const cake = document.querySelector('[data-candle-trigger]')!.getBoundingClientRect();
    const fallback = document.querySelector('[data-candle-fallback]')!.getBoundingClientRect();
    return [signature.bottom <= heading.top, heading.bottom <= ready.top,
      ready.bottom <= cake.top, cake.bottom <= fallback.top];
  });
  expect(order).toEqual([true, true, true, true]);
  await page.locator('[data-candle-section]').screenshot({ path: info.outputPath('wish-reference-ending.png') });
  expect(await page.locator(reader).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  await page.locator('[data-candle-fallback]').click();
  await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
  await page.locator('[data-replay]').click();
  await read(page);
  await expect(ready).toBeEnabled();
  await expect(page.locator('[data-candle-trigger]')).toHaveAttribute('data-blown', 'false');
});

test('candle bends, fades, smokes and reveals without moving surrounding content', async ({ page }, info) => {
  await page.goto('/');
  await read(page);
  await page.locator('[data-candle-fallback]').scrollIntoViewIfNeeded();
  const result = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('[data-candle-section]')!;
    const button = document.querySelector<HTMLButtonElement>('[data-candle-fallback]')!;
    const flame = section.querySelector<HTMLElement>('.candle-flame')!;
    const smoke = section.querySelector<SVGElement>('.candle-smoke')!;
    const reader = document.querySelector('[data-letter-dialog]')!;
    const geometry = () => [section.offsetHeight, reader.scrollHeight, (document.querySelector('.final-section') as HTMLElement).offsetTop];
    const before = geometry();
    const flicker = getComputedStyle(section.querySelector('.candle-flame-core')!).animationName;
    button.click();
    const animations = flame.getAnimations() as CSSAnimation[];
    const smokeAnimation = smoke.getAnimations()[0] as CSSAnimation;
    const bend = animations.find((animation) => animation.animationName === 'candle-bend')!;
    const fade = animations.find((animation) => animation.animationName === 'candle-extinguish')!;
    for (const animation of [...animations, smokeAnimation]) { animation.pause(); animation.currentTime = 0; }
    bend.currentTime = 150;
    const bent = getComputedStyle(flame).transform;
    bend.currentTime = 200;
    fade.currentTime = 360;
    const fading = Number(getComputedStyle(flame).opacity);
    const smokeBefore = Number(getComputedStyle(smoke).opacity);
    smokeAnimation.currentTime = 900;
    const smokeDuring = Number(getComputedStyle(smoke).opacity);
    const beforeWish = section.querySelector('[data-candle-wish]')!.textContent;
    // A second trigger must not recreate either animation or restart its timeline.
    document.querySelector<HTMLButtonElement>('[data-candle-trigger]')!.click();
    const sameSmoke = smoke.getAnimations()[0] === smokeAnimation;
    const timings = { bend: bend.effect!.getTiming().duration, fade: fade.effect!.getTiming().duration,
      smoke: smokeAnimation.effect!.getTiming().duration, smokeDelay: smokeAnimation.effect!.getTiming().delay };
    bend.finish(); fade.finish();
    return { before, after: geometry(), flicker, bent, fading, smokeBefore, smokeDuring, beforeWish, sameSmoke, timings };
  });
  expect(result.flicker).toBe('candle-flicker');
  expect(result.bent).not.toBe('matrix(1, 0, 0, 1, -6, 0)');
  expect(result.fading).toBeGreaterThan(0);
  expect(result.fading).toBeLessThan(1);
  expect(result.smokeBefore).toBe(0);
  expect(result.smokeDuring).toBeGreaterThan(0);
  expect(result.beforeWish).toBe('');
  expect(result.sameSmoke).toBeTruthy();
  expect(result.timings).toEqual({ bend: 200, fade: 320, smoke: 1200, smokeDelay: 520 });
  expect(result.after).toEqual(result.before);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'revealed');
  await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
  await expect(page.locator('[data-candle-wish]')).toHaveCSS('animation-name', 'candle-wish');
  await expect(page.locator('[data-candle-wish]')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath('candle-smoke-and-wish.png') });
  await page.locator('[data-replay]').click();
  await read(page);
  await expect(page.locator('.candle-smoke')).toHaveCSS('opacity', '0');
  await expect(page.locator('.candle-smoke')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.candle-flame')).toHaveCSS('opacity', '1');
  // CSS animation effects must not restart just because the dialog reopens.
  await page.locator('[data-candle-fallback]').click();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'revealed');
  await page.locator('[data-letter-close]').click();
  await page.locator(paper).click();
  await expect(page.locator('.candle-flame')).toHaveCSS('opacity', '0');
  await expect(page.locator('.candle-smoke')).toHaveCSS('animation-name', 'none');
});

test('candle reveal has a timer escape hatch and honors reduced motion mid-extinguish', async ({ page }) => {
  await page.goto('/');
  await read(page);
  await page.clock.install();
  await page.locator('[data-candle-fallback]').evaluate((button: HTMLButtonElement) => {
    button.click();
    // Removing the animation suppresses animationend; the bounded timer must finish.
    document.querySelector<HTMLElement>('.candle-flame')!.style.animation = 'none';
  });
  await page.clock.runFor(700);
  await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
  await page.locator('[data-replay]').click();
  await read(page);
  await page.locator('[data-candle-fallback]').evaluate((button: HTMLButtonElement) => {
    document.querySelector<HTMLElement>('.candle-flame')!.style.removeProperty('animation');
    button.click();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'revealed');
  await expect(page.locator('.candle-smoke')).toHaveCSS('opacity', '0');
  await expect(page.locator('.candle-smoke')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.candle-flame-core')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('[data-candle-wish]')).toHaveCSS('opacity', '1');
});

test('keyboard opening, visible focus and Escape', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-envelope-open]')).toBeFocused();
  expect(await page.locator('[data-envelope-open]').evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Space');
  await expect(page.locator(paper)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-letter-close]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator(paper)).toBeFocused();
});

test('1000-word letter, scroll lock and preserved reading position', async ({ page }) => {
  await page.goto('/');
  await lift(page);
  await page.evaluate(() => {
    const paragraphs = document.querySelector('[data-letter-paragraphs]')!;
    paragraphs.replaceChildren(...Array.from({ length: 10 }, () => {
      const p = document.createElement('p');
      p.textContent = 'This sample paragraph checks comfortable reading without inventing personal memories. '.repeat(10);
      return p;
    }));
    const spacer = document.createElement('div');
    spacer.style.height = '1800px';
    document.body.append(spacer);
    window.scrollTo(0, 200);
    document.querySelector<HTMLButtonElement>('[data-letter-preview]')!.click();
  });
  await expect(page.locator(reader)).toBeVisible();
  expect(await page.locator(reader).evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollWidth === el.clientWidth)).toBeTruthy();
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe('fixed');
  await page.locator(reader).evaluate((el) => { el.scrollTop = 800; });
  await expect.poll(() => page.locator(reader).evaluate((el) => el.scrollTop)).toBe(800);
  // Click the visible sticky control without locator auto-scrolling it to its flow position.
  const closeBounds = await page.locator('[data-letter-close]').boundingBox();
  expect(closeBounds).not.toBeNull();
  await page.mouse.click(closeBounds!.x + closeBounds!.width / 2, closeBounds!.y + closeBounds!.height / 2);
  await expect(page.locator(paper)).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(200);
  await page.locator(paper).click();
  await expect.poll(() => page.locator(reader).evaluate((el) => el.scrollTop)).toBe(800);
});

test('real reduced-motion emulation and mid-opening preference change', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const immediate = await page.locator('[data-envelope-open]').evaluate((button: HTMLButtonElement) => {
    button.click();
    return document.querySelector('[data-envelope-scene]')!.getAttribute('data-stage');
  });
  expect(immediate).toBe('lifted');
  await page.locator(paper).click();
  await page.locator('[data-candle-trigger]').click();
  await expect(page.locator('[data-candle-wish]')).not.toHaveText('');
  await expect.poll(() => page.locator('.candle-flame').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await page.locator('[data-replay]').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('[data-envelope-open]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator(scene)).toHaveAttribute('data-stage', 'lifted');
});

test('Arshelle receives the full formatted letter without photos or placeholder copy', async ({ page }) => {
  const imageRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image' && request.url().includes('/images/')) imageRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page).toHaveTitle('A letter for Arshelle');
  await expect(page.locator('.envelope-label')).toHaveCount(0);
  await read(page);
  await expect(page.locator('#letter-greeting')).toHaveText('Happy Birthday, my love! ❤️');
  await expect(page.locator('[data-letter-paragraphs] > p')).toHaveText(siteContent.letter.paragraphs.map((paragraph) => paragraph.replaceAll('**', '')));
  await expect(page.locator('[data-letter-paragraphs] strong')).toHaveText([
    'we get to grow old and ugly together HAHAHA.',
    'I love you so much, always. ❤️',
  ]);
  await expect(page.locator(`${reader} img, [data-memory-open], [data-photo-dialog]`)).toHaveCount(0);
  await expect(page.locator('.reader-sign-off')).toHaveText('Love,');
  await expect(page.locator('.reader-sender')).toHaveText('Christian');
  await expect(page.locator(reader)).not.toContainText('From Me');
  await expect(page.locator(reader)).not.toContainText('One last thing');
  await page.locator('[data-replay]').scrollIntoViewIfNeeded();
  expect(imageRequests).toEqual([]);
  expect(await page.locator(reader).evaluate((el) => el.scrollWidth === el.clientWidth)).toBeTruthy();
});

async function musicFixture(page: Page, populated = false) {
  // Point the production audio element at a deterministic generated WAV.
  await page.route('http://127.0.0.1:4330/', async (route) => {
    const response = await route.fetch();
    let html = (await response.text()).replaceAll('/audio/saksi-ang-langit-piano.mp3', '/test-tone.wav');
    if (populated) {
      // Exercise optional controller markup without changing the real personal content.
      const gallery = `<section class="reader-section" aria-labelledby="memories-heading">
        <h2 id="memories-heading">${siteContent.gallery.heading}</h2><div class="memory-list">
        ${[1, 2].map((index) => `<figure class="memory-figure"><button class="memory-open" type="button"
          data-memory-open data-caption="Memory ${index}" aria-label="Open memory ${index}"
          aria-haspopup="dialog" aria-controls="photo-dialog">
          <span class="memory-placeholder" data-memory-fallback hidden role="img" aria-label="Photo unavailable"></span>
          <img class="memory-image" data-memory-image src="/images/memory-${index}.svg" alt="Memory photograph ${index}" loading="lazy" decoding="async">
          </button><figcaption>Memory ${index}</figcaption></figure>`).join('')}
        <figure class="memory-figure"><button class="memory-open" type="button" data-memory-open disabled aria-label="Photo unavailable">
          <span class="memory-placeholder" data-memory-fallback role="img" aria-label="Photo unavailable">Photo unavailable</span>
        </button><figcaption>An unconfigured memory</figcaption></figure></div>
        <dialog class="photo-dialog" id="photo-dialog" data-photo-dialog aria-label="Memory photograph" aria-describedby="photo-caption">
          <button class="text-control" type="button" data-photo-close autofocus>Close photo</button><figure>
          <img class="photo-image" data-photo-image alt="" hidden>
          <div class="photo-placeholder" data-photo-fallback hidden>Photo unavailable</div>
          <figcaption id="photo-caption" data-photo-caption></figcaption></figure></dialog></section>`;
      html = html.replace('<section class="reader-section candle-section"', `${gallery}<section class="reader-section candle-section"`)
        .replace(/<section class="reader-section final-section"[^>]*>/,
          '<section class="reader-section final-section" aria-labelledby="final-heading"><h2 id="final-heading">A final birthday note</h2><p>A quiet ending to the letter.</p>');
    }
    await route.fulfill({ response, body: html });
  });
  const wav = Buffer.alloc(44 + 16000 * 2 * 30);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  let requests = 0;
  await page.route('**/test-tone.wav', (route) => { requests++; return route.fulfill({ contentType: 'audio/wav', body: wav }); });
  return () => requests;
}

test('populated memories, personal wish and final message remain in order across Replay', async ({ page }) => {
  await musicFixture(page, true);
  await page.goto('/');
  await read(page);
  const memories = page.locator('[data-memory-open]');
  await expect(memories).toHaveCount(3);
  await expect(memories.nth(2)).toBeDisabled();
  const sections = await page.locator('.reader-letter > section').evaluateAll((sections) => sections.map((section) => section.querySelector('h2')?.textContent));
  expect(sections).toEqual([siteContent.gallery.heading, siteContent.candle.prompt, 'A final birthday note']);
  // The final section is reachable even before the candle is extinguished.
  await page.getByRole('heading', { name: 'A final birthday note' }).scrollIntoViewIfNeeded();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'idle');
  for (let index = 0; index < 2; index++) {
    await memories.nth(index).scrollIntoViewIfNeeded();
    await expect(memories.nth(index)).toBeEnabled();
    await memories.nth(index).click();
    await expect(page.locator('[data-photo-dialog]')).toBeVisible();
    await expect(page.locator('[data-photo-image]')).toBeVisible();
    await expect(page.locator('[data-photo-image]')).toHaveAttribute('alt', `Memory photograph ${index + 1}`);
    await expect(page.locator('[data-photo-caption]')).toHaveText(`Memory ${index + 1}`);
    if (index === 0) await page.keyboard.press('Escape');
    else await page.locator('[data-photo-close]').click();
    await expect(page.locator('[data-photo-dialog]')).not.toBeVisible();
    await expect(page.locator(reader)).toBeVisible();
    await expect(memories.nth(index)).toBeFocused();
  }
  await page.locator('[data-candle-fallback]').click();
  await expect(page.locator('[data-candle-wish]')).toHaveText('I hope this year gives you so many reasons to smile.');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('.final-section')).toContainText('A quiet ending to the letter.');
  await expect(page.locator(scene)).toHaveAttribute('data-stage', 'reading');
  await page.locator('[data-replay]').click();
  await expect(page.locator(scene)).toHaveAttribute('data-stage', 'sealed');
  await read(page);
  await expect(page.locator('[data-candle-wish]')).toHaveText('');
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'idle');
  await memories.first().click();
  await expect(page.locator('[data-photo-image]')).toBeVisible();
  await expect(page.locator('[data-photo-caption]')).toHaveText('Memory 1');
});

test('photo opening and Replay cancel microphone use without re-requesting on return', async ({ page }) => {
  await musicFixture(page, true);
  await page.goto('/');
  await read(page);
  await page.locator('[data-memory-open]').first().scrollIntoViewIfNeeded();
  await expect(page.locator('[data-memory-open]').first()).toBeEnabled();
  await permissionAudioContext(page);
  await page.evaluate(() => {
    let calls = 0;
    let stopped = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => {
        document.documentElement.dataset.micCalls = String(++calls);
        return new Promise<MediaStream>((resolve) => {
          document.addEventListener('resolve-integration-mic', () => resolve({ getTracks: () => [1, 2].map(() => ({
            stop: () => { document.documentElement.dataset.micStops = String(++stopped); },
          })) } as unknown as MediaStream), { once: true });
        });
      },
    } });
  });
  await page.locator('[data-candle-ready]').click();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'requesting-permission');
  // Activate without scrolling away first, to exercise the photo handler's cleanup.
  await page.locator('[data-memory-open]').first().evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('[data-photo-dialog]')).toBeVisible();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'idle');
  await page.evaluate(() => document.dispatchEvent(new Event('resolve-integration-mic')));
  await expect(page.locator('html')).toHaveAttribute('data-mic-stops', '2');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-photo-dialog]')).not.toBeVisible();
  await page.locator('[data-candle-ready]').click();
  await expect(page.locator('html')).toHaveAttribute('data-mic-calls', '2');
  await page.locator('[data-replay]').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator(scene)).toHaveAttribute('data-stage', 'sealed');
  await read(page);
  await expect(page.locator('[data-candle-ready]')).toBeEnabled();
  await expect(page.locator('[data-candle-status]')).toHaveText('');
  await expect(page.locator('[data-candle-wish]')).toHaveText('');
  await expect(page.locator('.candle-flame')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-effects', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-mic-calls', '2');
  await page.evaluate(() => document.dispatchEvent(new Event('resolve-integration-mic')));
  await expect(page.locator('html')).toHaveAttribute('data-mic-stops', '4');
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'idle');
});

test('background audio binds immediately, retries blocked autoplay, and survives letter close and Replay', async ({ page }) => {
  await musicFixture(page);
  await page.addInitScript(() => {
    let attempts = 0;
    let paused = true;
    let time = 0;
    // Mock playback independently of the host's installed media codecs.
    document.addEventListener('error', (event) => {
      if (event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
    }, true);
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get: () => paused });
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { get: () => time, set: (value: number) => { time = value; } });
    HTMLMediaElement.prototype.play = function () {
      document.documentElement.dataset.songPlays = String(++attempts);
      document.documentElement.dataset.songVolume = String(this.volume);
      if (attempts <= 2) return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
      paused = false;
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () { paused = true; };
  });
  await page.goto('/');
  const audio = page.locator('audio[data-audio]');
  await expect(audio).toHaveCount(1);
  await expect(audio).toBeHidden();
  await expect(page.locator('link[rel="preload"][as="audio"]')).toHaveAttribute('href', '/test-tone.wav');
  expect(await audio.evaluate((el: HTMLAudioElement) => ({
    outsideDialog: !el.closest('dialog'), src: new URL(el.src).pathname,
    preload: el.preload, autoplay: el.autoplay, loop: el.loop, controls: el.controls,
    volume: el.volume,
  }))).toEqual({ outsideDialog: true, src: '/test-tone.wav', preload: 'auto', autoplay: true, loop: true, controls: false, volume: 0.1 });
  await expect(page.locator('html')).toHaveAttribute('data-song-plays', '1');
  await expect(page.locator('html')).toHaveAttribute('data-song-volume', '0.1');
  await expect(page.locator('[data-music-toggle], [data-music-status], audio[controls]')).toHaveCount(0);
  await expect(page.locator('[data-envelope-hint]')).toHaveText(siteContent.song.interactionHint);
  await page.mouse.move(5, 5);
  await page.mouse.down();
  await expect(page.locator('html')).toHaveAttribute('data-song-plays', '2');
  await page.mouse.up();
  await expect(page.locator('html')).toHaveAttribute('data-song-plays', '3');
  await expect(audio).toHaveJSProperty('paused', false);
  await expect(page.locator('[data-envelope-hint]')).toHaveText(siteContent.envelope.hint);
  await page.keyboard.press('x');
  await read(page);
  await page.locator('[data-letter-close]').click();
  await expect(audio).toHaveJSProperty('loop', true);
  await page.locator(paper).click();
  await audio.evaluate((el: HTMLAudioElement) => { el.currentTime = 2; });
  await page.locator('[data-replay]').click();
  await expect(page.locator(scene)).toHaveAttribute('data-stage', 'sealed');
  expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBe(2);
  await expect(audio).toHaveJSProperty('paused', false);
  await expect(page.locator('html')).toHaveAttribute('data-song-plays', '3');
});

test('supplied MP3 loads and plays at low volume without controls', async ({ page, request, browserName }) => {
  test.skip(browserName === 'webkit' && platform === 'win32', 'Verify MP3 playback on real Safari; Windows WebKit media codecs differ.');
  const response = await request.get(siteContent.song.src);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('audio/mpeg');
  expect((await response.body()).byteLength).toBeGreaterThan(44);
  await page.goto('/');
  const audio = page.locator('[data-audio]');
  await page.mouse.click(5, 5);
  await expect(audio).toHaveJSProperty('paused', false);
  await expect(audio).toHaveJSProperty('volume', 0.1);
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.duration)).toBeGreaterThan(0);
});

test('microphone access and delayed teardown do not pause or rewind music across Replay', async ({ page }) => {
  await musicFixture(page);
  await page.addInitScript(() => {
    document.addEventListener('error', (event) => {
      if (event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
    }, true);
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  });
  await page.goto('/');
  const audio = page.locator('[data-audio]');
  await read(page);
  await page.evaluate(() => {
    const el = document.querySelector<HTMLAudioElement>('[data-audio]')!;
    let paused = false;
    Object.defineProperty(el, 'paused', { configurable: true, get: () => paused });
    Object.defineProperty(el, 'currentTime', { configurable: true, writable: true, value: 2 });
    el.play = () => { paused = false; return Promise.resolve(); };
    el.pause = () => { paused = true; };
    const session = { type: 'playback' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class extends EventTarget {
      state = 'running';
      resume() { return Promise.resolve(); }
      close() { this.state = 'closed'; return new Promise<void>((resolve) => {
        document.addEventListener('finish-music-close', () => resolve(), { once: true });
      }); }
    } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => {
        if (paused) throw new Error('Music must keep playing during microphone access');
        if (session.type !== 'play-and-record') throw new Error('Concurrent playback routing must be set before capture');
        return new Promise(() => {});
      },
    } });
  });
  await page.locator('[data-candle-ready]').click();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'requesting-permission');
  await expect(audio).toHaveJSProperty('paused', false);
  // Recover a browser-generated interruption without waiting for the user to cancel.
  await audio.evaluate((el: HTMLAudioElement) => { el.pause(); el.dispatchEvent(new Event('pause')); });
  await expect(audio).toHaveJSProperty('paused', false);
  await page.locator('[data-candle-cancel]').click();
  await page.locator('[data-replay]').click();
  await read(page);
  await expect(audio).toHaveJSProperty('paused', false);
  expect(await page.evaluate(() => (navigator as any).audioSession.type)).toBe('play-and-record');
  await page.evaluate(() => document.dispatchEvent(new Event('finish-music-close')));
  await expect.poll(() => page.evaluate(() => (navigator as any).audioSession.type)).toBe('playback');
  await expect(audio).toHaveJSProperty('paused', false);
  expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBe(2);
});

test('pending play can finish during microphone use without being paused or restarted', async ({ page }) => {
  await page.addInitScript(() => {
    let paused = true;
    let attempts = 0;
    document.addEventListener('error', (event) => {
      if (event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
    }, true);
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get: () => paused });
    HTMLMediaElement.prototype.play = function () {
      document.documentElement.dataset.songPlays = String(++attempts);
      return new Promise<void>((resolve) => document.addEventListener('resolve-late-play', () => {
        paused = false;
        this.dispatchEvent(new Event('play'));
        resolve();
      }, { once: true }));
    };
    HTMLMediaElement.prototype.pause = function () { paused = true; };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-song-plays', '1');
  await read(page);
  await permissionAudioContext(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise(() => {}) } });
  });
  await page.locator('[data-candle-ready]').click();
  await page.evaluate(() => document.dispatchEvent(new Event('resolve-late-play')));
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'requesting-permission');
  await expect(page.locator('[data-audio]')).toHaveJSProperty('paused', false);
  await page.keyboard.press('x');
  await expect(page.locator('html')).toHaveAttribute('data-song-plays', '1');
  await page.locator('[data-candle-cancel]').click();
  await expect(page.locator('html')).toHaveAttribute('data-song-plays', '1');
  await expect(page.locator('[data-audio]')).toHaveJSProperty('paused', false);
});

for (const breathKind of ['hiss', 'wind']) {
  test(`native Web Audio analyser detects quiet synthetic ${breathKind} while music plays`, async ({ page }) => {
    await page.goto('/');
    test.skip(!await page.evaluate(() => Boolean(window.AudioContext?.prototype.createMediaStreamDestination)),
      'This browser build lacks native Web Audio stream generation.');
    await read(page);
    const audio = page.locator('[data-audio]');
    await expect(audio).toHaveJSProperty('paused', false);
    const musicTime = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
    await page.evaluate((breathKind) => {
      if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
      navigator.mediaDevices.getUserMedia = async () => {
        // A synthetic stream exercises real browser audio nodes, not a physical mic.
        const context = new AudioContext();
        await context.resume();
        const noise = context.createBufferSource();
        const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = buffer.getChannelData(0);
        let seed = 1;
        for (let index = 0; index < samples.length; index++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[index] = seed / 0x100000000 * 2 - 1;
        }
        noise.buffer = buffer;
        noise.loop = true;
        const gain = context.createGain();
        const output = context.createMediaStreamDestination();
        gain.gain.value = 0.002;
        if (breathKind === 'wind') {
          const filter = context.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 400;
          filter.Q.value = 0.7;
          noise.connect(filter).connect(gain);
        } else {
          noise.connect(gain);
        }
        gain.connect(output);
        noise.start();
        document.addEventListener('start-synthetic-blow', () => { gain.gain.value = breathKind === 'wind' ? 0.16 : 0.03; }, { once: true });
        document.addEventListener('inspect-synthetic-track', () => {
          document.documentElement.dataset.syntheticTrack = output.stream.getTracks()[0]!.readyState;
        });
        document.addEventListener('stop-synthetic-source', () => { void context.close(); }, { once: true });
        return output.stream;
      };
    }, breathKind);
    await page.locator('[data-candle-ready]').click();
    await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'listening');
    await expect(audio).toHaveJSProperty('paused', false);
    await expect(page.locator('[data-candle-wish]')).toHaveText('');
    await page.evaluate(() => document.dispatchEvent(new Event('start-synthetic-blow')));
    await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'revealed');
    await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
    await expect(audio).toHaveJSProperty('paused', false);
    expect(await audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(musicTime);
    await page.evaluate(() => {
      document.dispatchEvent(new Event('inspect-synthetic-track'));
      document.dispatchEvent(new Event('stop-synthetic-source'));
    });
    await expect(page.locator('html')).toHaveAttribute('data-synthetic-track', 'ended');
  });
}
