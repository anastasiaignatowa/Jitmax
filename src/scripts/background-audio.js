(() => {
  const audio = document.querySelector('[data-background-audio]');
  if (!audio) return;
  if (audio.dataset.backgroundAudioReady === 'true') return;

  audio.dataset.backgroundAudioReady = 'true';

  audio.volume = 0.42;
  audio.loop = true;
  audio.autoplay = true;
  audio.muted = false;
  audio.preload = 'auto';
  audio.setAttribute('autoplay', '');
  audio.setAttribute('loop', '');

  const startEvents = ['pointerdown', 'mousedown', 'touchstart', 'touchend', 'click', 'keydown'];
  let playTimers = [];

  const removeStartListeners = () => {
    startEvents.forEach((eventName) => {
      window.removeEventListener(eventName, requestPlay, true);
    });
  };

  const clearPlayTimers = () => {
    playTimers.forEach((timer) => window.clearTimeout(timer));
    playTimers = [];
  };

  const requestPlay = () => {
    audio.loop = true;
    audio.autoplay = true;
    audio.muted = false;
    audio.setAttribute('autoplay', '');
    audio.setAttribute('loop', '');

    if (!audio.paused) {
      removeStartListeners();
      return;
    }

    const playPromise = audio.play();
    if (!playPromise?.then) {
      removeStartListeners();
      return;
    }

    playPromise.then(removeStartListeners).catch(() => {});
  };

  const schedulePlay = (delay = 0) => {
    const run = () => window.requestAnimationFrame(requestPlay);
    if (delay > 0) {
      playTimers.push(window.setTimeout(run, delay));
      return;
    }

    run();
  };

  const handleVisibilityChange = () => {
    if (!document.hidden) requestPlay();
  };

  const handleDOMContentLoaded = () => schedulePlay();
  const handleLoad = () => schedulePlay();
  const handlePageShow = () => schedulePlay();

  const cleanup = () => {
    clearPlayTimers();
    removeStartListeners();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('DOMContentLoaded', handleDOMContentLoaded);
    window.removeEventListener('load', handleLoad);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('beforeunload', cleanup);
    delete audio.dataset.backgroundAudioReady;
  };

  startEvents.forEach((eventName) => {
    window.addEventListener(eventName, requestPlay, {
      capture: true,
      passive: true,
    });
  });

  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('DOMContentLoaded', handleDOMContentLoaded, { once: true });
  window.addEventListener('load', handleLoad, { once: true });
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('beforeunload', cleanup, { once: true });

  [0, 120, 420, 1100, 2200].forEach(schedulePlay);
})();
