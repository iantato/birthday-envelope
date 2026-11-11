import { test, expect, type Page } from '@playwright/test';

type MicMode = 'allow' | 'pending' | 'reject' | 'constraint-once';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') messages.push(message.text()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function installMicrophone(page: Page, mode: MicMode = 'allow', errorName = 'NotAllowedError') {
  await page.addInitScript(({ mode, errorName }) => {
    const state = {
      mode, errorName, calls: [] as unknown[], tracks: [] as FakeTrack[], contexts: [] as FakeContext[],
      level: 0, resolves: [] as ((stream: MediaStream) => void)[], audioFailure: '',
    };
    class FakeTrack extends EventTarget {
      stopCount = 0;
      readyState: MediaStreamTrackState = 'live';
      kind = 'audio';
      stop() { this.stopCount++; this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); }
    }
    class FakeStream {
      tracks = [new FakeTrack(), new FakeTrack()];
      getTracks() { return this.tracks; }
      getAudioTracks() { return this.tracks; }
    }
    class FakeNode extends EventTarget {
      disconnectCount = 0;
      connections: unknown[] = [];
      connect(node: unknown) { this.connections.push(node); }
      disconnect() { this.disconnectCount++; }
    }
    class FakeAnalyser extends FakeNode {
      fftSize = 2048;
      getFloatTimeDomainData(data: Float32Array) {
        if (state.audioFailure === 'sample') throw new Error('Test sampling failure');
        for (let i = 0; i < data.length; i++) data[i] = i % 2 ? state.level : -state.level;
      }
    }
    class FakeContext extends EventTarget {
      state: AudioContextState = 'suspended';
      destination = {};
      source?: FakeNode;
      analyser?: FakeAnalyser;
      closeCount = 0;
      resume() {
        if (state.audioFailure === 'resume') return Promise.reject(new Error('Test resume failure'));
        this.state = 'running'; return Promise.resolve();
      }
      close() { this.closeCount++; this.state = 'closed'; return Promise.resolve(); }
      createMediaStreamSource(_stream: MediaStream) { return this.source = new FakeNode(); }
      createAnalyser() {
        if (state.audioFailure === 'setup') throw new Error('Test setup failure');
        return this.analyser = new FakeAnalyser();
      }
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: (constraints: unknown) => {
        state.calls.push(constraints);
        if (state.mode === 'pending') return new Promise<MediaStream>((resolve) => { state.resolves.push(resolve); });
        if (state.mode === 'constraint-once' && state.calls.length === 1) return Promise.reject(new DOMException('Test constraints', state.errorName));
        if (state.mode === 'reject') return Promise.reject(new DOMException('mock failure', state.errorName));
        const stream = new FakeStream(); state.tracks.push(...stream.tracks);
        return Promise.resolve(stream as unknown as MediaStream);
      },
    } });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class extends FakeContext {
      constructor() { super(); state.contexts.push(this); }
    } });
    Object.defineProperty(window, '__micMock', { configurable: true, value: state });
    Object.defineProperty(window, '__resolveMic', { configurable: true, value: (index = state.resolves.length - 1) => {
      const stream = new FakeStream(); state.tracks.push(...stream.tracks);
      state.resolves[index]?.(stream as unknown as MediaStream);
    } });
  }, { mode, errorName });
}

async function openReader(page: Page) {
  await page.goto('/');
  await page.locator('[data-envelope-open]').click();
  await page.locator('[data-letter-preview]').click();
  await expect(page.locator('[data-letter-dialog]')).toBeVisible();
}

async function startMic(page: Page) {
  await page.locator('[data-candle-ready]').click();
  await expect(page.locator('[data-candle-cancel]')).toBeVisible();
}

test('does not request microphone or construct audio context on load or reading', async ({ page }) => {
  await installMicrophone(page);
  await page.goto('/');
  await page.locator('[data-envelope-open]').click();
  await page.locator('[data-letter-preview]').click();
  await expect(page.locator('[data-letter-dialog]')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__micMock.calls.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).__micMock.contexts.length)).toBe(0);
});

test('ready click creates and resumes context synchronously, then calibrates without detecting startup signal', async ({ page }) => {
  await page.clock.install();
  await installMicrophone(page, 'pending');
  await openReader(page);
  await page.locator('[data-candle-ready]').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('[data-candle-cancel]')).toBeVisible();
  const immediate = await page.evaluate(() => {
    const mock = (window as any).__micMock;
    return { contexts: mock.contexts.length, state: mock.contexts[0]?.state, calls: mock.calls.length };
  });
  expect(immediate).toEqual({ contexts: 1, state: 'running', calls: 1 });
  expect(await page.evaluate(() => (window as any).__micMock.calls[0])).toEqual({
    audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
  });
  await page.evaluate(() => { (window as any).__micMock.level = 0.8; });
  await page.evaluate(() => (window as any).__resolveMic());
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'calibrating');
  await expect(page.locator('[data-candle-status]')).toHaveText('Getting ready…');
  await page.clock.runFor(200);
  await expect(page.locator('[data-candle-wish]')).toHaveText('');
  await page.evaluate(() => { (window as any).__micMock.level = 0; });
  await page.clock.runFor(1_100);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'listening');
  await expect(page.locator('[data-candle-status]')).toHaveText('Blow gently toward your microphone…');
  await expect(page.getByRole('button', { name: 'Tap to blow instead', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Cancel listening', exact: true })).toBeVisible();
  const cancelSize = await page.locator('[data-candle-cancel]').boundingBox();
  expect(cancelSize!.width).toBeGreaterThanOrEqual(43.99);
  expect(cancelSize!.height).toBeGreaterThanOrEqual(43.99);
  expect(await page.evaluate(() => (window as any).__micMock.contexts[0].source.connections[0] === (window as any).__micMock.contexts[0].analyser)).toBeTruthy();
  expect(await page.evaluate(() => (window as any).__micMock.contexts[0].source.connections.includes((window as any).__micMock.contexts[0].destination))).toBeFalsy();
  expect(await page.evaluate(() => (window as any).__micMock.contexts[0].analyser.connections)).toEqual([]);
});

test('rejects a short impulse and reveals only after a sustained above-threshold signal', async ({ page }) => {
  await page.clock.install();
  await installMicrophone(page);
  await openReader(page);
  await startMic(page);
  await page.clock.runFor(1_300);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'listening');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await page.evaluate(() => { (window as any).__micMock.level = 0.8; });
  await page.clock.runFor(120);
  await page.evaluate(() => { (window as any).__micMock.level = 0; });
  await page.clock.runFor(650);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'listening');
  const layout = () => page.evaluate(() => ({
    candle: document.querySelector('[data-candle-section]')!.getBoundingClientRect().height,
    final: (document.querySelector('.final-section') as HTMLElement).offsetTop,
    scrollHeight: document.querySelector('[data-letter-dialog]')!.scrollHeight,
  }));
  const beforeReveal = await layout();
  await page.evaluate(() => { (window as any).__micMock.level = 0.8; });
  await page.clock.runFor(1_400);
  await expect(page.locator('[data-candle-wish]')).not.toHaveText('');
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'revealed');
  const cleanup = await page.evaluate(() => {
    const context = (window as any).__micMock.contexts[0];
    return { stops: (window as any).__micMock.tracks.map((track: any) => track.stopCount), close: context.closeCount, source: context.source.disconnectCount, analyser: context.analyser.disconnectCount };
  });
  expect(cleanup).toEqual({ stops: [1, 1], close: 1, source: 1, analyser: 1 });
  expect(await layout()).toEqual(beforeReveal);
  await expect(page.locator('.candle-flame')).toHaveCSS('opacity', '0');
});

test('pending permission times out and stops a stream that resolves after timeout', async ({ page }) => {
  await page.clock.install();
  await installMicrophone(page, 'pending');
  await openReader(page);
  await startMic(page);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'requesting-permission');
  await page.clock.runFor(20_000);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'fallback-ready');
  await expect(page.locator('[data-candle-status]')).not.toHaveText('');
  await page.evaluate(() => (window as any).__resolveMic());
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.map((track: any) => track.stopCount))).toEqual([1, 1]);
  expect(await page.evaluate(() => (window as any).__micMock.contexts[0].source)).toBeUndefined();
});

test('retries only constraint TypeError with audio true; reports denial without retry', async ({ page }) => {
  await installMicrophone(page, 'reject', 'TypeError');
  await openReader(page);
  await page.locator('[data-candle-ready]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.calls.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).__micMock.calls[1])).toEqual({ audio: true });
  await openReader(page);
  await page.evaluate(() => { (window as any).__micMock.errorName = 'NotAllowedError'; });
  await page.locator('[data-candle-ready]').click();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'fallback-ready');
  expect(await page.evaluate(() => (window as any).__micMock.calls.length)).toBe(1);
});

test('cancel ignores late permission and an old stream cannot affect a new run', async ({ page }) => {
  await page.clock.install();
  await installMicrophone(page, 'pending');
  await openReader(page);
  await startMic(page);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'requesting-permission');
  await page.locator('[data-candle-cancel]').click();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'idle');
  await expect(page.locator('[data-candle-ready]')).toBeFocused();
  await startMic(page);
  await page.evaluate(() => (window as any).__resolveMic(0));
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.map((track: any) => track.stopCount))).toEqual([1, 1]);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'requesting-permission');
  await page.evaluate(() => (window as any).__resolveMic(1));
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'calibrating');
  await page.locator('[data-candle-fallback]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.map((track: any) => track.stopCount))).toEqual([1, 1, 1, 1]);
});

test('fallback tap and reader close stop active audio graph', async ({ page }) => {
  await installMicrophone(page);
  await openReader(page);
  await startMic(page);
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.contexts[0]?.source !== undefined)).toBeTruthy();
  await page.locator('[data-candle-fallback]').click();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'revealed');
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.every((track: any) => track.stopCount === 1))).toBeTruthy();
  await page.locator('[data-replay]').click();
  await openReader(page);
  await startMic(page);
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.contexts[0]?.source !== undefined)).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-letter-dialog]')).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.every((track: any) => track.stopCount === 1))).toBeTruthy();
});

test('missing microphone enters fallback without retry', async ({ page }) => {
  await installMicrophone(page, 'reject', 'NotFoundError');
  await openReader(page);
  await page.locator('[data-candle-ready]').click();
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'fallback-ready');
  expect(await page.evaluate(() => (window as any).__micMock.calls.length)).toBe(1);
});

test('constraint compatibility retries succeed and loud calibrated ambient does not extinguish', async ({ page }) => {
  await page.clock.install();
  await installMicrophone(page, 'constraint-once', 'OverconstrainedError');
  await openReader(page);
  await page.evaluate(() => { (window as any).__micMock.level = 0.1; });
  await startMic(page);
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.calls.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).__micMock.calls[1])).toEqual({ audio: true });
  await page.clock.runFor(3_000);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'listening');
  await expect(page.locator('[data-candle-wish]')).toHaveText('');
  await page.clock.fastForward(17_000);
  await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'fallback-ready');
  await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.map((track: any) => track.stopCount))).toEqual([1, 1]);
  await expect(page.locator('[data-candle-fallback]')).toBeEnabled();
});

test('insecure, unsupported media and missing audio context do not request capture', async ({ page }) => {
  await installMicrophone(page);
  for (const unavailable of ['insecure', 'media', 'context']) {
    await openReader(page);
    await page.evaluate((unavailable) => {
      if (unavailable === 'insecure') Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
      if (unavailable === 'media') Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      if (unavailable === 'context') Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true });
    }, unavailable);
    await page.locator('[data-candle-ready]').click();
    await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'fallback-ready');
    expect(await page.evaluate(() => (window as any).__micMock.calls.length)).toBe(0);
    expect(await page.evaluate(() => (window as any).__micMock.contexts.length)).toBe(0);
    await page.locator('[data-candle-fallback]').click();
    await expect(page.locator('[data-candle-wish]')).not.toHaveText('');
  }
});

test('resume, setup, and sampling failures release all allocated resources', async ({ page }) => {
  await installMicrophone(page);
  for (const failure of ['resume', 'setup', 'sample']) {
    await openReader(page);
    await page.evaluate((failure) => { (window as any).__micMock.audioFailure = failure; }, failure);
    await page.locator('[data-candle-ready]').click();
    await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'fallback-ready');
    await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.map((track: any) => track.stopCount))).toEqual([1, 1]);
    expect(await page.evaluate(() => (window as any).__micMock.contexts[0].closeCount)).toBe(1);
    await expect(page.locator('[data-candle-fallback]')).toBeEnabled();
  }
});

test('pagehide, hidden tab, section exit, track end and context suspension release capture', async ({ page }) => {
  await installMicrophone(page);
  for (const exit of ['pagehide', 'hidden', 'section', 'track', 'context']) {
    await openReader(page);
    await startMic(page);
    await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', 'calibrating');
    await page.evaluate((exit) => {
      if (exit === 'pagehide') window.dispatchEvent(new Event('pagehide'));
      if (exit === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      if (exit === 'section') document.querySelector('[data-letter-dialog]')!.scrollTop = 0;
      if (exit === 'track') (window as any).__micMock.tracks[0].dispatchEvent(new Event('ended'));
      if (exit === 'context') {
        const context = (window as any).__micMock.contexts[0];
        context.state = 'suspended';
        context.dispatchEvent(new Event('statechange'));
      }
    }, exit);
    await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', exit === 'track' || exit === 'context' ? 'fallback-ready' : 'idle');
    await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.map((track: any) => track.stopCount))).toEqual([1, 1]);
    expect(await page.evaluate(() => (window as any).__micMock.contexts[0].closeCount)).toBe(1);
  }
});

test('late permission after fallback or Replay stops tracks without changing the chosen outcome', async ({ page }) => {
  await installMicrophone(page, 'pending');
  for (const action of ['fallback', 'replay']) {
    await openReader(page);
    await startMic(page);
    await page.locator(action === 'fallback' ? '[data-candle-fallback]' : '[data-replay]').click();
    const outcome = action === 'fallback' ? 'revealed' : 'idle';
    await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', outcome);
    await page.evaluate(() => (window as any).__resolveMic());
    await expect.poll(() => page.evaluate(() => (window as any).__micMock.tracks.map((track: any) => track.stopCount))).toEqual([1, 1]);
    await expect(page.locator('[data-candle-section]')).toHaveAttribute('data-candle-state', outcome);
    expect(await page.evaluate(() => (window as any).__micMock.contexts[0].source)).toBeUndefined();
  }
});
