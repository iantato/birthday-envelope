export type BlowFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'error';

type Callbacks = {
  onState: (state: 'calibrating' | 'listening') => void;
  onLevel: (level: number) => void;
  onBlow: () => void;
  onError: (reason: BlowFailure) => void;
};

// Starting values, not phone-validated sensitivity or physical airflow detection.
export const blowSettings = {
  calibrationMs: 1250,
  startupMs: 250,
  listeningMs: 18000,
  permissionMs: 20000,
  minimumRms: 0.035,
  noiseMultiplier: 2.5,
  sustainedMs: 550,
  windowMs: 900,
  gapMs: 100,
};

type Run = {
  context?: AudioContext;
  stream?: MediaStream;
  source?: MediaStreamAudioSourceNode;
  analyser?: AnalyserNode;
  frame?: number;
  timer?: ReturnType<typeof setTimeout>;
  events: AbortController;
};

export function createBlowDetector(callbacks: Callbacks, settings = blowSettings) {
  let current: Run | undefined;
  let closing = Promise.resolve();

  async function stop(): Promise<void> {
    const run = current;
    current = undefined;
    if (!run) return closing;
    run.events.abort();
    clearTimeout(run.timer);
    if (run.frame !== undefined) cancelAnimationFrame(run.frame);
    run.stream?.getTracks().forEach((track) => track.stop());
    run.source?.disconnect();
    run.analyser?.disconnect();
    if (run.context && run.context.state !== 'closed') {
      // Cancel followed by Replay must still wait for every in-flight close.
      closing = Promise.all([closing, run.context.close().catch(() => {})]).then(() => {});
    }
    await closing;
  }

  function fail(run: Run, reason: BlowFailure) {
    if (current !== run) return;
    // The controller calls stop synchronously before rendering the failure.
    callbacks.onError(reason);
    if (current === run) void stop();
  }

  async function start() {
    void stop();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      callbacks.onError('unsupported');
      return;
    }
    const run: Run = { events: new AbortController() };
    current = run;
    run.timer = setTimeout(() => fail(run, 'timeout'), settings.permissionMs);
    try {
      // Both calls happen before the first await, within the ready-button gesture.
      const context = run.context = new AudioContext();
      const resumed = context.resume();
      // Attach a rejection handler immediately, even if permission is still pending.
      void resumed.catch(() => fail(run, 'error'));
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        });
      } catch (error) {
        if (current !== run) return;
        const name = error instanceof Error || error instanceof DOMException ? error.name : '';
        if (name !== 'OverconstrainedError' && name !== 'TypeError') throw error;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      // getUserMedia is not abortable. Permission can resolve after any exit/reset.
      if (current !== run) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      run.stream = stream;
      await resumed;
      if (current !== run) return;
      const tracks = stream.getAudioTracks();
      if (!tracks.length || tracks.some((track) => track.readyState === 'ended')) {
        fail(run, 'unavailable');
        return;
      }
      for (const track of tracks) {
        track.addEventListener('ended', () => fail(run, 'unavailable'), { signal: run.events.signal });
      }
      if (context.state !== 'running') {
        fail(run, 'error');
        return;
      }
      context.addEventListener('statechange', () => {
        if (context.state !== 'running') fail(run, 'error');
      }, { signal: run.events.signal });
      const source = run.source = context.createMediaStreamSource(stream);
      const analyser = run.analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // Deliberately never connected to context.destination.
      const samples = new Float32Array(analyser.fftSize);
      const ambient: number[] = [];
      const started = performance.now();
      let previous = started;
      let lastSample = started;
      let threshold = settings.minimumRms;
      let smoothed = 0;
      let listening = false;
      let elevated = false;
      let held = 0;
      let gap = 0;
      let windowStart = 0;
      clearTimeout(run.timer);
      run.timer = setTimeout(() => fail(run, 'timeout'), settings.calibrationMs + settings.listeningMs);
      callbacks.onState('calibrating');

      function sample(now: number) {
        if (current !== run) return;
        try {
          // Cap analysis at ~30 Hz; do not count long scheduling gaps as a blow.
          if (now - lastSample >= 30) {
            const elapsed = now - previous;
            const dt = Math.min(elapsed, 50);
            previous = lastSample = now;
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const value of samples) sum += value * value;
            const rms = Math.sqrt(sum / samples.length);
            if (!listening) {
              if (now - started >= settings.startupMs) ambient.push(rms);
              if (now - started >= settings.calibrationMs && ambient.length >= 12) {
                // Median avoids letting a single startup transient set the floor.
                ambient.sort((a, b) => a - b);
                const floor = ambient[Math.floor(ambient.length / 2)] ?? 0;
                threshold = Math.max(floor * settings.noiseMultiplier, settings.minimumRms);
                listening = true;
                smoothed = 0;
                callbacks.onState('listening');
              }
            } else {
              smoothed += (rms - smoothed) * (1 - Math.exp(-dt / 80));
              callbacks.onLevel(Math.min(1, smoothed / threshold));
              if (elapsed > 200 || (held > 0 && now - windowStart > settings.windowMs)) {
                held = gap = 0;
                elevated = false;
              }
              elevated = smoothed >= threshold * (elevated ? 0.75 : 1);
              if (elevated) {
                if (held === 0) windowStart = now;
                held += dt;
                gap = 0;
              } else {
                gap += dt;
                if (gap > settings.gapMs) held = 0;
              }
              if (held >= settings.sustainedMs) {
                callbacks.onBlow();
                if (current === run) void stop();
                return;
              }
            }
          }
        } catch {
          fail(run, 'error');
          return;
        }
        if (current === run) run.frame = requestAnimationFrame(sample);
      }
      run.frame = requestAnimationFrame(sample);
    } catch (error) {
      const name = error instanceof Error || error instanceof DOMException ? error.name : '';
      fail(run, name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
        : name === 'NotFoundError' || name === 'NotReadableError' ? 'unavailable' : 'error');
    }
  }

  return { start, stop };
}
