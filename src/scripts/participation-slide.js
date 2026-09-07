/* PARTICIPATION SLIDE */
(function () {
  const slide = document.querySelector('[data-participation-slide]');
  if (!slide) return;
  if (slide.dataset.participationReady === 'true') return;

  slide.dataset.participationReady = 'true';

  const states = ['standby', 'creation', 'launch', 'online', 'control', 'shareholder'];
  const stageGroups = {
    creation: new Set(['creation']),
    launch: new Set(['launch', 'online']),
    shareholder: new Set(['control', 'shareholder']),
  };
  const backgroundSceneOne = slide.querySelector('[data-participation-bg-scene="one"]');
  const backgroundBridgeVideos = Array.from(
    slide.querySelectorAll('[data-participation-bg-video="bridge"]'),
  ).sort(
    (left, right) =>
      Number(left.dataset.participationBgOrder || 0) -
      Number(right.dataset.participationBgOrder || 0),
  );
  const backgroundLoopVideo = slide.querySelector('[data-participation-bg-video="loop"]');
  const backgroundVideos = [...backgroundBridgeVideos, backgroundLoopVideo].filter(Boolean);
  const videoStartDelayMs = 0;
  const stageSequence = [
    { state: 'creation', stage: 'creation', delay: 3600 },
    { state: 'launch', stage: 'launch', delay: 6500 },
    { state: 'online', delay: 8400 },
    { state: 'control', delay: 10400 },
    { state: 'shareholder', stage: 'shareholder', delay: 12600 },
  ];
  const stageVideoSequences = {
    creation: {
      fromSceneOne: true,
      tokens: ['1', '2', '3'],
      loopToken: '3',
    },
    launch: {
      fromSceneOne: false,
      tokens: ['3', '4'],
      loopToken: '4',
    },
    shareholder: {
      fromSceneOne: false,
      tokens: ['5', 'loop'],
      loopToken: 'loop',
    },
  };
  const stateButtons = Array.from(
    slide.querySelectorAll('[data-participation-state-button]'),
  );
  const timedElements = Array.from(slide.querySelectorAll('[data-participation-timed]'));
  const modal = slide.querySelector('[data-participation-modal]');
  const modalCard = modal?.querySelector('.participation-modal-card');
  const closeButton = modal?.querySelector('[data-participation-modal-close]');
  const modalMeta = modal?.querySelector('[data-participation-modal-meta]');
  const modalTitle = modal?.querySelector('[data-participation-modal-title]');
  const modalBody = modal?.querySelector('[data-participation-modal-body]');
  const modalTriggers = Array.from(
    slide.querySelectorAll('[data-participation-modal-open]'),
  );
  const modalSources = new Map(
    Array.from(slide.querySelectorAll('[data-participation-modal-source]')).map(
      (source) => [source.dataset.participationModalSource, source],
    ),
  );

  let stageTimers = [];
  let backgroundTimers = [];
  let closeTimer = null;
  let activeModalKey = null;
  let sourceTrigger = null;
  let activeStageVideoSequence = null;
  let observer = null;
  let isSlideVisible = slide.classList.contains('visible');
  const listenerCleanup = [];

  function addManagedEventListener(target, eventName, handler, options) {
    if (!target) return;

    target.addEventListener(eventName, handler, options);
    listenerCleanup.push(() => target.removeEventListener(eventName, handler, options));
  }

  function removeManagedEventListeners() {
    listenerCleanup.splice(0).forEach((removeListener) => removeListener());
  }

  function clearStageTimeline() {
    stageTimers.forEach((timer) => window.clearTimeout(timer));
    stageTimers = [];
  }

  function clearBackgroundTimeline() {
    backgroundTimers.forEach((timer) => window.clearTimeout(timer));
    backgroundTimers = [];
  }

  function resetBackgroundScene({ release = false } = {}) {
    clearBackgroundTimeline();
    activeStageVideoSequence = null;
    backgroundSceneOne?.classList.add('is-active');
    backgroundSceneOne?.classList.remove('is-fading-out');
    backgroundVideos.forEach((video) => {
      video.classList.remove('is-active');
      video.loop = video.dataset.participationBgVideo === 'loop';

      if (release) {
        window.deckMedia?.releaseVideoSource(video);
        return;
      }

      try {
        video.pause();
        video.currentTime = 0;
      } catch (error) {
        // Видео может еще читать метаданные при быстрой смене слайдов.
      }
    });
  }

  function playBackgroundVideo(video, restart = false) {
    window.deckMedia?.ensureVideoSource(video);

    if (restart) {
      try {
        video.currentTime = 0;
      } catch (error) {
        // Видео может еще читать метаданные при быстрой смене состояния.
      }
    }

    const playPromise = video?.play();
    playPromise?.catch?.(() => {});
  }

  function startLoopVideo() {
    if (!slide.classList.contains('visible')) return;

    backgroundLoopVideo?.classList.add('is-active');
    playBackgroundVideo(backgroundLoopVideo);
  }

  function playBridgeVideo(index = 0) {
    const bridgeVideo = backgroundBridgeVideos[index];
    if (!bridgeVideo || !slide.classList.contains('visible')) return;

    bridgeVideo.loop = false;
    bridgeVideo.classList.add('is-active');
    playBackgroundVideo(bridgeVideo);
  }

  function startBackgroundScene() {
    resetBackgroundScene();
    if (!slide.classList.contains('visible')) return;

    backgroundTimers.push(
      window.setTimeout(() => {
        playBridgeVideo(0);
        window.requestAnimationFrame(() => {
          backgroundSceneOne?.classList.add('is-fading-out');
        });
      }, videoStartDelayMs),
    );
  }

  backgroundBridgeVideos.forEach((video, index) => {
    addManagedEventListener(video, 'ended', () => {
      if (activeStageVideoSequence) {
        playNextStageVideo(video);
        return;
      }

      if (index < backgroundBridgeVideos.length - 1) {
        playBridgeVideo(index + 1);
        return;
      }

      startLoopVideo();
    });
  });

  function getStageKey(state) {
    return Object.entries(stageGroups).find(([, group]) => group.has(state))?.[0];
  }

  function setState(state) {
    if (!states.includes(state)) return;

    slide.dataset.participationState = state;

    const activeStage = getStageKey(state);
    stateButtons.forEach((button) => {
      button.classList.toggle(
        'is-active',
        button.dataset.participationStateButton === activeStage,
      );
    });
  }

  function revealStage(stageKey) {
    const button = stateButtons.find(
      (item) => item.dataset.participationStateButton === stageKey,
    );
    button?.classList.add('is-visible');
  }

  function revealAllStages() {
    stateButtons.forEach((button) => {
      button.classList.add('is-visible');
    });
  }

  function revealTimedElement(key) {
    timedElements
      .filter((element) => element.dataset.participationTimed === key)
      .forEach((element) => {
        element.classList.add('is-visible');
      });
  }

  function revealAllTimedElements() {
    timedElements.forEach((element) => {
      element.classList.add('is-visible');
    });
  }

  function resetTimedElements() {
    timedElements.forEach((element) => {
      element.classList.remove('is-visible');
    });
  }

  function resetStages() {
    stateButtons.forEach((button) => {
      button.classList.remove('is-visible', 'is-active');
    });
  }

  function getVideoByToken(token) {
    if (token === 'loop') return backgroundLoopVideo;

    return backgroundBridgeVideos.find(
      (video) => video.dataset.participationBgOrder === token,
    );
  }

  function resetVideosForStageSequence(fromSceneOne) {
    clearBackgroundTimeline();
    backgroundSceneOne?.classList.add('is-active');
    backgroundSceneOne?.classList.toggle('is-fading-out', !fromSceneOne);

    backgroundVideos.forEach((video) => {
      video.classList.remove('is-active');
      video.loop = false;

      try {
        video.pause();
        video.currentTime = 0;
      } catch (error) {
        // Видео может еще читать метаданные при быстрой смене состояния.
      }
    });
  }

  function playStageVideoToken(token, shouldLoop = false) {
    const video = getVideoByToken(token);
    if (!video || !slide.classList.contains('visible')) return;

    video.loop = shouldLoop;
    video.classList.add('is-active');
    playBackgroundVideo(video, true);
  }

  function playNextStageVideo(currentVideo) {
    const sequence = activeStageVideoSequence;
    if (!sequence) return;

    const currentIndex = sequence.tokens.findIndex(
      (token) => getVideoByToken(token) === currentVideo,
    );
    if (currentIndex < 0) return;

    const nextToken = sequence.tokens[currentIndex + 1];
    if (nextToken) {
      const nextVideo = getVideoByToken(nextToken);
      const shouldLoop = nextToken === sequence.loopToken && nextVideo === backgroundLoopVideo;
      playStageVideoToken(nextToken, shouldLoop);
      return;
    }

    playStageVideoToken(sequence.loopToken, true);
  }

  function playStageSequence(stageKey) {
    const sequence = stageVideoSequences[stageKey];
    if (!sequence) return;

    resetVideosForStageSequence(sequence.fromSceneOne);
    activeStageVideoSequence = sequence;

    const startSequence = () => {
      const firstToken = sequence.tokens[0];
      const firstVideo = getVideoByToken(firstToken);
      const shouldLoop = firstToken === sequence.loopToken && firstVideo === backgroundLoopVideo;

      playStageVideoToken(firstToken, shouldLoop);

      if (sequence.fromSceneOne) {
        window.requestAnimationFrame(() => {
          backgroundSceneOne?.classList.add('is-fading-out');
        });
      }
    };

    if (sequence.fromSceneOne) {
      backgroundTimers.push(window.setTimeout(startSequence, videoStartDelayMs));
      return;
    }

    startSequence();
  }

  function startTimeline() {
    clearStageTimeline();
    if (!slide.classList.contains('visible') || !modal?.hidden) return;

    resetStages();
    resetTimedElements();
    setState('standby');
    const timedSchedule = [
      { key: 'asset', delay: 900 },
      { key: 'lead', delay: 1600 },
      { key: 'creationFlow', delay: 2400 },
      { key: 'traffic', delay: 6900 },
      { key: 'control', delay: 10400 },
      { key: 'shareholderPanel', delay: 12200 },
      { key: 'actions', delay: 13600 },
      { key: 'partnership', delay: 15000 },
      { key: 'bottom', delay: 16000 },
    ];

    timedSchedule.forEach(({ key, delay }) => {
      stageTimers.push(
        window.setTimeout(() => {
          revealTimedElement(key);
        }, delay),
      );
    });

    stageSequence.forEach(({ state, stage, delay }) => {
      stageTimers.push(
        window.setTimeout(() => {
          if (stage) {
            revealStage(stage);
          }
          setState(state);
        }, videoStartDelayMs + delay),
      );
    });
  }

  function fillModal(key) {
    const source = modalSources.get(key);
    if (!source) return false;

    if (modalMeta) {
      modalMeta.textContent =
        source.querySelector('[data-participation-modal-source-meta]')?.textContent.trim() ||
        '';
    }

    if (modalTitle) {
      modalTitle.textContent =
        source.querySelector('[data-participation-modal-source-title]')?.textContent.trim() ||
        '';
    }

    if (modalBody) {
      const body = source.querySelector('[data-participation-modal-source-body]');
      modalBody.innerHTML = body?.outerHTML || '';
    }

    return true;
  }

  function cancelModalAnimations() {
    window.clearTimeout(closeTimer);
    closeTimer = null;
    modal?.getAnimations().forEach((animation) => animation.cancel());
    modalCard?.getAnimations().forEach((animation) => animation.cancel());
  }

  function hasOpenBlockingModal() {
    return Boolean(
      document.querySelector(
        '.scenario-modal:not([hidden]), [data-value-modal]:not([hidden]), [data-roadmap-scope-modal]:not([hidden]), [data-participation-modal]:not([hidden])',
      ),
    );
  }

  function lockDeckNavigation() {
    document.body.classList.add('participation-modal-open', 'scenario-modal-open');
  }

  function unlockDeckNavigation() {
    document.body.classList.remove('participation-modal-open');

    if (!hasOpenBlockingModal()) {
      document.body.classList.remove('scenario-modal-open');
    }
  }

  function openModal(trigger) {
    if (!modal) return;

    const key = trigger?.dataset.participationModalOpen;
    if (!key || !fillModal(key)) return;

    clearStageTimeline();
    cancelModalAnimations();
    activeModalKey = key;
    sourceTrigger = trigger;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    lockDeckNavigation();

    window.requestAnimationFrame(() => {
      modal.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 240,
        easing: 'ease-out',
      });

      modalCard?.animate(
        [
          { opacity: 0, transform: 'translateY(1.1rem) scale(0.985)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        {
          duration: 420,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        },
      );

      closeButton?.focus();
    });
  }

  function closeModal(instant = false) {
    if (!modal || modal.hidden) return;

    const finish = () => {
      cancelModalAnimations();
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      unlockDeckNavigation();
      sourceTrigger?.focus?.();
      activeModalKey = null;
      sourceTrigger = null;
    };

    if (instant || !modalCard) {
      finish();
      return;
    }

    modal.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 220,
      easing: 'ease-in',
      fill: 'forwards',
    });

    const panelAnimation = modalCard.animate(
      [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(0.8rem) scale(0.985)' },
      ],
      {
        duration: 260,
        easing: 'ease-in',
        fill: 'forwards',
      },
    );

    panelAnimation.addEventListener('finish', finish, { once: true });
    closeTimer = window.setTimeout(finish, 340);
  }

  function cleanup() {
    observer?.disconnect();
    removeManagedEventListeners();
    closeModal(true);
    clearStageTimeline();
    resetBackgroundScene({ release: true });
    resetStages();
    resetTimedElements();
    setState('standby');
    delete slide.dataset.participationReady;
  }

  stateButtons.forEach((button) => {
    addManagedEventListener(button, 'click', () => {
      clearStageTimeline();
      const stageKey = button.dataset.participationStateButton;
      revealAllStages();
      revealAllTimedElements();
      setState(stageKey);
      playStageSequence(stageKey);
    });
  });

  modalTriggers.forEach((trigger) => {
    addManagedEventListener(trigger, 'click', (event) => {
      event.stopPropagation();
      openModal(trigger);
    });
  });

  addManagedEventListener(closeButton, 'click', () => closeModal());

  addManagedEventListener(modal, 'click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  addManagedEventListener(window, 'keydown', (event) => {
    if (!modal || modal.hidden || event.key !== 'Escape') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal();
  });

  addManagedEventListener(window, 'deck:languagechange', () => {
    if (!modal?.hidden && activeModalKey) {
      fillModal(activeModalKey);
    }
  });

  function enterSlide() {
    startTimeline();
    startBackgroundScene();
  }

  function leaveSlide() {
    clearStageTimeline();
    resetBackgroundScene({ release: true });
    resetStages();
    resetTimedElements();
    setState('standby');
  }

  if (typeof window.MutationObserver === 'function') {
    observer = new MutationObserver(() => {
      const nextVisible = slide.classList.contains('visible');
      if (nextVisible === isSlideVisible) return;

      isSlideVisible = nextVisible;

      if (nextVisible) {
        enterSlide();
        return;
      }

      leaveSlide();
    });
    observer.observe(slide, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    });
  }

  addManagedEventListener(window, 'beforeunload', cleanup, { once: true });

  if (isSlideVisible) {
    enterSlide();
  }
})();
