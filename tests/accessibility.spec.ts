import { test, expect, type Page } from '@playwright/test';
import { siteContent } from '../src/data/siteContent';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') messages.push(message.text()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function read(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open envelope', exact: true }).click();
  await page.locator('[data-letter-preview]').click();
  await expect(page.locator('[data-letter-dialog]')).toBeVisible();
}

test('candle controls have accessible names, 44px targets, keyboard focus and readable contrast', async ({ page }) => {
  await read(page);
  const ready = page.getByRole('button', { name: "I'm ready", exact: true });
  const fallback = page.getByRole('button', { name: 'Tap to blow instead', exact: true });
  await expect(page.getByRole('button', { name: siteContent.candle.buttonLabel, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: siteContent.candle.cancelLabel, exact: true })).toHaveCount(0);
  await expect(page.locator('[data-candle-status]')).toHaveAttribute('role', 'status');
  await expect(page.locator('[data-candle-status]')).toHaveAttribute('aria-atomic', 'true');
  await expect(page.locator('[data-candle-wish]')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('.candle-wish-space')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#candle-privacy')).toHaveCount(0);
  const letterFonts = await page.evaluate(() => [
    getComputedStyle(document.querySelector('#letter-greeting')!).fontFamily,
    getComputedStyle(document.querySelector('[data-letter-paragraphs]')!).fontFamily,
    getComputedStyle(document.querySelector('[data-candle-wish]')!).fontFamily,
  ]);
  expect(letterFonts.every((font) => font.includes('Lexend') && font.includes('sans-serif'))).toBeTruthy();
  const controlFont = await ready.evaluate((button) => getComputedStyle(button).fontFamily);
  expect(controlFont).not.toBe(letterFonts[0]);
  const targets = await page.locator('[data-letter-dialog] button').evaluateAll((buttons) => buttons
    .filter((button) => getComputedStyle(button).visibility !== 'hidden')
    .map((button) => ({ name: button.getAttribute('aria-label') || button.textContent?.trim(),
      width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  for (const target of targets) {
    expect(target.name).toBeTruthy();
    // Layout rectangles can round an exact 44px box down by a fraction of a pixel.
    expect(Math.round(target.width * 100) / 100).toBeGreaterThanOrEqual(44);
    expect(Math.round(target.height * 100) / 100).toBeGreaterThanOrEqual(44);
  }
  await ready.focus();
  await page.keyboard.press('Tab');
  await expect(fallback).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(ready).toBeFocused();
  const contrast = await ready.evaluate((button) => {
    const style = getComputedStyle(button);
    const luminance = (color: string) => {
      const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map((number) => {
        const channel = Number(number) / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * r! + .7152 * g! + .0722 * b!;
    };
    const ratio = (foreground: string, background: string) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
      return (values[1]! + .05) / (values[0]! + .05);
    };
    return { focusVisible: button.matches(':focus-visible'), outline: parseFloat(style.outlineWidth),
      text: ratio(style.color, style.backgroundColor), focus: ratio(style.outlineColor, style.backgroundColor) };
  });
  expect(contrast.focusVisible).toBeTruthy();
  expect(contrast.outline).toBeGreaterThanOrEqual(2);
  expect(contrast.text).toBeGreaterThanOrEqual(4.5);
  expect(contrast.focus).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
});

test('200 percent text sizing preserves candle controls, wish space and reduced-motion fallback', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await read(page);
  const original = await page.locator('[data-letter-paragraphs]').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const originalWish = await page.locator('[data-candle-wish]').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  // Root-relative fonts exercise text resizing without scaling layout/graphics (unlike pinch zoom).
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect.poll(() => page.locator('[data-letter-paragraphs]').evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBe(original * 2);
  await expect.poll(() => page.locator('[data-candle-wish]').evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBe(originalWish * 2);
  const ready = page.locator('[data-candle-ready]');
  const fallback = page.locator('[data-candle-fallback]');
  for (const button of [ready, fallback, page.locator('[data-replay]')]) {
    await button.scrollIntoViewIfNeeded();
    expect(await button.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const reader = document.querySelector('[data-letter-dialog]')!.getBoundingClientRect();
      return box.left >= reader.left && box.right <= reader.right && box.height >= 44;
    })).toBeTruthy();
  }
  await fallback.scrollIntoViewIfNeeded();
  const geometry = () => page.evaluate(() => ({
    candle: document.querySelector('[data-candle-section]')!.getBoundingClientRect().height,
    final: (document.querySelector('.final-section') as HTMLElement).offsetTop,
    scroll: document.querySelector('[data-letter-dialog]')!.scrollHeight,
  }));
  const before = await geometry();
  await fallback.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
  expect(await geometry()).toEqual(before);
  expect(await page.locator('[data-letter-dialog]').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  await expect(page.locator('.candle-smoke')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.candle-flame-core')).toHaveCSS('animation-name', 'none');
  await page.locator('[data-candle-wish]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('candle-200-percent-text.png') });
});

test('consent and denied-permission fallback make no recording, upload or persistence calls', async ({ page }) => {
  const outgoing: string[] = [];
  page.on('request', (request) => { if (request.method() !== 'GET') outgoing.push(request.url()); });
  await page.addInitScript(() => {
    const audit = { microphone: 0, recording: 0, storage: 0, fetch: 0, xhr: 0, beacon: 0 };
    Object.defineProperty(window, '__privacyAudit', { value: audit });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: class {
      constructor() { audit.recording++; throw new Error('Recording is prohibited'); }
    } });
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { audit.storage++; return setItem.apply(this, args); };
    const fetch = window.fetch;
    window.fetch = (...args) => { audit.fetch++; return fetch(...args); };
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) { audit.xhr++; return send.call(this, body); };
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (...args) => { audit.beacon++; return beacon(...args); };
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class extends EventTarget {
      state = 'running';
      resume() { return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
    } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => { audit.microphone++; return Promise.reject(new DOMException('QA denial', 'NotAllowedError')); },
    } });
  });
  await read(page);
  await expect(page.locator('#candle-privacy')).toHaveCount(0);
  await page.locator('[data-candle-ready]').scrollIntoViewIfNeeded();
  const audit = () => page.evaluate(() => (window as unknown as { __privacyAudit: Record<string, number> }).__privacyAudit);
  expect((await audit()).microphone).toBe(0);
  expect(await page.evaluate(() => window.isSecureContext)).toBeTruthy();
  await page.locator('[data-candle-ready]').click();
  await expect(page.locator('[data-candle-status]')).toHaveText(siteContent.candle.deniedMessage);
  await expect(page.locator('[data-candle-fallback]')).toBeEnabled();
  await page.locator('[data-candle-fallback]').click();
  await expect(page.locator('[data-candle-wish]')).toHaveText(siteContent.candle.revealedWish);
  await page.locator('[data-replay]').click();
  await page.locator('[data-envelope-open]').click();
  await page.locator('[data-letter-preview]').click();
  expect(await audit()).toEqual({ microphone: 1, recording: 0, storage: 0, fetch: 0, xhr: 0, beacon: 0 });
  expect(outgoing).toEqual([]);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'idle');
});
