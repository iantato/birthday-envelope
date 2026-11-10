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
  const music = document.querySelector<HTMLButtonElement>('[data-music-toggle]');
  const musicStatus = document.querySelector<HTMLElement>('[data-music-status]');
  const photo = document.querySelector<HTMLDialogElement>('[data-photo-dialog]');
  const photoImage = document.querySelector<HTMLImageElement>('[data-photo-image]');
  const photoFallback = document.querySelector<HTMLElement>('[data-photo-fallback]');
  const photoCaption = document.querySelector<HTMLElement>('[data-photo-caption]');
  const candle = document.querySelector<HTMLButtonElement>('[data-candle-trigger]');
  const wish = document.querySelector<HTMLElement>('[data-candle-wish]');
  const candleHint = document.querySelector<HTMLElement>('[data-candle-hint]');
  const initialCandleHint = candleHint?.textContent ?? '';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sealedHint = hint.textContent;
  let stage: Stage = 'sealed';
  let fallback: ReturnType<typeof setTimeout> | undefined;
  let readerScroll = 0;
  let pageScroll: { x: number; y: number } | undefined;
  let photoTrigger: HTMLButtonElement | undefined;
  let wishRevealed = false;
  let wantsMusic = false;
  let musicRequest = 0;

  function syncMusic() {
    if (!music || !audio) return;
    const playing = !audio.paused && !audio.ended;
    const label = (playing ? music.dataset.pauseLabel : music.dataset.playLabel) ?? '';
    music.textContent = label;
    music.setAttribute('aria-label', label);
    music.setAttribute('aria-pressed', String(playing));
  }

  function stopMusic() {
    wantsMusic = false;
    musicRequest++;
    audio?.pause();
    if (music) {
      music.disabled = false;
      music.removeAttribute('aria-busy');
    }
    syncMusic();
  }

  if (audio && music) {
    music.addEventListener('click', async () => {
      if (wantsMusic || !audio.paused) {
        stopMusic();
        return;
      }
      wantsMusic = true;
      const request = ++musicRequest;
      music.disabled = true;
      music.setAttribute('aria-busy', 'true');
      if (musicStatus) musicStatus.textContent = '';
      try {
        // Only this direct click handler may start playback.
        await audio.play();
        if (!wantsMusic) audio.pause();
      } catch {
        if (request === musicRequest) {
          wantsMusic = false;
          if (musicStatus) musicStatus.textContent = music.dataset.errorMessage ?? '';
        }
      } finally {
        if (request === musicRequest) {
          music.disabled = false;
          music.removeAttribute('aria-busy');
          syncMusic();
        }
      }
    }, { signal: events.signal });
    for (const event of ['play', 'pause', 'ended']) {
      audio.addEventListener(event, () => {
        if (audio.paused || audio.ended) wantsMusic = false;
        syncMusic();
      }, { signal: events.signal });
    }
    audio.addEventListener('error', () => {
      stopMusic();
      if (musicStatus) musicStatus.textContent = music.dataset.errorMessage ?? '';
    }, { signal: events.signal });
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

  candle?.addEventListener('click', () => {
    if (wishRevealed || !wish) return;
    wishRevealed = true;
    candle.dataset.blown = 'true';
    candle.setAttribute('aria-pressed', 'true');
    candle.disabled = true;
    wish.textContent = wish.dataset.wish ?? '';
    if (candleHint) candleHint.textContent = candleHint.dataset.doneLabel ?? '';
  }, { signal: events.signal });

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
    if (motion.matches) finishLift();
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
    if (photo?.open) photo.close();
    unlockPage();
    if (stage === 'reading') {
      setStage('lifted');
      paper.focus({ preventScroll: true });
    }
  }, { signal: events.signal });

  function resetExperience(restoreFocus = true) {
    clearTimeout(fallback);
    stopMusic();
    if (audio) audio.currentTime = 0;
    if (musicStatus) musicStatus.textContent = '';
    photoTrigger = undefined;
    if (photo?.open) photo.close();
    if (reader!.open) reader!.close();
    readerScroll = 0;
    reader!.scrollTop = 0;
    unlockPage();
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    wishRevealed = false;
    if (candle) {
      candle.disabled = false;
      candle.dataset.blown = 'false';
      candle.setAttribute('aria-pressed', 'false');
    }
    if (wish) wish.textContent = '';
    if (candleHint) candleHint.textContent = initialCandleHint;
    setStage('sealed');
    if (restoreFocus) open!.focus({ preventScroll: true });
  }

  document.querySelector('[data-replay]')?.addEventListener('click', () => resetExperience(), { signal: events.signal });

  setStage('sealed');
  return () => {
    events.abort();
    resetExperience(false);
  };
}

const cleanup = bindExperience();
if (import.meta.hot) import.meta.hot.dispose(cleanup);
