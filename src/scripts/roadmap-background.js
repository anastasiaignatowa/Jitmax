/* ROADMAP BACKGROUND VIDEO */
(function () {
  const slide = document.querySelector('[data-roadmap-slide]');
  if (!slide) return;

  const introVideo = slide.querySelector('[data-roadmap-bg-video="intro"]');
  const loopVideo = slide.querySelector('[data-roadmap-bg-video="loop"]');
  const videos = [introVideo, loopVideo].filter(Boolean);

  if (!introVideo || !loopVideo) return;

  const prefersReducedMotion = () =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function resetVideo(video) {
    try {
      video.pause();
      video.currentTime = 0;
    } catch (error) {
      // Метаданные могут еще загружаться при быстрой навигации.
    }
  }

  function setActiveVideo(activeVideo) {
    videos.forEach((video) => {
      video.classList.toggle('is-active', video === activeVideo);
    });
  }

  function playVideo(video) {
    window.deckMedia?.ensureVideoSource(video);
    const playPromise = video.play();
    playPromise?.catch?.(() => {});
  }

  function startLoopVideo() {
    if (!slide.classList.contains('visible')) return;

    resetVideo(loopVideo);
    loopVideo.loop = true;
    setActiveVideo(loopVideo);
    playVideo(loopVideo);
  }

  function startIntroVideo() {
    videos.forEach(resetVideo);

    if (!slide.classList.contains('visible')) return;

    if (prefersReducedMotion()) {
      startLoopVideo();
      return;
    }

    introVideo.loop = false;
    setActiveVideo(introVideo);
    playVideo(introVideo);
  }

  function stopVideos() {
    videos.forEach((video) => {
      video.classList.remove('is-active');
      window.deckMedia?.releaseVideoSource(video);
    });
  }

  introVideo.addEventListener('ended', startLoopVideo);

  const observer = new MutationObserver(() => {
    if (slide.classList.contains('visible')) {
      startIntroVideo();
      return;
    }

    stopVideos();
  });

  observer.observe(slide, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener(
    'beforeunload',
    () => {
      introVideo.removeEventListener('ended', startLoopVideo);
      observer.disconnect();
      stopVideos();
    },
    { once: true },
  );

  if (slide.classList.contains('visible')) {
    startIntroVideo();
  }
})();
