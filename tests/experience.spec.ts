import { test, expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { platform } from 'node:process';

const scene = '[data-envelope-scene]';
const paper = '[data-letter-preview]';
const reader = '[data-letter-dialog]';
const photo = '[data-photo-dialog]';

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
  await expect(page.locator('[data-audio], [data-music-toggle]')).toHaveCount(0);
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

test('two taps, nested photo, one-shot wish, close/reopen and replay twice', async ({ page, hasTouch }) => {
  await page.goto('/');
  for (let cycle = 0; cycle < 2; cycle++) {
    const open = page.locator('[data-envelope-open]');
    if (hasTouch) await open.tap(); else await open.click();
    await open.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.locator(scene)).toHaveAttribute('data-stage', 'lifted');
    await expect(page.locator(reader)).not.toBeVisible();
    if (hasTouch) await page.locator(paper).tap(); else await page.locator(paper).click();
    const thumbnail = page.locator('[data-memory-open]').first();
    await thumbnail.scrollIntoViewIfNeeded();
    await expect(thumbnail.locator('img')).toHaveAttribute('data-loaded', '');
    await thumbnail.click();
    await expect(page.locator(photo)).toBeVisible();
    await expect(page.locator('[data-photo-image]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(photo)).not.toBeVisible();
    await expect(thumbnail).toBeFocused();
    await expect(page.locator(reader)).toBeVisible();
    const candle = page.locator('[data-candle-trigger]');
    if (hasTouch) await candle.tap(); else await candle.click();
    const wish = await page.locator('[data-candle-wish]').textContent();
    expect(wish?.length).toBeGreaterThan(0);
    await candle.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator('[data-candle-wish]')).toHaveText(wish!);
    await page.keyboard.press('Escape');
    await expect(page.locator(paper)).toBeFocused();
    await page.locator(paper).click();
    await expect(page.locator('[data-candle-wish]')).toHaveText(wish!);
    await page.locator('[data-replay]').click();
    await expect(page.locator(scene)).toHaveAttribute('data-stage', 'sealed');
    await expect(open).toBeFocused();
    await expect(candle).toBeEnabled();
    await expect(page.locator('[data-candle-wish]')).toHaveText('');
    expect(await page.evaluate(() => scrollY === 0 && !document.body.classList.contains('letter-reading'))).toBeTruthy();
  }
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

test('missing photo falls back without gating the letter', async ({ page }) => {
  await page.route('**/images/memory-1.svg', (route) => route.fulfill({ contentType: 'image/png', body: 'invalid image' }));
  await page.goto('/');
  await read(page);
  const button = page.locator('[data-memory-open]').first();
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-label', /^Photo unavailable:/);
  await expect(button.locator('[data-memory-fallback]')).toBeVisible();
  await page.locator('[data-candle-trigger]').click();
  await expect(page.locator('[data-candle-wish]')).not.toHaveText('');
});

test('slow images do not block reading or wish; recover when released', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/images/**', async (route) => { await gate; await route.continue(); });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await read(page);
    await page.locator('[data-candle-trigger]').click();
    await expect(page.locator('[data-candle-wish]')).not.toHaveText('');
    release();
    const image = page.locator('[data-memory-image]').first();
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('data-loaded', '');
  } finally { release(); }
});

async function musicFixture(page: Page) {
  // Inject the optional markup before the production controller binds; never edit personal config.
  await page.route('http://127.0.0.1:4330/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace('</header>', `<div class="music-control">
      <audio data-audio src="/test-tone.wav" preload="none"></audio>
      <button type="button" data-music-toggle data-play-label="Play our song" data-pause-label="Pause our song" data-error-message="Playback unavailable" aria-pressed="false">Play our song</button>
      <span data-music-status role="status"></span></div></header>`);
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

test('optional audio fixture: no autoplay, play/pause, replay and rejection', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && platform === 'win32', 'Windows WebKit reports MEDIA_ERR_SRC_NOT_SUPPORTED for the generated WAV; test real audio on Safari.');
  const requests = await musicFixture(page);
  await page.goto('/');
  await read(page);
  expect(requests()).toBe(0);
  const music = page.locator('[data-music-toggle]');
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await music.click();
  await expect(music).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-replay]').click();
  expect(await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused && audio.currentTime === 0)).toBeTruthy();
  await read(page);
  await page.locator('audio').evaluate((audio: HTMLAudioElement) => { audio.play = () => Promise.reject(new DOMException('Test denial', 'NotAllowedError')); });
  await music.click();
  await expect(page.locator('[data-music-status]')).toHaveText('Playback unavailable');
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await expect(music).toBeEnabled();
});

test('audio rejection and pending playback reset are safe', async ({ page }) => {
  await musicFixture(page);
  await page.goto('/');
  await read(page);
  const audio = page.locator('[data-audio]');
  const music = page.locator('[data-music-toggle]');
  await audio.evaluate((el: HTMLAudioElement) => { el.play = () => Promise.reject(new DOMException('Test denial', 'NotAllowedError')); });
  await music.click();
  await expect(page.locator('[data-music-status]')).toHaveText('Playback unavailable');
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await audio.evaluate((el: HTMLAudioElement) => {
    el.play = () => new Promise<void>((resolve) => {
      el.addEventListener('resolve-test-play', () => resolve(), { once: true });
    });
  });
  await music.click();
  await expect(music).toBeDisabled();
  await page.locator('[data-replay]').click();
  await audio.dispatchEvent('resolve-test-play');
  await expect(music).toBeEnabled();
  await expect(music).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(scene)).toHaveAttribute('data-stage', 'sealed');
  expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBeTruthy();
});
