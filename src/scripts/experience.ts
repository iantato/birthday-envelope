import { siteContent } from '../data/siteContent';
import { transitionCandle, type CandleState, type CandleEvent } from './candleState';
import { createBlowDetector, type BlowFailure } from './blowDetector';

type Stage = 'sealed' | 'opening' | 'lifted' | 'reading';

function bindExperience() {
  const scene = document.querySelector<HTMLElement>('[data-envelope-scene]');
  const open = document.querySelector<HTMLButtonElement>('[data-envelope-open]');
  const paper = document.querySelector<HTMLButtonElement>('[data-letter-preview]');
  const hint = document.querySelector<HTMLElement>('[data-envelope-hint]');
  const reader = document.querySelector<HTMLDialogElement>('[data-letter-dialog]');
  const close = document.querySelector<HTMLButtonElement>('[data-letter-close]');
  if (!scene || !open || !paper || !hint || !reader || !close) return () => {};

  const events = new AbortController();
  const audio = document.querySelector<HTMLAudioElement>('[data-audio]');
  const photo = document.querySelector<HTMLDialogElement>('[data-photo-dialog]');
  const photoImage = document.querySelector<HTMLImageElement>('[data-photo-image]');
  const photoFallback = document.querySelector<HTMLElement>('[data-photo-fallback]');
  const photoCaption = document.querySelector<HTMLElement>('[data-photo-caption]');
  const candle = document.querySelector<HTMLButtonElement>('[data-candle-trigger]');
  const wish = document.querySelector<HTMLElement>('[data-candle-wish]');
  const candleSection = document.querySelector<HTMLElement>('[data-candle-section]');
  const candleReady = document.querySelector<HTMLButtonElement>('[data-candle-ready]');
  const candleFallback = document.querySelector<HTMLButtonElement>('[data-candle-fallback]');
  const candleCancel = document.querySelector<HTMLButtonElement>('[data-candle-cancel]');
  const candleStatus = document.querySelector<HTMLElement>('[data-candle-status]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sealedHint = hint.textContent;
  let stage: Stage = 'sealed';
  let fallback: ReturnType<typeof setTimeout> | undefined;
  let readerScroll = 0;
  let pageScroll: { x: number; y: number } | undefined;
  let photoTrigger: HTMLButtonElement | undefined;
  let candleState: CandleState = 'idle';
  let candleFinish: ReturnType<typeof setTimeout> | undefined;
  let wantsMusic = true;
  let musicRequest = 0;
  let musicPending = false;
  let microphoneCleanup: Promise<void> | undefined;
  const detector = createBlowDetector({
    onState: (state) => updateCandle(state === 'calibrating' ? 'allowed' : 'calibrated'),
    onLevel: (level) => candleSection?.style.setProperty('--blow-level', String(level)),
    onBlow: () => updateCandle('blow'),
    onError: (reason) => updateCandle(reason === 'timeout' && candleState === 'listening' ? 'timeout' : 'failed', reason),
  });

  function microphoneActive() {
    return candleState === 'requesting-permission' || candleState === 'calibrating' || candleState === 'listening';
  }

  function pauseMusic() {
    musicRequest++;
    musicPending = false;
    audio?.pause();
  }

  async function startMusic() {
    if (!audio || !wantsMusic || document.hidden || microphoneActive() || microphoneCleanup || musicPending || !audio.paused) return;
    const request = ++musicRequest;
    musicPending = true;
    try {
      await audio.play();
      if (!wantsMusic || microphoneActive() || microphoneCleanup) audio.pause();
    } catch {
      // Audible autoplay may be blocked; retry from the next user interaction.
    } finally {
      if (request === musicRequest) musicPending = false;
    }
  }

  if (audio) {
    audio.volume = 0.1;
    audio.addEventListener('play', () => {
      if (!wantsMusic || microphoneActive() || microphoneCleanup) audio.pause();
    }, { signal: events.signal });
    audio.addEventListener('error', () => {
      wantsMusic = false;
      pauseMusic();
    }, { signal: events.signal });
    for (const event of ['click', 'keydown']) {
      document.addEventListener(event, () => { void startMusic(); }, { signal: events.signal });
    }
    void startMusic();
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-memory-open]')) {
    const image = button.querySelector<HTMLImageElement>('[data-memory-image]');
    const placeholder = button.querySelector<HTMLElement>('[data-memory-fallback]');
    if (!image) continue;
    const imageLabel = button.getAttribute('aria-label') ?? '';
    const updateImage = () => {
      const loaded = image.naturalWidth > 0;
      image.hidden = !loaded;
      image.toggleAttribute('data-loaded', loaded);
      button.disabled = !loaded;
      button.setAttribute('aria-label', loaded ? imageLabel : placeholder?.getAttribute('aria-label') ?? imageLabel);
      if (placeholder) placeholder.hidden = loaded;
    };
    image.addEventListener('load', updateImage, { signal: events.signal });
    image.addEventListener('error', updateImage, { signal: events.signal });
    if (image.complete) updateImage();

    button.addEventListener('click', () => {
      if (stage !== 'reading' || !photo || !photoImage || !photoCaption || button.disabled) return;
      photoTrigger = button;
      photoImage.hidden = true;
      if (photoFallback) photoFallback.hidden = true;
      photoImage.alt = image.alt;
      photoImage.src = image.currentSrc || image.src;
      photoCaption.textContent = button.dataset.caption ?? '';
      updateCandle('cancel');
      photo.showModal();
    }, { signal: events.signal });
  }

  photoImage?.addEventListener('load', () => {
    photoImage.hidden = false;
    if (photoFallback) photoFallback.hidden = true;
  }, { signal: events.signal });
  photoImage?.addEventListener('error', () => {
    photoImage.hidden = true;
    if (photoFallback) photoFallback.hidden = false;
  }, { signal: events.signal });
  document.querySelector('[data-photo-close]')?.addEventListener('click', () => photo?.close(), { signal: events.signal });
  photo?.addEventListener('close', () => {
    if (!photo.open && stage === 'reading' && reader.open) photoTrigger?.focus({ preventScroll: true });
  }, { signal: events.signal });

  function updateCandle(event: CandleEvent, failure?: BlowFailure) {
    const next = transitionCandle(candleState, event);
    if (next === candleState && event !== 'reset') return;
    clearTimeout(candleFinish);
    const wasActive = microphoneActive();
    candleState = next;
    const out = next === 'extinguishing' || next === 'revealed';
    const active = next === 'requesting-permission' || next === 'calibrating' || next === 'listening';
    if ((wasActive && !active) || event === 'reset') {
      const cleanup = detector.stop();
      microphoneCleanup = cleanup;
      void cleanup.then(() => {
        if (microphoneCleanup !== cleanup) return;
        microphoneCleanup = undefined;
        if (candleReady) candleReady.disabled = candleState !== 'idle';
        void startMusic();
      });
      candleSection?.style.removeProperty('--blow-level');
    }
    if (candleSection) {
      candleSection.dataset.candleState = next;
      if (next === 'extinguishing' || event === 'reset') {
        candleSection.dataset.candleEffects = String(next === 'extinguishing' && !motion.matches);
      }
    }
    if (candle) {
      candle.dataset.blown = String(out);
      candle.setAttribute('aria-pressed', String(out));
      candle.disabled = out;
    }
    if (candleReady) candleReady.disabled = next !== 'idle' || Boolean(microphoneCleanup);
    if (candleFallback) candleFallback.disabled = out;
    if (candleCancel) {
      const restoreFocus = !active && document.activeElement === candleCancel;
      candleCancel.hidden = !active;
      if (restoreFocus) {
        const target = next === 'idle' ? candleReady : out
          ? document.querySelector<HTMLButtonElement>('[data-replay]') : candleFallback;
        target?.focus({ preventScroll: true });
      }
    }
    if (wish) wish.textContent = next === 'revealed' ? wish.dataset.wish ?? '' : '';
    const copy = siteContent.candle;
    const statuses: Record<CandleState, string> = {
      idle: '',
      'requesting-permission': copy.requestingLabel,
      calibrating: copy.calibratingLabel,
      listening: copy.listeningLabel,
      'fallback-ready': copy.fallbackMessage,
      extinguishing: copy.extinguishingLabel,
      revealed: copy.doneLabel,
    };
    const failures: Record<BlowFailure, string> = {
      unsupported: copy.unsupportedMessage, denied: copy.deniedMessage,
      unavailable: copy.unavailableMessage, timeout: copy.timeoutMessage, error: copy.fallbackMessage,
    };
    if (candleStatus) candleStatus.textContent = failure ? failures[failure] : statuses[next];
    if (next === 'extinguishing') {
      const style = candle ? getComputedStyle(candle) : undefined;
      const duration = (property: string) => {
        const value = style?.getPropertyValue(property).trim() ?? '';
        return (Number.parseFloat(value) || 0) * (value.endsWith('ms') ? 1 : 1000);
      };
      // animationend reveals at flame-out; the timer covers suppressed CSS events/hidden tabs.
      const wait = duration('--candle-bend-duration') + duration('--candle-fade-duration');
      candleFinish = setTimeout(() => updateCandle('finished'), motion.matches ? 0 : wait + 100);
    }
  }

  candle?.addEventListener('animationend', (event) => {
    if (event.target === candle.querySelector('.candle-flame') && event.animationName === 'candle-extinguish') {
      updateCandle('finished');
    }
    if (event.target === candle.querySelector('.candle-smoke') && event.animationName === 'candle-smoke' && candleSection) {
      candleSection.dataset.candleEffects = 'false';
    }
  }, { signal: events.signal });

  candleReady?.addEventListener('click', () => {
    if (stage !== 'reading' || candleState !== 'idle') return;
    updateCandle('ready');
    pauseMusic();
    void detector.start();
    // The primary action is disabled while listening; keep keyboard focus usable.
    (microphoneActive() ? candleCancel : candleFallback)?.focus({ preventScroll: true });
  }, { signal: events.signal });
  for (const button of [candle, candleFallback]) {
    button?.addEventListener('click', () => {
      if (stage === 'reading') updateCandle('tap');
    }, { signal: events.signal });
  }
  candleCancel?.addEventListener('click', async () => {
    updateCandle('cancel');
    await microphoneCleanup;
    if (stage === 'reading' && candleState === 'idle' && reader.open) candleReady?.focus({ preventScroll: true });
  }, { signal: events.signal });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) updateCandle('cancel');
    else void startMusic();
  }, { signal: events.signal });
  window.addEventListener('pagehide', () => updateCandle('cancel'), { signal: events.signal });
  const candleVisibility = new IntersectionObserver((entries) => {
    if (entries.some((entry) => !entry.isIntersecting)) updateCandle('cancel');
  }, { root: reader });
  if (candleSection) candleVisibility.observe(candleSection);

  function lockPage() {
    pageScroll = { x: window.scrollX, y: window.scrollY };
    document.body.style.setProperty('--reader-scroll-top', `${-pageScroll.y}px`);
    document.documentElement.classList.add('letter-reading');
    document.body.classList.add('letter-reading');
  }

  function unlockPage() {
    if (!pageScroll) return;
    document.documentElement.classList.remove('letter-reading');
    document.body.classList.remove('letter-reading');
    document.body.style.removeProperty('--reader-scroll-top');
    window.scrollTo({ left: pageScroll.x, top: pageScroll.y, behavior: 'instant' });
    pageScroll = undefined;
  }

  function setStage(next: Stage) {
    stage = next;
    scene!.dataset.stage = next;
    open!.disabled = next !== 'sealed';
    open!.hidden = next === 'lifted' || next === 'reading';
    open!.setAttribute('aria-expanded', String(next !== 'sealed'));
    paper!.disabled = next !== 'lifted';
    paper!.setAttribute('aria-expanded', String(next === 'reading'));
    paper!.setAttribute('aria-hidden', String(next === 'sealed' || next === 'opening'));
    hint!.textContent = next === 'sealed' ? sealedHint
      : next === 'opening' ? scene!.dataset.openingHint ?? ''
      : scene!.dataset.liftedHint ?? '';
  }

  function finishLift() {
    if (stage !== 'opening') return;
    clearTimeout(fallback);
    const restoreFocus = document.activeElement === open || document.activeElement === document.body;
    setStage('lifted');
    if (restoreFocus) paper!.focus({ preventScroll: true });
  }

  open.addEventListener('click', () => {
    if (stage !== 'sealed') return;
    setStage('opening');
    if (motion.matches) {
      finishLift();
      return;
    }
    // A bounded escape hatch if the browser suppresses transitionend (e.g. a hidden tab).
    fallback = setTimeout(finishLift, 1450);
  }, { signal: events.signal });

  paper.addEventListener('transitionend', (event) => {
    if (event.target === paper && event.propertyName === 'transform') finishLift();
  }, { signal: events.signal });

  motion.addEventListener('change', () => {
    if (motion.matches) {
      finishLift();
      if (candleSection) candleSection.dataset.candleEffects = 'false';
      if (candleState === 'extinguishing') updateCandle('finished');
    }
  }, { signal: events.signal });

  paper.addEventListener('click', () => {
    if (stage !== 'lifted' || reader.open) return;
    reader.showModal();
    lockPage();
    setStage('reading');
    // showModal focuses the close control; restore the previous reading position afterward.
    reader.scrollTop = readerScroll;
  }, { signal: events.signal });

  reader.addEventListener('scroll', () => {
    if (reader.open) readerScroll = reader.scrollTop;
  }, { signal: events.signal, passive: true });

  close.addEventListener('click', () => {
    readerScroll = reader.scrollTop;
    reader.close();
  }, { signal: events.signal });

  reader.addEventListener('cancel', () => {
    readerScroll = reader.scrollTop;
  }, { signal: events.signal });

  reader.addEventListener('close', () => {
    if (reader.open) return;
    if (candleSection) candleSection.dataset.candleEffects = 'false';
    if (candleState === 'extinguishing') updateCandle('finished');
    updateCandle('cancel');
    if (photo?.open) photo.close();
    unlockPage();
    if (stage === 'reading') {
      setStage('lifted');
      paper.focus({ preventScroll: true });
    }
  }, { signal: events.signal });

  function resetExperience(restoreFocus = true) {
    clearTimeout(fallback);
    photoTrigger = undefined;
    if (photo?.open) photo.close();
    if (reader!.open) reader!.close();
    readerScroll = 0;
    reader!.scrollTop = 0;
    unlockPage();
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    updateCandle('reset');
    setStage('sealed');
    if (restoreFocus) open!.focus({ preventScroll: true });
  }

  document.querySelector('[data-replay]')?.addEventListener('click', () => resetExperience(), { signal: events.signal });

  setStage('sealed');
  return () => {
    wantsMusic = false;
    pauseMusic();
    candleVisibility.disconnect();
    events.abort();
    resetExperience(false);
  };
}

const cleanup = bindExperience();
if (import.meta.hot) import.meta.hot.dispose(cleanup);
