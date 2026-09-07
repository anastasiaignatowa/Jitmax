/* SCENARIO MODES */
(function () {
  const { SlidePresentation } = window;
  if (!SlidePresentation) {
    throw new Error('SlidePresentation must be loaded before scenario-modes.js');
  }

  const initializedScenarioModeSlides = new WeakSet();

  Object.assign(SlidePresentation.prototype, {
      setupScenarioModes() {
        const slide = document.getElementById('slide-5');
        if (slide && initializedScenarioModeSlides.has(slide)) return;
        if (slide) initializedScenarioModeSlides.add(slide);

        const secondPositionClass = 'is-scenario-second-position';
        const himalayasImage = 'slide-05-yoga-himalayas.png';
        const yogaDefaultMode = 'space';
        let scenarioSecondPositionTimer = null;
        let scenarioSecondPositionAnimation = null;
        let scenarioYogaVideoStartTimer = null;
        const scenarioCardVideoState = new WeakMap();
        const scenarioVideoLayerCleanup = new WeakMap();
        const scenarioModeObservers = [];
        const scenarioCardVideoFadeMs = 720;
        const scenarioYogaVideoHoldMs = 4000;
        const scenarioYogaInitialStartDelayMs = 4200;

        const getScenarioVideoScenes = (button) => {
          const scenes = String(button?.dataset.scenarioVideoScenes || '')
            .split('|')
            .map((scene) => scene.trim())
            .filter(Boolean);

          if (scenes.length) return scenes;
          return button?.dataset.scenarioVideo
            ? [button.dataset.scenarioVideo]
            : [];
        };

        const getScenarioButtons = (card) =>
          Array.from(
            card?.querySelectorAll('.scenario-chip[data-scenario-image]') || [],
          );

        const getScenarioActiveButton = (card) => {
          const buttons = getScenarioButtons(card);
          if (!buttons.length) return null;

          return (
            buttons.find((button) => button.classList.contains('is-active')) ||
            buttons[0]
          );
        };

        const getScenarioButtonByMode = (card, mode) => {
          if (!mode) return null;

          return (
            Array.from(
              card?.querySelectorAll('.scenario-chip[data-scenario-mode]') || [],
            ).find((button) => button.dataset.scenarioMode === mode) || null
          );
        };

        const activateScenarioButtonByOffset = (card, offset) => {
          const buttons = getScenarioButtons(card);
          if (!buttons.length) return false;

          const activeButton = getScenarioActiveButton(card);
          const activeIndex = Math.max(0, buttons.indexOf(activeButton));
          const nextIndex =
            (activeIndex + offset + buttons.length) % buttons.length;
          const nextButton = buttons[nextIndex];
          if (!nextButton) return false;

          nextButton.click();
          return true;
        };

        const releaseScenarioVideo = (video) => {
          if (!video) return;

          try {
            video.pause();
          } catch (error) {
            // Media state can be unavailable while the browser changes sources.
          }

          if (typeof this.releaseVideoSource === 'function') {
            this.releaseVideoSource(video);
          } else {
            video.removeAttribute('src');
            try {
              video.load();
            } catch (error) {
              // Detached videos can reject load() in some browsers.
            }
          }
        };

        const clearScenarioVideoAdvanceTimer = (state) => {
          if (!state) return;

          window.clearTimeout(state.advanceTimer);
          state.advanceTimer = null;
        };

        const disposeScenarioVideoLayer = (video, endedHandler = null) => {
          if (!video) return;

          if (endedHandler) {
            video.removeEventListener('ended', endedHandler);
          }

          const cleanup = scenarioVideoLayerCleanup.get(video);
          if (cleanup) {
            video.removeEventListener('transitionend', cleanup.transitionHandler);
            window.clearTimeout(cleanup.timeoutId);
            scenarioVideoLayerCleanup.delete(video);
          }

          releaseScenarioVideo(video);
          video.remove();
        };

        const fadeOutScenarioVideoLayer = (video, endedHandler = null) => {
          if (!video) return;

          if (endedHandler) {
            video.removeEventListener('ended', endedHandler);
          }

          if (!video.isConnected) {
            disposeScenarioVideoLayer(video);
            return;
          }

          const existingCleanup = scenarioVideoLayerCleanup.get(video);
          if (existingCleanup) return;

          const removeVideo = () => disposeScenarioVideoLayer(video);
          const transitionHandler = (event) => {
            if (event.target !== video || event.propertyName !== 'opacity') return;
            removeVideo();
          };
          const timeoutId = window.setTimeout(
            removeVideo,
            scenarioCardVideoFadeMs + 220,
          );

          scenarioVideoLayerCleanup.set(video, {
            timeoutId,
            transitionHandler,
          });
          video.addEventListener('transitionend', transitionHandler);
          video.classList.remove('is-active');
          video.classList.add('is-exiting');
        };

        const showScenarioVideoLayer = (video) => {
          const makeActive = () => {
            if (!video.isConnected) return;
            video.classList.add('is-active');
          };

          if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(makeActive);
          } else {
            window.setTimeout(makeActive, 0);
          }
        };

        const clearScenarioCardVideo = (card) => {
          if (!card) return;

          const state = scenarioCardVideoState.get(card);
          clearScenarioVideoAdvanceTimer(state);

          const videos = new Set(
            card.querySelectorAll('.scenario-card-video'),
          );
          if (state?.video) videos.add(state.video);

          videos.forEach((video) => {
            disposeScenarioVideoLayer(
              video,
              video === state?.video ? state.endedHandler : null,
            );
          });

          scenarioCardVideoState.delete(card);
        };

        const startScenarioCardVideoScene = (
          card,
          button,
          resolvedScenes,
          sceneIndex,
          sceneKey,
        ) => {
          const visual = card.querySelector('.scenario-card-visual');
          if (!visual) return;

          const previousState = scenarioCardVideoState.get(card);
          const video = document.createElement('video');
          const state = {
            video,
            endedHandler: null,
            advanceTimer: null,
            sceneIndex,
            sceneKey,
          };

          video.className = 'scenario-card-video';
          video.autoplay = true;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.preload = 'auto';
          video.setAttribute('autoplay', '');
          video.setAttribute('muted', '');
          video.setAttribute('playsinline', '');
          video.setAttribute('preload', 'auto');
          video.setAttribute('loop', '');
          video.src = resolvedScenes[sceneIndex];

          const scheduleNextScene = () => {
            if (resolvedScenes.length < 2 && !button.dataset.scenarioNextMode) return;

            clearScenarioVideoAdvanceTimer(state);

            state.advanceTimer = window.setTimeout(() => {
              const currentState = scenarioCardVideoState.get(card);
              if (currentState !== state || currentState.video !== video) return;
              if (!slide?.classList.contains('visible')) return;
              if (!button.classList.contains('is-active')) return;

              clearScenarioVideoAdvanceTimer(state);

              if (state.sceneIndex < resolvedScenes.length - 1) {
                startScenarioCardVideoScene(
                  card,
                  button,
                  resolvedScenes,
                  state.sceneIndex + 1,
                  sceneKey,
                );
                return;
              }

              const nextButton = getScenarioButtonByMode(
                card,
                button.dataset.scenarioNextMode,
              );
              if (nextButton && nextButton !== button) {
                nextButton.click();
                return;
              }

              if (resolvedScenes.length < 2) return;

              startScenarioCardVideoScene(card, button, resolvedScenes, 0, sceneKey);
            }, scenarioYogaVideoHoldMs);
          };

          visual.appendChild(video);
          scenarioCardVideoState.set(card, state);

          Array.from(visual.querySelectorAll('.scenario-card-video'))
            .filter(
              (layer) => layer !== video && layer !== previousState?.video,
            )
            .forEach((layer) => disposeScenarioVideoLayer(layer));

          if (previousState?.video && previousState.video !== video) {
            clearScenarioVideoAdvanceTimer(previousState);
            fadeOutScenarioVideoLayer(
              previousState.video,
              previousState.endedHandler,
            );
          }

          showScenarioVideoLayer(video);

          const playPromise = video.play();
          playPromise?.catch?.(() => {});
          scheduleNextScene();
        };

        const fadeOutScenarioCardVideo = (card) => {
          const state = scenarioCardVideoState.get(card);
          if (!state?.video) return;

          scenarioCardVideoState.delete(card);
          clearScenarioVideoAdvanceTimer(state);
          fadeOutScenarioVideoLayer(state.video, state.endedHandler);
        };

        const canRunScenarioCardVideo = (card) => {
          if (card?.dataset.scenarioCard === 'yoga') return true;
          if (card?.dataset.scenarioCard !== 'event') return false;
          if (!slide?.classList.contains(secondPositionClass)) return false;

          return window.matchMedia?.('(min-width: 861px)')?.matches ?? false;
        };

        const setScenarioCardVideo = (card, button, { restart = false } = {}) => {
          if (!canRunScenarioCardVideo(card)) {
            clearScenarioCardVideo(card);
            return;
          }

          if (document.body.classList.contains('scenario-modal-open')) {
            clearScenarioCardVideo(card);
            return;
          }

          const visual = card.querySelector('.scenario-card-visual');
          if (!visual || !slide?.classList.contains('visible')) {
            clearScenarioCardVideo(card);
            return;
          }

          const scenes = getScenarioVideoScenes(button);
          const sceneKey = scenes.join('|');
          if (!scenes.length) {
            fadeOutScenarioCardVideo(card);
            return;
          }

          const currentState = scenarioCardVideoState.get(card);
          if (
            !restart &&
            currentState?.sceneKey === sceneKey &&
            currentState.video?.isConnected &&
            currentState.video.getAttribute('src')
          ) {
            const playPromise = currentState.video.play();
            playPromise?.catch?.(() => {});
            return;
          }

          const resolvedScenes = scenes.map(
            (scene) => this.resolveAsset?.(scene) || scene,
          );
          startScenarioCardVideoScene(card, button, resolvedScenes, 0, sceneKey);
        };

        const setupScenarioYogaNavigation = (card) => {
          card
            ?.querySelectorAll('[data-scenario-nav]')
            .forEach((button) => {
              button.addEventListener('click', (event) => {
                event.preventDefault();
                const offset =
                  button.dataset.scenarioNav === 'prev' ? -1 : 1;
                activateScenarioButtonByOffset(card, offset);
              });
            });
        };

        const setupScenarioCardSwipe = (
          card,
          { desktopOnly = false, visualOnly = false } = {},
        ) => {
          if (!card || !window.PointerEvent) return;

          let pointerId = null;
          let startX = 0;
          let startY = 0;
          let latestX = 0;
          let latestY = 0;
          let hasMoved = false;
          let hasRenderedDrag = false;
          let dragResetTimer = null;
          const dragDesktopQuery = window.matchMedia('(min-width: 861px)');
          const dragReducedMotionQuery = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
          );

          const canStartScenarioSwipe = () =>
            !desktopOnly || dragDesktopQuery.matches;

          const canRenderScenarioDrag = () =>
            dragDesktopQuery.matches && !dragReducedMotionQuery.matches;

          const getScenarioDragWidth = () =>
            Math.max(
              1,
              card.querySelector('.scenario-card-visual')?.clientWidth ||
                card.clientWidth ||
                1,
            );

          const clampScenarioDragOffset = (deltaX) => {
            const width = getScenarioDragWidth();
            return Math.max(-width * 0.92, Math.min(width * 0.92, deltaX));
          };

          const setScenarioDragOffset = (offset, instant = false) => {
            if (!canRenderScenarioDrag()) return;

            card.classList.toggle('is-scenario-drag-instant', instant);
            card.style.setProperty('--scenario-drag-offset', `${offset}px`);

            if (instant) {
              void card.offsetWidth;
              card.classList.remove('is-scenario-drag-instant');
            }
          };

          const clearScenarioDragResetTimer = () => {
            if (!dragResetTimer) return;

            window.clearTimeout(dragResetTimer);
            dragResetTimer = null;
          };

          const resetSwipe = ({ settle = false } = {}) => {
            pointerId = null;
            hasMoved = false;
            card.classList.remove('is-scenario-swiping');

            if (!hasRenderedDrag) return;

            clearScenarioDragResetTimer();

            if (!canRenderScenarioDrag() || !settle) {
              card.classList.remove('is-scenario-settling');
              card.style.removeProperty('--scenario-drag-offset');
              hasRenderedDrag = false;
              return;
            }

            card.classList.add('is-scenario-settling');
            setScenarioDragOffset(0);
            dragResetTimer = window.setTimeout(() => {
              card.classList.remove('is-scenario-settling');
              card.style.removeProperty('--scenario-drag-offset');
              hasRenderedDrag = false;
              dragResetTimer = null;
            }, 430);
          };

          const renderScenarioDrag = (deltaX) => {
            if (!canRenderScenarioDrag()) return;

            hasRenderedDrag = true;
            setScenarioDragOffset(clampScenarioDragOffset(deltaX));
          };

          card.addEventListener('pointerdown', (event) => {
            if (
              event.button > 0 ||
              !canStartScenarioSwipe() ||
              (visualOnly &&
                !event.target?.closest?.('.scenario-card-visual')) ||
              event.target?.closest?.(
                '.scenario-chip, .scenario-expand-button, .scenario-nav-button, [data-scenario-expand], [data-scenario-nav]',
              )
            ) {
              return;
            }

            pointerId = event.pointerId;
            startX = latestX = event.clientX;
            startY = latestY = event.clientY;
            hasMoved = false;
            hasRenderedDrag = false;
            clearScenarioDragResetTimer();
            card.classList.remove('is-scenario-settling');
            setScenarioDragOffset(0, true);
            card.classList.add('is-scenario-swiping');

            try {
              card.setPointerCapture(pointerId);
            } catch (error) {
              // Pointer capture can fail if the browser has already canceled input.
            }
          });

          card.addEventListener('pointermove', (event) => {
            if (event.pointerId !== pointerId) return;

            latestX = event.clientX;
            latestY = event.clientY;

            const deltaX = latestX - startX;
            const deltaY = latestY - startY;
            hasMoved =
              hasMoved || Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6;

            if (Math.abs(deltaX) > Math.abs(deltaY)) {
              event.preventDefault();
              renderScenarioDrag(deltaX);
            }
          });

          card.addEventListener('pointerup', (event) => {
            if (event.pointerId !== pointerId) return;

            const deltaX = latestX - startX;
            const deltaY = latestY - startY;
            const threshold = Math.min(
              88,
              Math.max(38, card.clientWidth * 0.1),
            );
            const isHorizontalSwipe =
              hasMoved &&
              Math.abs(deltaX) >= threshold &&
              Math.abs(deltaX) > Math.abs(deltaY) * 1.15;

            if (!hasRenderedDrag) {
              resetSwipe();
              if (!isHorizontalSwipe) return;

              activateScenarioButtonByOffset(card, deltaX < 0 ? 1 : -1);
              return;
            }

            if (isHorizontalSwipe) {
              activateScenarioButtonByOffset(card, deltaX < 0 ? 1 : -1);
            }

            resetSwipe({ settle: true });
          });

          const cancelSwipe = () => {
            if (pointerId !== null) {
              resetSwipe();
            }
          };

          card.addEventListener('pointercancel', cancelSwipe);
          card.addEventListener('lostpointercapture', cancelSwipe);
        };

        const syncScenarioCardVideo = (card, options) => {
          setScenarioCardVideo(
            card,
            getScenarioActiveButton(card),
            options,
          );
        };

        const startScenarioEventVideo = ({ restart = true } = {}) => {
          if (!slide?.classList.contains(secondPositionClass)) return;

          syncScenarioCardVideo(slide.querySelector('.scenario-card-event'), {
            restart,
          });
        };

        const clearScenarioYogaVideoStartTimer = () => {
          if (!scenarioYogaVideoStartTimer) return;

          window.clearTimeout(scenarioYogaVideoStartTimer);
          scenarioYogaVideoStartTimer = null;
        };

        const getScenarioYogaVideoStartDelay = () => {
          const canDelay =
            window.matchMedia?.('(min-width: 861px)')?.matches &&
            !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

          return canDelay ? scenarioYogaInitialStartDelayMs : 0;
        };

        const startScenarioYogaVideos = ({ delay = 0, restart = true } = {}) => {
          clearScenarioYogaVideoStartTimer();

          const run = () => {
            scenarioYogaVideoStartTimer = null;
            if (!slide?.classList.contains('visible')) return;
            if (document.body.classList.contains('scenario-modal-open')) return;

            if (slide.classList.contains(secondPositionClass)) {
              clearScenarioCardVideo(slide.querySelector('.scenario-card-yoga'));
              startScenarioEventVideo({ restart });
              return;
            }

            slide
              .querySelectorAll('.scenario-card-yoga')
              .forEach((card) => syncScenarioCardVideo(card, { restart }));
          };

          if (delay > 0) {
            scenarioYogaVideoStartTimer = window.setTimeout(run, delay);
            return;
          }

          run();
        };

        const clearSecondPositionTimer = () => {
          if (scenarioSecondPositionTimer) {
            window.clearTimeout(scenarioSecondPositionTimer);
            scenarioSecondPositionTimer = null;
          }
        };

        const cancelSecondPositionAnimation = () => {
          if (!scenarioSecondPositionAnimation) return;
          scenarioSecondPositionAnimation.cancel();
          scenarioSecondPositionAnimation = null;
        };

        const resetSecondPosition = () => {
          clearSecondPositionTimer();
          cancelSecondPositionAnimation();
          slide?.classList.remove(secondPositionClass);
        };

        const resetScenarioDragState = (card) => {
          card?.classList.remove(
            'is-scenario-swiping',
            'is-scenario-settling',
            'is-scenario-drag-instant',
          );
          card?.style.removeProperty('--scenario-drag-offset');
        };

        const resetScenarioCardState = (card) => {
          const buttons = getScenarioButtons(card);
          const defaultButton =
            card?.dataset.scenarioCard === 'yoga'
              ? getScenarioButtonByMode(card, yogaDefaultMode) || buttons[0]
              : buttons[0];

          resetScenarioDragState(card);

          if (!defaultButton) return;

          const image = defaultButton.dataset.scenarioImage;
          if (image) {
            card.style.setProperty(
              '--scenario-image',
              `url("${this.resolveAsset?.(image) || image}")`,
            );
          }

          buttons.forEach((button) => {
            button.classList.toggle('is-active', button === defaultButton);
          });
        };

        const resetScenarioModalState = () => {
          this.closeScenarioModal?.(true);
          this.clearScenarioModalVideo?.();
          this.scenarioModal?.classList.remove('is-closing');
          this.scenarioModalModes
            ?.querySelectorAll('.scenario-chip.is-active')
            .forEach((button) => button.classList.remove('is-active'));
          document.body.classList.remove('scenario-modal-open');
        };

        const restartScenarioCardRevealAnimations = () => {
          if (!slide?.classList.contains('visible')) return;

          const cards = Array.from(
            slide.querySelectorAll('.scenario-card.reveal'),
          );
          if (!cards.length) return;

          cards.forEach((card) => {
            card.style.animation = 'none';
            card.style.removeProperty('clip-path');
            card.style.removeProperty('opacity');
            card.style.removeProperty('transform');
          });

          void slide.offsetWidth;

          cards.forEach((card) => {
            card.style.removeProperty('animation');
          });
        };

        const resetScenarioSlideState = ({ restartVideos = false } = {}) => {
          clearScenarioYogaVideoStartTimer();
          resetSecondPosition();
          resetScenarioModalState();

          slide
            ?.querySelectorAll('.scenario-card[data-scenario-card]')
            .forEach((card) => {
              clearScenarioCardVideo(card);
              resetScenarioCardState(card);
            });

          if (!restartVideos) return;

          restartScenarioCardRevealAnimations();
          startScenarioYogaVideos({
            delay: getScenarioYogaVideoStartDelay(),
            restart: true,
          });
        };

        const cleanupScenarioSlide = () => {
          clearScenarioYogaVideoStartTimer();
          resetSecondPosition();
          resetScenarioModalState();
          slide
            ?.querySelectorAll('.scenario-card[data-scenario-card]')
            .forEach((card) => {
              resetScenarioDragState(card);
              clearScenarioCardVideo(card);
            });
        };

        const handleScenarioModalOpen = (event) => {
          const sourceCard = event.detail?.card;
          if (!slide?.contains(sourceCard)) return;

          clearScenarioYogaVideoStartTimer();
          slide
            .querySelectorAll('.scenario-card[data-scenario-card]')
            .forEach((card) => clearScenarioCardVideo(card));
        };

        const handleScenarioModalClose = (event) => {
          const sourceCard = event.detail?.card;
          if (!slide?.contains(sourceCard)) return;
          if (!slide.classList.contains('visible')) return;
          if (document.body.classList.contains('scenario-modal-open')) return;

          startScenarioYogaVideos({ restart: true });
        };

        const canRunScenarioFlip = (card) =>
          window.matchMedia?.('(min-width: 861px)')?.matches &&
          !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches &&
          typeof card?.animate === 'function';

        const settleScenarioFlipCard = (card) => {
          if (!card) return;
          card.style.animation = 'none';
          card.style.clipPath = 'inset(0 0 0 0)';
          card.style.opacity = '1';
          card.style.transform = 'none';
        };

        const animateScenarioCardFlip = (card, firstRect, lastRect) => {
          if (!card || !firstRect?.width || !firstRect.height) return;
          if (!lastRect?.width || !lastRect.height) return;

          settleScenarioFlipCard(card);

          const deltaX = firstRect.left - lastRect.left;
          const deltaY = firstRect.top - lastRect.top;
          const scaleX = firstRect.width / lastRect.width;
          const scaleY = firstRect.height / lastRect.height;
          const hasVisibleMotion =
            Math.abs(deltaX) > 0.5 ||
            Math.abs(deltaY) > 0.5 ||
            Math.abs(scaleX - 1) > 0.01 ||
            Math.abs(scaleY - 1) > 0.01;

          if (!hasVisibleMotion) return;

          const animation = card.animate(
            [
              {
                transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
                transformOrigin: '0 0',
                opacity: 1,
              },
              {
                transform: 'translate(0, 0) scale(1, 1)',
                transformOrigin: '0 0',
                opacity: 1,
              },
            ],
            {
              duration: 880,
              easing: 'cubic-bezier(0.2, 0.86, 0.22, 1)',
              fill: 'both',
            },
          );

          scenarioSecondPositionAnimation = animation;
          animation.addEventListener(
            'finish',
            () => {
              if (scenarioSecondPositionAnimation !== animation) return;
              animation.cancel();
              scenarioSecondPositionAnimation = null;
            },
            { once: true },
          );
        };

        const runSecondPositionTransition = () => {
          if (!slide) return;

          cancelSecondPositionAnimation();

          const yogaCard = slide.querySelector('.scenario-card-yoga');
          const canAnimate = canRunScenarioFlip(yogaCard);
          settleScenarioFlipCard(yogaCard);
          const firstRect = canAnimate
            ? yogaCard?.getBoundingClientRect()
            : null;

          slide.classList.add(secondPositionClass);
          startScenarioEventVideo({ restart: true });

          if (!canAnimate || !yogaCard || !firstRect?.width || !firstRect.height) {
            clearScenarioCardVideo(yogaCard);
            return;
          }

          const lastRect = yogaCard.getBoundingClientRect();
          animateScenarioCardFlip(yogaCard, firstRect, lastRect);
          clearScenarioCardVideo(yogaCard);
        };

        const runInitialPositionTransition = () => {
          if (!slide?.classList.contains(secondPositionClass)) return;

          cancelSecondPositionAnimation();

          const yogaCard = slide.querySelector('.scenario-card-yoga');
          const canAnimate = canRunScenarioFlip(yogaCard);
          settleScenarioFlipCard(yogaCard);
          const firstRect = canAnimate
            ? yogaCard?.getBoundingClientRect()
            : null;

          slide.classList.remove(secondPositionClass);

          if (!canAnimate || !yogaCard || !firstRect?.width || !firstRect.height)
            return;

          const lastRect = yogaCard.getBoundingClientRect();
          animateScenarioCardFlip(yogaCard, firstRect, lastRect);
        };

        document
          .querySelectorAll('.scenario-card[data-scenario-card]')
          .forEach((card) => {
            const buttons = getScenarioButtons(card);
            if (!buttons.length) return;
    
            buttons.forEach((button) => {
              button.addEventListener('click', () => {
                const image = button.dataset.scenarioImage;
                if (!image) return;
    
                card.style.setProperty(
                  '--scenario-image',
                  `url("${this.resolveAsset?.(image) || image}")`,
                );
                buttons.forEach((item) =>
                  item.classList.toggle('is-active', item === button),
                );

                if (card.dataset.scenarioCard !== 'yoga') {
                  syncScenarioCardVideo(card, { restart: true });
                  return;
                }

                clearScenarioYogaVideoStartTimer();
                clearSecondPositionTimer();
                const isSecondScenario = image.includes(himalayasImage);

                if (!isSecondScenario) {
                  runInitialPositionTransition();
                } else if (!slide?.classList.contains(secondPositionClass)) {
                  cancelSecondPositionAnimation();
                }

                syncScenarioCardVideo(card, { restart: true });
                if (!isSecondScenario) return;
                if (slide?.classList.contains(secondPositionClass)) return;

                scenarioSecondPositionTimer = window.setTimeout(() => {
                  scenarioSecondPositionTimer = null;
                  if (!slide?.classList.contains('visible')) return;
                  if (!button.classList.contains('is-active')) return;
                  runSecondPositionTransition();
                }, 2000);
              });
            });

            if (card.dataset.scenarioCard === 'yoga') {
              setupScenarioYogaNavigation(card);

              const observer = new MutationObserver(() => {
                if (scenarioYogaVideoStartTimer) return;
                syncScenarioCardVideo(card);
              });
              buttons.forEach((button) => {
                observer.observe(button, {
                  attributes: true,
                  attributeFilter: ['class'],
                });
              });
              scenarioModeObservers.push(observer);
            }

            if (card.hasAttribute('data-scenario-swipe')) {
              setupScenarioCardSwipe(card, {
                desktopOnly: card.dataset.scenarioCard === 'event',
                visualOnly: card.dataset.scenarioCard === 'event',
              });
            }
          });

        if (slide) {
          let wasScenarioSlideVisible = slide.classList.contains('visible');
          const slideObserver = new MutationObserver(() => {
            const isScenarioSlideVisible = slide.classList.contains('visible');

            if (isScenarioSlideVisible && !wasScenarioSlideVisible) {
              resetScenarioSlideState({ restartVideos: true });
              wasScenarioSlideVisible = isScenarioSlideVisible;
              return;
            }

            if (!isScenarioSlideVisible && wasScenarioSlideVisible) {
              cleanupScenarioSlide();
            }

            wasScenarioSlideVisible = isScenarioSlideVisible;
          });

          slideObserver.observe(slide, {
            attributes: true,
            attributeFilter: ['class'],
          });
          scenarioModeObservers.push(slideObserver);

          if (slide.classList.contains('visible')) {
            resetScenarioSlideState({ restartVideos: true });
          }
        }

        window.addEventListener('deck:scenario-modal-open', handleScenarioModalOpen);
        window.addEventListener('deck:scenario-modal-close', handleScenarioModalClose);

        window.addEventListener(
          'beforeunload',
          () => {
            cleanupScenarioSlide();
            window.removeEventListener(
              'deck:scenario-modal-open',
              handleScenarioModalOpen,
            );
            window.removeEventListener(
              'deck:scenario-modal-close',
              handleScenarioModalClose,
            );
            scenarioModeObservers.forEach((observer) => observer.disconnect());
          },
          { once: true },
        );
      }
  });
})();
