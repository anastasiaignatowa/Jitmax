/* MEDIA CONTROLLER */
(function () {
  const { SlidePresentation } = window;
  if (!SlidePresentation) {
    throw new Error('SlidePresentation must be loaded before media-controller.js');
  }

  const assetUtils = window.DeckAssetUtils;
  if (!assetUtils) {
    throw new Error('DeckAssetUtils must be loaded before media-controller.js');
  }

  class DeckAssetCache {
    constructor(data = DeckAssetCache.readData()) {
      this.data = data || {};
      this.assetByPath = new Map();
      this.slideAssets = new Map();
      this.preloaded = new Map();
      this.indexAssets();
    }

    static readData() {
      const node = document.getElementById('deck-assets-data');
      if (node?.textContent?.trim()) {
        try {
          return JSON.parse(node.textContent);
        } catch (error) {
          console.warn('Не удалось прочитать манифест ассетов', error);
        }
      }

      return window.DECK_ASSET_MANIFEST || null;
    }

    normalizePath(path) {
      return assetUtils.normalizeAssetPath(path);
    }

    addAsset(asset, slideId = null) {
      const entry =
        typeof asset === 'string' ? { path: asset } : { ...(asset || {}) };
      entry.path = this.normalizePath(entry.path);
      if (!entry.path) return;

      this.assetByPath.set(entry.path, entry);

      if (slideId) {
        if (!this.slideAssets.has(slideId)) this.slideAssets.set(slideId, []);
        this.slideAssets.get(slideId).push(entry);
      }
    }

    indexAssets() {
      (this.data.sharedAssets || []).forEach((asset) => this.addAsset(asset));
      (this.data.slides || []).forEach((slide) => {
        (slide.assets || []).forEach((asset) => this.addAsset(asset, slide.id));
      });
    }

    resolve(path) {
      const cleanPath = this.normalizePath(path);
      if (!cleanPath || !cleanPath.startsWith('assets/')) return path;
      if (String(path).includes('?v=')) return path;

      return assetUtils.resolveAssetRef(cleanPath, this.assetByPath);
    }

    versionCssText(value) {
      return assetUtils.versionAssetRefs(value, this.assetByPath);
    }

    applyStaticAssetVersions(root = document) {
      root
        .querySelectorAll('audio[src], img[src], video[src], source[src], [poster]')
        .forEach((node) => {
          ['src', 'poster'].forEach((attribute) => {
            const value = node.getAttribute(attribute);
            if (value?.startsWith('assets/')) {
              node.setAttribute(attribute, this.resolve(value));
            }
          });
        });

      root.querySelectorAll('[style*="assets/"]').forEach((node) => {
        node.setAttribute('style', this.versionCssText(node.getAttribute('style')));
      });
    }

    getSlideAssets(slide) {
      const slideId =
        typeof slide === 'string'
          ? slide
          : slide?.id || (slide?.number ? `slide-${slide.number}` : null);
      return slideId ? this.slideAssets.get(slideId) || [] : [];
    }

    preloadSlide(slide, rel = 'prefetch') {
      const retainedKeys = [];

      this.getSlideAssets(slide).forEach((asset) => {
        if (!this.shouldPreloadAsset(asset, rel)) return;
        if (!asset.path) return;

        const key = `${rel}:${asset.path}`;
        retainedKeys.push(key);
        if (this.preloaded.has(key)) return;

        const link = document.createElement('link');
        link.rel = rel;
        link.href = this.resolve(asset.path);
        link.dataset.deckPreloadKey = key;

        if (asset.kind === 'image') link.as = 'image';
        if (asset.kind === 'video') link.as = 'video';
        if (asset.kind === 'audio') link.as = 'audio';

        document.head.append(link);
        this.preloaded.set(key, link);
      });

      return retainedKeys;
    }

    prunePreloadedAssets(retainedKeys = new Set()) {
      const retained =
        retainedKeys instanceof Set ? retainedKeys : new Set(retainedKeys);

      this.preloaded.forEach((link, key) => {
        if (retained.has(key)) return;

        link.remove();
        this.preloaded.delete(key);
      });
    }

    shouldPreloadAsset(asset, rel) {
      if (!asset?.path) return false;

      const isVideo =
        asset.kind === 'video' || /\.mp4(?:[?#]|$)/i.test(asset.path);
      if (!isVideo) return rel === 'preload' || asset.kind === 'image';

      return (
        asset.preload === true ||
        asset.preload === rel ||
        asset.priority === 'high'
      );
    }
  }

  window.DeckAssetCache = DeckAssetCache;
  window.deckAssetCache = window.deckAssetCache || new DeckAssetCache();

  const normalizeMediaPath = (path) =>
    assetUtils.normalizeAssetPath(path);

  const resolveMediaAsset = (path) =>
    window.deckAssetCache?.resolve(path) || path;

  const valueVideoCrossfadeMs = 720;
  const valueVideoCrossfadeState = new WeakMap();
  const finalLoopCrossfadeState = new WeakMap();
  const visibilityPausedVideos = new WeakSet();

  const scheduleMediaFrame = (callback) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(callback);
      return;
    }

    window.setTimeout(callback, 0);
  };

  const waitForMediaFrames = (frameCount = 2) =>
    new Promise((resolve) => {
      let remainingFrames = Math.max(0, frameCount);

      const step = () => {
        if (remainingFrames <= 0) {
          resolve();
          return;
        }

        remainingFrames -= 1;
        scheduleMediaFrame(step);
      };

      step();
    });

  const prefersReducedMotion = () =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;

  const syncDefinitionLoopState = (video) => {
    if (!video?.classList?.contains('definition-video')) return;

    const slide = video.closest('.definition-slide');
    if (!slide) return;

    const sceneIndex = Number(video.dataset.sceneIndex || 0);
    const scenes = (video.dataset.scenes || '')
      .split('|')
      .map((scene) => scene.trim())
      .filter(Boolean);
    const isLoopFinalSequence =
      video.dataset.sequenceLoopFinal === 'true' && scenes.length > 1;
    const isReady = isLoopFinalSequence
      ? sceneIndex === scenes.length - 1
      : sceneIndex > 0;

    slide.classList.toggle(
      'is-definition-second-scene-ready',
      Number.isFinite(sceneIndex) && sceneIndex >= 1,
    );
    slide.classList.toggle(
      'is-definition-loop-ready',
      Number.isFinite(sceneIndex) && isReady,
    );
  };

  const shouldLoopFinalVideoScene = (video, sceneIndex, scenes) =>
    video?.dataset.sequenceLoopFinal === 'true' &&
    Array.isArray(scenes) &&
    sceneIndex === scenes.length - 1;

  const isDesktopViewport = () =>
    window.matchMedia?.('(min-width: 861px)')?.matches || false;

  const getFinalLoopCrossfadeMs = (video) => {
    const value = Number.parseFloat(video?.dataset.sequenceLoopCrossfadeMs || '');
    if (!Number.isFinite(value) || value <= 0) return 0;

    return Math.min(Math.max(value, 240), 1400);
  };

  const shouldUseFinalLoopCrossfade = (video, sceneIndex, scenes) =>
    shouldLoopFinalVideoScene(video, sceneIndex, scenes) &&
    getFinalLoopCrossfadeMs(video) > 0 &&
    isDesktopViewport() &&
    !prefersReducedMotion();

  const setSequencedVideoLoopState = (video, sceneIndex, scenes) => {
    const shouldLoop =
      scenes.length <= 1 || shouldLoopFinalVideoScene(video, sceneIndex, scenes);
    const shouldUseCrossfade = shouldUseFinalLoopCrossfade(
      video,
      sceneIndex,
      scenes,
    );

    video.loop = shouldLoop && !shouldUseCrossfade;
    video.toggleAttribute('loop', shouldLoop && !shouldUseCrossfade);
    syncDefinitionLoopState(video);
  };

  const rememberVideoSources = (video) => {
    if (!video) return;

    const src = video.getAttribute('src');
    if (src && !video.dataset.src) {
      video.dataset.src = normalizeMediaPath(src);
    }

    const poster = video.getAttribute('poster');
    if (poster && !video.dataset.poster) {
      video.dataset.poster = normalizeMediaPath(poster);
    }

    video.querySelectorAll('source[src]').forEach((source) => {
      const sourceSrc = source.getAttribute('src');
      if (sourceSrc && !source.dataset.src) {
        source.dataset.src = normalizeMediaPath(sourceSrc);
      }
    });
  };

  const ensureVideoSourceElement = (video, sourceOverride = null) => {
    if (!video) return false;

    rememberVideoSources(video);

    let didChange = false;
    const directSource = sourceOverride || video.dataset.src;
    const posterSource = video.dataset.poster;

    if (posterSource && !video.hasAttribute('poster')) {
      video.setAttribute('poster', resolveMediaAsset(posterSource));
    }

    if (
      directSource &&
      normalizeMediaPath(video.getAttribute('src')) !==
        normalizeMediaPath(directSource)
    ) {
      video.setAttribute('src', resolveMediaAsset(directSource));
      didChange = true;
    }

    video.querySelectorAll('source[data-src]').forEach((source) => {
      const sourcePath = source.dataset.src;
      if (!sourcePath) return;

      const currentPath = normalizeMediaPath(source.getAttribute('src'));
      if (currentPath === normalizeMediaPath(sourcePath)) return;

      source.setAttribute('src', resolveMediaAsset(sourcePath));
      didChange = true;
    });

    if (didChange) {
      const hubCard = video.closest?.('.hub-card');
      const shouldUseAutoPreload =
        !hubCard ||
        hubCard.classList.contains('is-active') ||
        hubCard.classList.contains('is-drag-preview');
      video.preload = shouldUseAutoPreload ? 'auto' : 'metadata';
      video.load();
    }

    return didChange;
  };

  const releaseVideoSourceElement = (video, { reset = true } = {}) => {
    if (!video) return;

    rememberVideoSources(video);
    const hadDirectSource = video.hasAttribute('src');
    const hadPoster = video.hasAttribute('poster');
    const loadedSources = Array.from(video.querySelectorAll('source[src]'));
    const hadLoadedSource = hadDirectSource || loadedSources.length > 0;
    const hadLoadedMedia = hadLoadedSource || hadPoster;

    try {
      video.pause();
      if (reset) video.currentTime = 0;
    } catch (error) {
      // Media state can be unavailable while the browser is changing sources.
    }

    if (!hadLoadedMedia) return;

    video.removeAttribute('src');
    video.removeAttribute('poster');
    loadedSources.forEach((source) => {
      source.removeAttribute('src');
    });

    try {
      video.load();
    } catch (error) {
      // Some browsers reject load() when the element is already detached.
    }
  };

  const waitForVideoReadyFrame = (video, timeoutMs = 420) =>
    new Promise((resolve) => {
      if (!video) {
        resolve();
        return;
      }

      let timeoutId;
      const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked', 'timeupdate'];
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        events.forEach((eventName) => video.removeEventListener(eventName, check));
      };

      const isReady = () => video.readyState >= 2 && !video.seeking;

      const done = () => {
        cleanup();
        resolve();
      };

      const check = () => {
        if (isReady()) done();
      };

      if (isReady()) {
        resolve();
        return;
      }

      events.forEach((eventName) => video.addEventListener(eventName, check));
      timeoutId = window.setTimeout(done, timeoutMs);
    });

  const activateVideoLayerWhenReady = (layer, isCurrent) => {
    if (!layer) return;

    const canActivate = () =>
      layer.isConnected &&
      layer.readyState >= 2 &&
      (typeof isCurrent !== 'function' || isCurrent());

    const activate = () => {
      if (canActivate()) layer.classList.add('is-active');
    };

    if (typeof layer.requestVideoFrameCallback === 'function') {
      let isDone = false;
      const timeoutId = window.setTimeout(() => {
        if (isDone) return;
        isDone = true;
        activate();
      }, 900);

      layer.requestVideoFrameCallback(() => {
        if (isDone) return;
        isDone = true;
        window.clearTimeout(timeoutId);
        activate();
      });
      return;
    }

    waitForVideoReadyFrame(layer, 900).then(activate);
  };

  const waitForVideoMetadata = (video, { sourceChanged = false, timeoutMs = 700 } = {}) =>
    new Promise((resolve) => {
      if (!video) {
        resolve();
        return;
      }

      let timeoutId;
      const events = ['loadedmetadata', 'loadeddata', 'canplay'];
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        events.forEach((eventName) => video.removeEventListener(eventName, done));
      };

      const done = () => {
        cleanup();
        resolve();
      };

      events.forEach((eventName) => video.addEventListener(eventName, done));
      timeoutId = window.setTimeout(done, timeoutMs);

      if (!sourceChanged && video.readyState > 0) {
        done();
        return;
      }

      if (sourceChanged) {
        scheduleMediaFrame(() => {
          if (video.readyState > 0) done();
        });
      }
    });

  const waitForVideoSeeked = (video, timeoutMs = 520) =>
    new Promise((resolve) => {
      if (!video) {
        resolve();
        return;
      }

      let timeoutId;
      const events = ['seeked', 'loadeddata', 'canplay'];
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        events.forEach((eventName) => video.removeEventListener(eventName, check));
      };

      const done = () => {
        cleanup();
        resolve();
      };

      const check = () => {
        if (!video.seeking && video.readyState >= 2) done();
      };

      events.forEach((eventName) => video.addEventListener(eventName, check));
      timeoutId = window.setTimeout(done, timeoutMs);
      check();
    });

  const removeValueVideoCrossfadeLayerAfterReady = async (layer) => {
    if (!layer) return;

    if (!prefersReducedMotion()) {
      await waitForMediaFrames(2);
    }

    removeValueVideoCrossfadeLayer(layer);
  };

  const removeValueVideoCrossfadeLayer = (layer) => {
    if (!layer) return;

    releaseVideoSourceElement(layer);
    layer.remove();
  };

  const invalidateVideoRun = (video, key) => {
    if (!video) return;

    const nextRunId = Number(video.dataset[key] || 0) + 1;
    video.dataset[key] = String(nextRunId);
  };

  const clearValueVideoCrossfade = (video, { invalidate = true } = {}) => {
    if (!video) return;

    if (invalidate) invalidateVideoRun(video, 'sequenceRunId');

    const state = valueVideoCrossfadeState.get(video);
    if (state) {
      window.clearTimeout(state.timeoutId);
      removeValueVideoCrossfadeLayer(state.layer);
      valueVideoCrossfadeState.delete(video);
    }

    video
      .closest('.hub-card-media')
      ?.querySelectorAll('.hub-sequence-video-layer')
      .forEach((layer) => removeValueVideoCrossfadeLayer(layer));
  };

  const removeFinalLoopCrossfadeLayer = (layer) => {
    if (!layer) return;

    releaseVideoSourceElement(layer);
    layer.remove();
  };

  const clearFinalLoopCrossfade = (video, { invalidate = true } = {}) => {
    if (!video) return;

    if (invalidate) invalidateVideoRun(video, 'finalLoopRunId');

    const state = finalLoopCrossfadeState.get(video);
    if (state) {
      window.clearTimeout(state.timeoutId);
      removeFinalLoopCrossfadeLayer(state.layer);
      finalLoopCrossfadeState.delete(video);
    }

    video
      .closest('.definition-bg')
      ?.querySelectorAll('.definition-video-loop-layer')
      .forEach((layer) => removeFinalLoopCrossfadeLayer(layer));
  };

  const syncVideoTime = (video, time) => {
    if (!video || !Number.isFinite(time)) return;

    const setTime = () => {
      try {
        video.currentTime = time;
      } catch (error) {
        // Metadata can still be unavailable directly after source assignment.
      }
    };

    if (video.readyState > 0) {
      setTime();
      return;
    }

    video.addEventListener('loadedmetadata', setTime, { once: true });
  };

  const prepareVideoAtTime = async (video, time, { sourceChanged = false } = {}) => {
    if (!video || !Number.isFinite(time)) return;

    try {
      video.pause();
    } catch (error) {
      // The media element may still be loading the newly assigned source.
    }

    await waitForVideoMetadata(video, { sourceChanged });

    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const targetTime = duration ? Math.min(Math.max(time, 0), Math.max(duration - 0.05, 0)) : time;
    syncVideoTime(video, targetTime);

    await waitForVideoSeeked(video);
    await waitForVideoReadyFrame(video);
  };

  window.deckMedia = {
    ...(window.deckMedia || {}),
    ensureVideoSource: ensureVideoSourceElement,
    releaseVideoSource: releaseVideoSourceElement,
  };

  Object.assign(SlidePresentation.prototype, {
    isPreviewMode() {
      return Boolean(document.documentElement.dataset.previewSlide);
    },

    resolveAsset(path) {
      return this.assetCache?.resolve(path) || window.deckAssetCache?.resolve(path) || path;
    },

    ensureVideoSource(video, sourceOverride = null) {
      return ensureVideoSourceElement(video, sourceOverride);
    },

    releaseVideoSource(video, options) {
      releaseVideoSourceElement(video, options);
    },

    releaseSlideMedia(slide) {
      this.teardownHubSlideRuntime?.(slide);
      slide?.querySelectorAll('video').forEach((video) => {
        clearValueVideoCrossfade(video);
        clearFinalLoopCrossfade(video);
        this.releaseVideoSource(video);
      });
      slide
        ?.querySelectorAll('.hub-sequence-video-layer')
        .forEach((layer) => removeValueVideoCrossfadeLayer(layer));
      slide
        ?.querySelectorAll('.definition-video-loop-layer')
        .forEach((layer) => removeFinalLoopCrossfadeLayer(layer));
    },

    releaseInactiveSlideMedia(activeSlide) {
      this.slides?.forEach((slide) => {
        if (slide !== activeSlide) this.releaseSlideMedia(slide);
      });
    },

    getActiveSlideElement() {
      const currentIndex = this.getCurrentSlideIndex?.() ?? this.currentSlide ?? 0;
      return (
        this.slides?.[currentIndex] ||
        document.querySelector('.slide.visible') ||
        null
      );
    },

    pauseActiveSlideMediaForVisibility() {
      const activeSlide = this.getActiveSlideElement?.();
      const videos = activeSlide
        ? activeSlide.querySelectorAll('video')
        : document.querySelectorAll('.slide.visible video');

      videos.forEach((video) => {
        if (video.paused || video.ended) return;

        visibilityPausedVideos.add(video);
        try {
          video.pause();
        } catch (error) {
          // Media state can be unavailable while the browser changes tabs.
        }
      });
    },

    resumeActiveSlideMedia() {
      const activeSlide = this.getActiveSlideElement?.();
      if (!activeSlide?.classList?.contains('visible')) return;

      activeSlide.querySelectorAll('video').forEach((video) => {
        if (!visibilityPausedVideos.has(video)) return;
        visibilityPausedVideos.delete(video);
        if (video.closest('.hub-modal')) return;

        const hubCard = video.closest('.hub-card');
        if (hubCard && !hubCard.classList.contains('is-active')) return;

        this.ensureVideoSource(video);
        video.play?.()?.catch?.(() => {});
      });
    },

    verifyInactiveSlideMediaReleased(activeSlide) {
      if (this.isPreviewMode?.()) return true;

      const leaks = [];
      this.slides?.forEach((slide) => {
        if (!slide || slide === activeSlide) return;
        if (!this.hasLoadedMedia(slide)) return;

        leaks.push(slide.id || slide.dataset?.slide || 'unknown');
      });

      if (leaks.length) {
        console.warn('Не очищены медиа предыдущих слайдов', leaks);
        return false;
      }

      return true;
    },

    scheduleInactiveSlideMediaRelease(activeSlide) {
      window.clearTimeout(this.inactiveMediaReleaseTimer);
      this.inactiveMediaReleaseTimer = window.setTimeout(() => {
        this.releaseInactiveSlideMedia(activeSlide);
        this.verifyInactiveSlideMediaReleased(activeSlide);
      }, 980);
    },

    hasLoadedMedia(root) {
      return Boolean(
        root?.querySelector?.(
          'video[src], video[poster], source[src], .hub-sequence-video-layer, .definition-video-loop-layer, .hub-rain-feature-layer',
        ),
      );
    },

    releaseInactiveHubMedia(retainedCards = null) {
      const retained =
        retainedCards instanceof Set
          ? retainedCards
          : this.getRetainedHubCards?.(retainedCards) ||
            new Set(retainedCards ? [retainedCards] : []);

      this.hubCards?.forEach((card) => {
        if (retained.has(card) || !this.hasLoadedMedia(card)) return;

        this.releaseSlideMedia(card);
      });
    },

    loadHubCardMedia(card, { play = true } = {}) {
      card?.querySelectorAll('video').forEach((video) => {
        if (video.dataset.hubAutoplay === 'true') {
          video.autoplay = true;
          delete video.dataset.hubAutoplay;
        }

        const scenes = this.getValueVideoScenes(video);
        if (scenes[0]) {
          video.dataset.sceneIndex = '0';
          video.loop = scenes.length <= 1;
          this.ensureVideoSource(video, scenes[0]);
        } else {
          this.ensureVideoSource(video);
        }

        if (play) video.play?.()?.catch?.(() => {});
      });
    },

    loadSlideMedia(slide) {
      slide.querySelectorAll('video').forEach((video) => {
        if (video.closest('.hub-modal')) return;
        if (video.matches('[data-participation-bg-video], [data-roadmap-bg-video]')) {
          return;
        }

        const hubCard = video.closest('.hub-card');
        if (hubCard && !hubCard.classList.contains('is-active')) return;
        this.ensureVideoSource(video);
      });
    },

    preloadNearbySlides(activeIndex) {
      if (this.isPreviewMode?.()) return;

      this.assetCache?.prunePreloadedAssets?.(new Set());
    },

    resetSlidePlayback(slide) {
      window.clearTimeout(this.titleVideoRevealTimer);
      window.clearTimeout(this.titleVideoPlayTimer);

      if (this.isPreviewMode?.()) {
        slide.classList.add('media-ready');
        return;
      }

      this.scheduleInactiveSlideMediaRelease(slide);
      this.loadSlideMedia(slide);

      slide.querySelectorAll('video').forEach((video) => {
        try {
          if (video.closest('.hub-modal')) return;
          if (video.matches('[data-participation-bg-video]')) return;
          if (video.matches('[data-roadmap-bg-video]')) return;

          const hubCard = video.closest('.hub-card');
          if (hubCard && !hubCard.classList.contains('is-active')) return;

          const scenes = this.getValueVideoScenes(video);
          if (scenes[0]) {
            video.dataset.sceneIndex = '0';
            setSequencedVideoLoopState(video, 0, scenes);
            this.ensureVideoSource(video, scenes[0]);
          }

          try {
            video.currentTime = 0;
          } catch (error) {
            // Metadata may not be ready immediately after lazy source assignment.
          }

          video.pause();

          if (video.classList.contains('title-video')) {
            this.titleVideoRevealTimer = window.setTimeout(() => {
              slide.classList.add('media-ready');
            }, 80);

            this.titleVideoPlayTimer = window.setTimeout(() => {
              const playPromise = video.play();
              playPromise?.catch?.(() => {});
            }, 1180);
            return;
          }

          const playPromise = video.play();
          playPromise?.catch?.(() => {});
        } catch (error) {
          // Some browsers block media state changes during fast navigation.
        }
      });
    },

    disposeMediaRuntime() {
      window.clearTimeout(this.inactiveMediaReleaseTimer);
      window.clearTimeout(this.titleVideoRevealTimer);
      window.clearTimeout(this.titleVideoPlayTimer);
      this.inactiveMediaReleaseTimer = null;
      this.titleVideoRevealTimer = null;
      this.titleVideoPlayTimer = null;

      this.closeScenarioModal?.(true);
      this.closeHubModal?.();
      this.teardownHubSlideRuntime?.(this.hubSlide);
      this.slides?.forEach((slide) => this.releaseSlideMedia(slide));
      this.assetCache?.prunePreloadedAssets?.(new Set());
    },

    setupMediaLifecycle() {
      if (this.isMediaLifecycleReady || this.isPreviewMode?.()) return;

      this.isMediaLifecycleReady = true;

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.pauseActiveSlideMediaForVisibility?.();
          return;
        }

        this.resumeActiveSlideMedia?.();
      });

      const handlePageHidden = () => {
        this.pauseActiveSlideMediaForVisibility?.();
      };
      const handlePageShown = (event) => {
        if (!event.persisted) return;

        this.resumeActiveSlideMedia?.();
      };

      window.addEventListener('pagehide', handlePageHidden);
      window.addEventListener('beforeunload', handlePageHidden);
      window.addEventListener('pageshow', handlePageShown);
    },

    getValueVideoScenes(video) {
      return (video.dataset.scenes || '')
        .split('|')
        .map((scene) => scene.trim())
        .filter(Boolean);
    },

    getValueVideoSceneHold(video, currentIndex) {
      const hold = (video?.dataset.sequenceSceneHolds || '')
        .split('|')
        .map((value) => Number.parseFloat(value.trim()))[currentIndex];

      return Number.isFinite(hold) && hold > 0 ? hold : null;
    },

    advanceSlideAfterSceneSequence(video, currentIndex, scenes) {
      const card = video?.closest('.hub-card');
      const slide = card?.closest('.hub-slide');
      const activeCard = this.hubCards?.[this.activeHubCard];
      const isDesktop = window.matchMedia('(min-width: 861px)').matches;

      if (!card || !this.hubCards?.length) return false;
      if (card !== activeCard || !card.classList.contains('is-active')) return false;
      if (card.dataset.hubAdvanceAfterScenes !== 'slide') return false;
      if (!isDesktop || this.isPreviewMode?.() || this.isHubPreviewMode) return false;
      if (document.body.classList.contains('hub-modal-open')) return false;
      if (!slide?.classList.contains('visible')) return false;
      if (!Array.isArray(scenes) || currentIndex !== scenes.length - 1) {
        return false;
      }

      window.dispatchEvent(
        new CustomEvent('deck:hub-card-auto-advance', {
          detail: {
            currentIndex,
            cardIndex: this.activeHubCard,
            sceneCount: scenes.length,
            target: 'slide',
          },
        }),
      );
      this.goTo?.((this.getCurrentSlideIndex?.() ?? this.currentSlide ?? 0) + 1);
      return true;
    },

    startValueVideoCrossfade(video, scenes, nextIndex) {
      const media = video?.closest('.hub-card-media');
      const nextScene = scenes?.[nextIndex];
      if (!video || !media || !nextScene) return false;

      const runId = Number(video.dataset.sequenceRunId || 0) + 1;
      video.dataset.sequenceRunId = String(runId);
      clearValueVideoCrossfade(video, { invalidate: false });

      const layer = document.createElement('video');
      layer.className = 'hub-card-video hub-sequence-video-layer';
      layer.muted = true;
      layer.playsInline = true;
      layer.preload = 'auto';
      layer.setAttribute('muted', '');
      layer.setAttribute('playsinline', '');
      layer.setAttribute('preload', 'auto');
      layer.setAttribute('aria-hidden', 'true');
      layer.src = this.resolveAsset?.(nextScene) || resolveMediaAsset(nextScene);

        const finish = async () => {
        if (Number(video.dataset.sequenceRunId || 0) !== runId) {
          removeValueVideoCrossfadeLayer(layer);
          return;
        }

        const layerTime = layer.currentTime || 0;
        video.dataset.sceneIndex = String(nextIndex);
        setSequencedVideoLoopState(video, nextIndex, scenes);
        const sourceChanged = this.ensureVideoSource(video, nextScene);
        await prepareVideoAtTime(video, layerTime, { sourceChanged });

        if (Number(video.dataset.sequenceRunId || 0) !== runId) {
          removeValueVideoCrossfadeLayer(layer);
          return;
        }

        video.play()?.catch?.(() => {});
        await waitForVideoReadyFrame(video);

        if (Number(video.dataset.sequenceRunId || 0) !== runId) {
          removeValueVideoCrossfadeLayer(layer);
          return;
        }

        await removeValueVideoCrossfadeLayerAfterReady(layer);

        if (valueVideoCrossfadeState.get(video)?.layer === layer) {
          valueVideoCrossfadeState.delete(video);
        }
      };

      const timeoutId = window.setTimeout(
        finish,
        prefersReducedMotion() ? 0 : valueVideoCrossfadeMs + 80,
      );

      valueVideoCrossfadeState.set(video, { layer, timeoutId });
      media.append(layer);
      layer.load();
      layer.play()?.catch?.(() => {});
      activateVideoLayerWhenReady(
        layer,
        () => Number(video.dataset.sequenceRunId || 0) === runId,
      );

      return true;
    },

    startDefinitionVideoCrossfade(video, scenes, nextIndex) {
      if (!video?.classList?.contains('definition-video')) return false;

      const media = video.closest('.definition-bg');
      const nextScene = scenes?.[nextIndex];
      if (!media || !nextScene) return false;

      const runId = Number(video.dataset.finalLoopRunId || 0) + 1;
      video.dataset.finalLoopRunId = String(runId);
      clearFinalLoopCrossfade(video, { invalidate: false });

      const layer = document.createElement('video');
      layer.className = 'definition-video-loop-layer';
      layer.muted = true;
      layer.playsInline = true;
      layer.preload = 'auto';
      layer.setAttribute('muted', '');
      layer.setAttribute('playsinline', '');
      layer.setAttribute('preload', 'auto');
      layer.setAttribute('aria-hidden', 'true');
      layer.src = this.resolveAsset?.(nextScene) || resolveMediaAsset(nextScene);

      const finish = async () => {
        if (Number(video.dataset.finalLoopRunId || 0) !== runId) {
          removeFinalLoopCrossfadeLayer(layer);
          return;
        }

        const layerTime = layer.currentTime || 0;
        video.dataset.sceneIndex = String(nextIndex);
        setSequencedVideoLoopState(video, nextIndex, scenes);
        const sourceChanged = this.ensureVideoSource(video, nextScene);
        await prepareVideoAtTime(video, layerTime, { sourceChanged });

        if (Number(video.dataset.finalLoopRunId || 0) !== runId) {
          removeFinalLoopCrossfadeLayer(layer);
          return;
        }

        video.play()?.catch?.(() => {});
        await waitForVideoReadyFrame(video);

        if (Number(video.dataset.finalLoopRunId || 0) !== runId) {
          removeFinalLoopCrossfadeLayer(layer);
          return;
        }

        removeFinalLoopCrossfadeLayer(layer);

        if (finalLoopCrossfadeState.get(video)?.layer === layer) {
          finalLoopCrossfadeState.delete(video);
        }
      };

      const timeoutId = window.setTimeout(
        finish,
        prefersReducedMotion() ? 0 : valueVideoCrossfadeMs + 80,
      );

      finalLoopCrossfadeState.set(video, { layer, timeoutId });
      media.append(layer);
      layer.load();
      layer.play()?.catch?.(() => {});
      activateVideoLayerWhenReady(
        layer,
        () => Number(video.dataset.finalLoopRunId || 0) === runId,
      );

      return true;
    },

    shouldStartFinalLoopCrossfade(video) {
      const scenes = this.getValueVideoScenes(video);
      const currentIndex = Number(video?.dataset.sceneIndex || 0);
      if (!shouldUseFinalLoopCrossfade(video, currentIndex, scenes)) return false;
      if (finalLoopCrossfadeState.has(video)) return false;

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const leadSeconds = getFinalLoopCrossfadeMs(video) / 1000;

      return duration > leadSeconds && currentTime >= duration - leadSeconds;
    },

    startFinalLoopCrossfade(video, scenes) {
      const currentIndex = Number(video?.dataset.sceneIndex || 0);
      if (!shouldUseFinalLoopCrossfade(video, currentIndex, scenes)) return false;
      if (finalLoopCrossfadeState.has(video)) return true;

      const media = video.closest('.definition-bg');
      const finalScene = scenes?.[currentIndex];
      if (!media || !finalScene) return false;

      const crossfadeMs = getFinalLoopCrossfadeMs(video);
      const runId = Number(video.dataset.finalLoopRunId || 0) + 1;
      video.dataset.finalLoopRunId = String(runId);
      clearFinalLoopCrossfade(video, { invalidate: false });

      const layer = document.createElement('video');
      layer.className = 'definition-video-loop-layer';
      layer.muted = true;
      layer.playsInline = true;
      layer.preload = 'auto';
      layer.setAttribute('muted', '');
      layer.setAttribute('playsinline', '');
      layer.setAttribute('preload', 'auto');
      layer.setAttribute('aria-hidden', 'true');
      layer.src = this.resolveAsset?.(finalScene) || resolveMediaAsset(finalScene);

      const finish = async () => {
        if (Number(video.dataset.finalLoopRunId || 0) !== runId) {
          removeFinalLoopCrossfadeLayer(layer);
          return;
        }

        const layerTime = layer.currentTime || 0;
        const sourceChanged = this.ensureVideoSource(video, finalScene);
        await prepareVideoAtTime(video, layerTime, { sourceChanged });

        if (Number(video.dataset.finalLoopRunId || 0) !== runId) {
          removeFinalLoopCrossfadeLayer(layer);
          return;
        }

        video.play()?.catch?.(() => {});
        await waitForVideoReadyFrame(video);

        if (Number(video.dataset.finalLoopRunId || 0) !== runId) {
          removeFinalLoopCrossfadeLayer(layer);
          return;
        }

        removeFinalLoopCrossfadeLayer(layer);

        if (finalLoopCrossfadeState.get(video)?.layer === layer) {
          finalLoopCrossfadeState.delete(video);
        }
      };

      const timeoutId = window.setTimeout(finish, crossfadeMs + 80);
      finalLoopCrossfadeState.set(video, { layer, timeoutId });
      media.append(layer);
      layer.load();
      layer.play()?.catch?.(() => {});
      activateVideoLayerWhenReady(
        layer,
        () => Number(video.dataset.finalLoopRunId || 0) === runId,
      );

      return true;
    },

    setupValueVideoSequence() {
      document.querySelectorAll('video').forEach((video) => {
        if (video.dataset.valueSequenceReady === 'true') return;

        video.dataset.valueSequenceReady = 'true';

        const advanceSequence = () => {
          if (this.shouldSkipValueVideoSequence?.(video)) return;
          const ownerSlide = video.closest?.('.slide');
          if (ownerSlide && !ownerSlide.classList.contains('visible')) return;
          const hubCard = video.closest?.('.hub-card');
          if (hubCard && !hubCard.classList.contains('is-active')) return;

          const scenes = this.getValueVideoScenes(video);
          if (scenes.length < 2) return;

          const currentIndex = Number(video.dataset.sceneIndex || 0);
          if (this.advanceHubCardAfterSceneSequence?.(video, currentIndex, scenes)) {
            return;
          }
          if (this.advanceSlideAfterSceneSequence?.(video, currentIndex, scenes)) {
            return;
          }

          if (shouldLoopFinalVideoScene(video, currentIndex, scenes)) {
            if (this.startFinalLoopCrossfade(video, scenes)) return;

            try {
              video.currentTime = 0;
            } catch (error) {
              // Metadata can be unavailable if the source was just restored.
            }

            video.play()?.catch?.(() => {});
            return;
          }

          const nextIndex = (currentIndex + 1) % scenes.length;

          if (this.startDefinitionVideoCrossfade?.(video, scenes, nextIndex)) {
            return;
          }

          if (video.dataset.sequenceTransition === 'crossfade') {
            if (this.startValueVideoCrossfade(video, scenes, nextIndex)) return;
          }

          video.dataset.sceneIndex = String(nextIndex);
          setSequencedVideoLoopState(video, nextIndex, scenes);
          this.ensureVideoSource(video, scenes[nextIndex]);

          const playPromise = video.play();
          playPromise?.catch?.(() => {});
        };

        video.addEventListener('ended', advanceSequence);

        video.addEventListener('timeupdate', () => {
          const ownerSlide = video.closest?.('.slide');
          if (ownerSlide && !ownerSlide.classList.contains('visible')) return;
          const hubCard = video.closest?.('.hub-card');
          if (hubCard && !hubCard.classList.contains('is-active')) return;

          if (this.shouldStartFinalLoopCrossfade(video)) {
            this.startFinalLoopCrossfade(video, this.getValueVideoScenes(video));
            return;
          }

          if (!video.dataset.sequenceSceneHolds) return;
          if (!window.matchMedia('(min-width: 861px)').matches) return;
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

          const currentIndex = Number(video.dataset.sceneIndex || 0);
          const hold = this.getValueVideoSceneHold(video, currentIndex);
          if (!hold || (video.currentTime || 0) < hold) return;

          advanceSequence();
        });
      });
    },
  });
})();
