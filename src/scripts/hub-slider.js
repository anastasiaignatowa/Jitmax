/* HUB SLIDER */
(function () {
  const { SlidePresentation } = window;
  if (!SlidePresentation) {
    throw new Error('SlidePresentation must be loaded before hub-slider.js');
  }

  const boundHubSliderNodes = new WeakSet();
  const boundHubModalNodes = new WeakSet();
  const boundHubRainRoomVideos = new WeakSet();
  const boundHubSliderDragNodes = new WeakSet();
  const HUB_RAIN_ROOM_RETURN_LEAD_MS = 1200;

  Object.assign(SlidePresentation.prototype, {
      setupHubSlider() {
        const slide = document.getElementById('slide-4');
        this.hubSlide = slide;
        this.hubSlider = slide?.querySelector('.hub-slider') || null;
        this.hubCards = Array.from(slide?.querySelectorAll('.hub-card') || []);
        this.hubDots = Array.from(slide?.querySelectorAll('.hub-dot') || []);
        this.hubPrevButton = slide?.querySelector('.hub-arrow-prev') || null;
        this.hubNextButton = slide?.querySelector('.hub-arrow-next') || null;
        if (!this.hubCards.length) return;

        this.isHubPreviewMode = false;
        this.hubRainRoomState = 'idle';
        this.hubRainRoomRunId = 0;
        this.hubRainRoomReturnMetadataCleanup = null;

        if (this.hubSlider && !boundHubSliderNodes.has(this.hubSlider)) {
          boundHubSliderNodes.add(this.hubSlider);

          this.hubPrevButton?.addEventListener('click', () => {
            this.showHubCard(this.activeHubCard - 1, true);
          });

          this.hubNextButton?.addEventListener('click', () => {
            this.showHubCard(this.activeHubCard + 1, true);
          });

          this.hubDots.forEach((dot, index) => {
            dot.addEventListener('click', () => {
              this.showHubCard(index, true);
            });
            dot.addEventListener('keydown', (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;

              event.preventDefault();
              event.stopPropagation();
              this.showHubCard(index, true);
            });
          });
        }

        this.syncHubDots();
        this.setupHubSliderDrag();
        this.setupHubModal();
        this.setupHubRainRoomFeature();
      },

      setupHubModal() {
        const slide = document.getElementById('slide-4');
        if (!slide || !this.hubCards.length) return;

        this.hubModal = slide.querySelector('.hub-modal');
        if (!this.hubModal) {
          this.hubModal = document.createElement('div');
          this.hubModal.className = 'hub-modal';
          this.hubModal.hidden = true;
          this.hubModal.setAttribute('aria-hidden', 'true');
          this.hubModal.innerHTML = `
            <div class="hub-modal-card" role="dialog" aria-modal="true" aria-label="Раскрытый сценарий">
              <button class="hub-modal-close" type="button" data-hub-modal-close aria-label="Закрыть">×</button>
              <button class="hub-modal-arrow hub-modal-prev" type="button" data-hub-modal-prev aria-label="Предыдущий сценарий"><span aria-hidden="true">‹</span></button>
              <button class="hub-modal-arrow hub-modal-next" type="button" data-hub-modal-next aria-label="Следующий сценарий"><span aria-hidden="true">›</span></button>
              <div class="hub-modal-visual" aria-hidden="true">
                <video class="hub-modal-video" muted playsinline preload="auto"></video>
              </div>
              <div class="hub-modal-footer">
                <p class="hub-modal-meta"></p>
                <h3 class="hub-modal-title"></h3>
                <p class="hub-modal-copy"></p>
                <div class="hub-modal-tags"></div>
              </div>
            </div>
          `;
          slide.appendChild(this.hubModal);
        }

        this.hubModalCard = this.hubModal.querySelector('.hub-modal-card');
        this.hubModalVideo = this.hubModal.querySelector('.hub-modal-video');
        this.hubModalMeta = this.hubModal.querySelector('.hub-modal-meta');
        this.hubModalTitle = this.hubModal.querySelector('.hub-modal-title');
        this.hubModalCopy = this.hubModal.querySelector('.hub-modal-copy');
        this.hubModalTags = this.hubModal.querySelector('.hub-modal-tags');
        this.hubModalClose = this.hubModal.querySelector('[data-hub-modal-close]');
        this.hubModalPrev = this.hubModal.querySelector('[data-hub-modal-prev]');
        this.hubModalNext = this.hubModal.querySelector('[data-hub-modal-next]');
        this.hubModalIndex = 0;

        this.hubCards.forEach((card, index) => {
          const media = card.querySelector('.hub-card-media');
          if (!media || media.querySelector('[data-hub-expand]')) return;

          const button = document.createElement('button');
          button.className = 'hub-expand-button';
          button.type = 'button';
          button.dataset.hubExpand = '';
          button.setAttribute('aria-label', 'Открыть сценарий');
          button.innerHTML = `
            <svg class="hub-expand-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 4H4v4" />
              <path d="M4 4l6.5 6.5" />
              <path d="M16 20h4v-4" />
              <path d="M20 20l-6.5-6.5" />
            </svg>
          `;
          button.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
          });
          button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openHubModal(index);
          });
          media.appendChild(button);
        });

        if (!boundHubModalNodes.has(this.hubModal)) {
          boundHubModalNodes.add(this.hubModal);
          this.hubModalClose?.addEventListener('click', () => {
            this.closeHubModal();
          });
          this.hubModalPrev?.addEventListener('click', () => {
            this.showHubModalCard(this.hubModalIndex - 1);
          });
          this.hubModalNext?.addEventListener('click', () => {
            this.showHubModalCard(this.hubModalIndex + 1);
          });
          this.hubModal.addEventListener('click', (event) => {
            if (event.target === this.hubModal) this.closeHubModal();
          });
          this.hubModal.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              this.showHubModalCard(this.hubModalIndex - 1);
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              this.showHubModalCard(this.hubModalIndex + 1);
            }
          });
        }
      },

      setupHubRainRoomFeature() {
        const slide = document.getElementById('slide-4');
        const video = slide?.querySelector('[data-hub-rain-room]');
        const card = video?.closest('.hub-card');
        const media = video?.closest('.hub-card-media');
        if (!slide || !video || !card || !media) return;

        this.hubRainRoomSlide = slide;
        this.hubRainRoomVideo = video;
        this.hubRainRoomThunderAudioPath = video.dataset.hubRainThunderAudio || '';
        this.hubRainRoomThunderAudio = this.hubRainRoomThunderAudio || null;
        this.hubRainRoomCard = card;
        this.hubRainRoomMedia = media;
        this.hubRainRoomDesktopQuery =
          this.hubRainRoomDesktopQuery ||
          window.matchMedia('(min-width: 861px)');
        this.hubRainRoomReducedMotionQuery =
          this.hubRainRoomReducedMotionQuery ||
          window.matchMedia('(prefers-reduced-motion: reduce)');

        if (boundHubRainRoomVideos.has(video)) return;

        boundHubRainRoomVideos.add(video);

        const startFeatureFromLead = () => {
          if (!this.shouldStartHubRainRoomFeature()) return;
          const firstSceneHold = this.getValueVideoSceneHold?.(video, 0) || 4;
          if ((video.currentTime || 0) < firstSceneHold) return;

          this.startHubRainRoomFeature();
        };

        video.addEventListener('timeupdate', startFeatureFromLead);

        video.addEventListener('ended', (event) => {
          if (!this.shouldStartHubRainRoomFeature()) return;

          event.preventDefault();
          event.stopImmediatePropagation();
          this.startHubRainRoomFeature();
        });

        this.hubRainRoomDesktopQuery.addEventListener?.('change', () => {
          if (!this.isHubRainRoomDesktop()) {
            this.cancelHubRainRoomFeature(true);
          }
        });
      },

      isHubRainRoomDesktop() {
        return Boolean(
          this.hubRainRoomDesktopQuery?.matches &&
            !this.hubRainRoomReducedMotionQuery?.matches,
        );
      },

      shouldStartHubRainRoomFeature() {
        if (this.hubRainRoomState !== 'armed') return false;
        if (!this.isHubRainRoomDesktop()) return false;
        if (this.isPreviewMode?.() || this.isHubPreviewMode) return false;
        if (!this.hubRainRoomSlide?.classList.contains('visible')) return false;
        if (!this.hubRainRoomCard?.classList.contains('is-active')) return false;
        if (Number(this.hubRainRoomVideo?.dataset.sceneIndex || 0) !== 0) {
          return false;
        }

        return (this.getValueVideoScenes?.(this.hubRainRoomVideo) || []).length > 1;
      },

      shouldSkipValueVideoSequence(video) {
        return video === this.hubRainRoomVideo && this.isHubRainRoomDesktop?.();
      },

      advanceHubCardAfterSceneSequence(video, currentIndex, scenes) {
        const card = video?.closest('.hub-card');
        const slide = card?.closest('.hub-slide');
        const activeCard = this.hubCards?.[this.activeHubCard];
        const isDesktop = window.matchMedia('(min-width: 861px)').matches;

        if (!card || !this.hubCards?.length) return false;
        if (card !== activeCard || !card.classList.contains('is-active')) return false;
        if (card.dataset.hubAdvanceAfterScenes !== 'next') return false;
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
            },
          }),
        );
        this.showHubCard(this.activeHubCard + 1, true);
        return true;
      },

      armHubRainRoomFeature() {
        this.cancelHubRainRoomFeature(true);
        if (!this.isHubRainRoomDesktop() || this.isPreviewMode?.()) {
          this.hubRainRoomState = 'idle';
          return;
        }

        this.hubRainRoomState = 'armed';
        this.hubRainRoomRunId += 1;
        this.hubRainRoomSlide?.classList.remove('is-hub-rain-feature-active');
      },

      releaseHubRainRoomLayer() {
        this.clearHubRainRoomReturnTimer();
        this.stopHubRainRoomThunderAudio();

        const video = this.hubRainRoomLayerVideo;
        if (video) {
          video.onended = null;
          video.ontimeupdate = null;
          if (window.deckMedia?.releaseVideoSource) {
            window.deckMedia.releaseVideoSource(video);
          } else {
            try {
              video.pause();
              video.removeAttribute('src');
              video.load();
            } catch (error) {
              // The temporary video can be mid-load during fast slide changes.
            }
          }
        }

        this.hubRainRoomLayer?.remove();
        this.hubRainRoomLayer = null;
        this.hubRainRoomLayerVideo = null;
      },

      clearHubRainRoomReturnTimer() {
        window.clearTimeout(this.hubRainRoomReturnTimer);
        this.hubRainRoomReturnTimer = null;

        const cleanupMetadataListener = this.hubRainRoomReturnMetadataCleanup;
        this.hubRainRoomReturnMetadataCleanup = null;
        cleanupMetadataListener?.();
      },

      teardownHubSlideRuntime(root = this.hubSlide) {
        if (!root || (root !== this.hubSlide && root.id !== 'slide-4')) return;

        window.clearTimeout(this.hubAnimationTimer);
        this.hubAnimationTimer = null;
        window.cancelAnimationFrame(this.hubAnimationFrame);
        this.hubAnimationFrame = null;
        this.hubDragCandidate = null;
        this.hubSlider?.classList.remove('is-dragging', 'is-settling');
        this.releaseHubModalVideo?.();
        this.hubModal?.setAttribute('aria-hidden', 'true');
        if (this.hubModal) this.hubModal.hidden = true;
        document.body.classList.remove('hub-modal-open');
        this.isHubPreviewMode = false;
        this.hubSlider?.classList.remove('is-preview-mode');
        this.cancelHubRainRoomFeature?.(true);
        this.releaseHubRainRoomLayer?.();
        this.stopHubRainRoomThunderAudio?.();
        this.hubRainRoomThunderAudio = null;
        this.hubRainRoomState = 'idle';
        this.hubRainRoomRunId += 1;
        this.hubRainRoomSlide?.classList.remove('is-hub-rain-feature-active');

        this.hubCards?.forEach((card, index) => {
          card.classList.toggle('is-active', index === 0);
          card.classList.remove('is-drag-preview');
          card.style.removeProperty('--hub-inner-offset');
          card.style.removeProperty('transition');
          card.style.removeProperty('opacity');
          card.style.removeProperty('visibility');
        });

        this.activeHubCard = 0;
        this.syncHubDots?.();
        window.dispatchEvent(new CustomEvent('deck:hub-slide-teardown'));
      },

      getHubRainRoomThunderAudio() {
        if (!this.hubRainRoomThunderAudioPath) return null;

        if (!this.hubRainRoomThunderAudio) {
          this.hubRainRoomThunderAudio = new Audio();
          this.hubRainRoomThunderAudio.preload = 'auto';
        }

        return this.hubRainRoomThunderAudio;
      },

      playHubRainRoomThunderAudio(runId) {
        if (runId !== this.hubRainRoomRunId) return;

        const audio = this.getHubRainRoomThunderAudio();
        if (!audio) return;

        const source =
          this.resolveAsset?.(this.hubRainRoomThunderAudioPath) ||
          this.hubRainRoomThunderAudioPath;
        audio.pause();
        audio.src = source;
        audio.currentTime = 0;
        audio.volume = 1;
        audio.play()?.catch?.(() => {});
      },

      stopHubRainRoomThunderAudio() {
        const audio = this.hubRainRoomThunderAudio;
        if (!audio) return;

        audio.pause();
        try {
          audio.currentTime = 0;
        } catch (error) {
          // The audio can still be initializing during fast slide changes.
        }
        audio.removeAttribute('src');
        audio.load();
      },

      cancelHubRainRoomFeature(forceIdle = false) {
        this.hubRainRoomRunId += 1;
        this.stopHubRainRoomThunderAudio();
        this.releaseHubRainRoomLayer();
        this.hubRainRoomSlide?.classList.remove('is-hub-rain-feature-active');

        if (forceIdle) {
          this.hubRainRoomState = 'idle';
          return;
        }

        if (this.hubRainRoomState !== 'spent') {
          this.hubRainRoomState = 'armed';
        }
      },

      getHubRainRoomLayerGeometry() {
        const slideRect = this.hubRainRoomSlide.getBoundingClientRect();
        const mediaRect = this.hubRainRoomMedia.getBoundingClientRect();
        return {
          startLeft: mediaRect.left - slideRect.left,
          startTop: mediaRect.top - slideRect.top,
          startWidth: mediaRect.width,
          startHeight: mediaRect.height,
          endLeft: 0,
          endTop: 0,
          endWidth: slideRect.width,
          endHeight: slideRect.height,
          borderRadius: window.getComputedStyle(this.hubRainRoomMedia).borderRadius,
        };
      },

      setHubRainRoomLayerBox(layer, box, isFull = false) {
        layer.style.left = `${box.left}px`;
        layer.style.top = `${box.top}px`;
        layer.style.width = `${box.width}px`;
        layer.style.height = `${box.height}px`;
        layer.style.borderRadius = isFull ? '0px' : box.borderRadius;
      },

      animateHubRainRoomLayer(toFull = true) {
        if (!this.hubRainRoomLayer || !this.hubRainRoomMedia) {
          return Promise.resolve();
        }

        const geometry = this.getHubRainRoomLayerGeometry();
        const from = toFull
          ? {
              left: geometry.startLeft,
              top: geometry.startTop,
              width: geometry.startWidth,
              height: geometry.startHeight,
              borderRadius: geometry.borderRadius,
            }
          : {
              left: geometry.endLeft,
              top: geometry.endTop,
              width: geometry.endWidth,
              height: geometry.endHeight,
              borderRadius: '0px',
            };
        const to = toFull
          ? {
              left: geometry.endLeft,
              top: geometry.endTop,
              width: geometry.endWidth,
              height: geometry.endHeight,
              borderRadius: '0px',
            }
          : {
              left: geometry.startLeft,
              top: geometry.startTop,
              width: geometry.startWidth,
              height: geometry.startHeight,
              borderRadius: geometry.borderRadius,
            };

        this.setHubRainRoomLayerBox(this.hubRainRoomLayer, from);

        if (this.prefersHubReducedMotion?.()) {
          this.setHubRainRoomLayerBox(this.hubRainRoomLayer, to, toFull);
          return Promise.resolve();
        }

        const animation = this.hubRainRoomLayer.animate(
          [
            {
              left: `${from.left}px`,
              top: `${from.top}px`,
              width: `${from.width}px`,
              height: `${from.height}px`,
              borderRadius: from.borderRadius,
            },
            {
              left: `${to.left}px`,
              top: `${to.top}px`,
              width: `${to.width}px`,
              height: `${to.height}px`,
              borderRadius: to.borderRadius,
            },
          ],
          {
            duration: toFull ? 720 : 680,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          },
        );

        return animation.finished
          .then(() => {
            this.setHubRainRoomLayerBox(this.hubRainRoomLayer, to, toFull);
          })
          .catch(() => {});
      },

      playHubRainRoomLayerScene(sceneIndex, runId) {
        const scenes = this.getValueVideoScenes?.(this.hubRainRoomVideo) || [];
        const scene = scenes[sceneIndex];
        if (!scene || !this.hubRainRoomLayerVideo) return;

        this.clearHubRainRoomReturnTimer();
        const video = this.hubRainRoomLayerVideo;
        video.onended = () => {
          if (runId !== this.hubRainRoomRunId) return;
          if (sceneIndex === 1) {
            this.stopHubRainRoomThunderAudio();
            this.finishHubRainRoomFeature(runId);
            return;
          }
        };
        video.loop = false;
        video.muted = sceneIndex !== 1;
        video.volume = sceneIndex === 1 ? 1 : 0;
        video.playsInline = true;
        if (this.ensureVideoSource) {
          this.ensureVideoSource(video, scene);
        } else {
          video.src = this.resolveAsset?.(scene) || scene;
          video.load();
        }
        video.play()?.catch?.(() => {});
        if (sceneIndex === 1) {
          this.playHubRainRoomThunderAudio(runId);
          this.scheduleHubRainRoomReturn(runId, video);
        } else {
          this.stopHubRainRoomThunderAudio();
        }
      },

      scheduleHubRainRoomReturn(runId, video) {
        this.clearHubRainRoomReturnTimer();

        const schedule = () => {
          if (runId !== this.hubRainRoomRunId || video !== this.hubRainRoomLayerVideo) {
            return;
          }

          const duration = Number.isFinite(video.duration) ? video.duration : 0;
          if (duration <= 0) return;

          const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
          const delay = Math.max(
            0,
            (duration - currentTime) * 1000 - HUB_RAIN_ROOM_RETURN_LEAD_MS,
          );
          this.hubRainRoomReturnTimer = window.setTimeout(() => {
            if (runId !== this.hubRainRoomRunId || video !== this.hubRainRoomLayerVideo) {
              return;
            }

            this.finishHubRainRoomFeature(runId);
          }, delay);
        };

        if (Number.isFinite(video.duration) && video.duration > 0) {
          schedule();
        } else {
          const handleLoadedMetadata = () => {
            this.hubRainRoomReturnMetadataCleanup = null;
            schedule();
          };

          video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
          this.hubRainRoomReturnMetadataCleanup = () => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
          };
        }
      },

      startHubRainRoomFeature() {
        if (!this.shouldStartHubRainRoomFeature()) return;

        const runId = (this.hubRainRoomRunId += 1);
        this.releaseHubRainRoomLayer();
        const layer = document.createElement('div');
        const layerVideo = document.createElement('video');
        layer.className = 'hub-rain-feature-layer';
        layerVideo.className = 'hub-rain-feature-video';
        layerVideo.muted = false;
        layerVideo.volume = 1;
        layerVideo.playsInline = true;
        layerVideo.preload = 'auto';
        layer.append(layerVideo);
        this.hubRainRoomSlide.append(layer);
        this.hubRainRoomLayer = layer;
        this.hubRainRoomLayerVideo = layerVideo;
        this.hubRainRoomState = 'expanded-second';
        this.hubRainRoomSlide.classList.add('is-hub-rain-feature-active');
        this.hubRainRoomVideo.pause();
        void this.animateHubRainRoomLayer(true);
        this.playHubRainRoomLayerScene(1, runId);
      },

      finishHubRainRoomFeature(runId) {
        if (runId !== this.hubRainRoomRunId) return;
        if (this.hubRainRoomState !== 'expanded-second') return;

        this.clearHubRainRoomReturnTimer();
        this.stopHubRainRoomThunderAudio();
        this.hubRainRoomState = 'returning';
        this.animateHubRainRoomLayer(false).then(() => {
          if (runId !== this.hubRainRoomRunId) return;

          this.releaseHubRainRoomLayer();
          this.hubRainRoomState = 'spent';
          this.hubRainRoomSlide?.classList.remove('is-hub-rain-feature-active');

          this.setHubRainRoomFirstLoop();
        });
      },

      setHubRainRoomFirstLoop() {
        const scenes = this.getValueVideoScenes?.(this.hubRainRoomVideo) || [];
        if (!scenes[0] || !this.hubRainRoomCard?.classList.contains('is-active')) {
          return;
        }

        this.hubRainRoomVideo.dataset.sceneIndex = '0';
        this.hubRainRoomVideo.loop = true;
        this.hubRainRoomVideo.muted = true;
        this.ensureVideoSource?.(this.hubRainRoomVideo, scenes[0]);
        try {
          this.hubRainRoomVideo.currentTime = 0;
        } catch (error) {
          // Metadata may still be loading after source reassignment.
        }
        this.hubRainRoomVideo.play()?.catch?.(() => {});
      },

      getHubCardVideoPath(card) {
        const video = card?.querySelector('video');
        const scenes = this.getValueVideoScenes?.(video) || [];
        if (scenes[0]) return scenes[0];

        const source = card?.querySelector('video source');
        return source?.dataset.src || source?.getAttribute('src') || '';
      },

      getHubCardVideoScenes(card) {
        const video = card?.querySelector('video');
        const scenes = this.getValueVideoScenes?.(video) || [];
        if (scenes.length) {
          return video?.hasAttribute('data-hub-rain-room') ? scenes.slice(0, 1) : scenes;
        }

        const videoPath = this.getHubCardVideoPath(card);
        return videoPath ? [videoPath] : [];
      },

      getHubCardImagePath(card) {
        const videoPath = this.getHubCardVideoPath(card).replace(/[?#].*$/, '');
        const imageByVideo = {
          'assets/slide-04-onsen.mp4': 'assets/slide-04-onsen.png',
          'assets/slide-04-yoga.mp4': 'assets/slide-04-yoga.png',
          'assets/slide-04-rain-room.mp4': 'assets/slide-04-rain-room.jpg',
          'assets/slide-04-salt-room.mp4': 'assets/slide-04-salt-room.png',
          'assets/slide-04-thai-massage.mp4': 'assets/slide-04-thai-massage.png',
          'assets/slide-04-splash-park.mp4': 'assets/slide-04-splash-park.jpeg',
          'assets/slide-04-kids-zone.mp4': 'assets/slide-04-kids-zone.png',
          'assets/slide-04-vr.mp4': 'assets/slide-04-vr.png',
          'assets/slide-04-smart-training.mp4': 'assets/slide-04-smart-training.png',
          'assets/slide-04-dragon-festival.mp4': 'assets/slide-04-dragon-festival.png',
          'assets/slide-04-thai-ceremony.mp4': 'assets/slide-04-thai-ceremony.png',
          'assets/slide-04-rooftop-01.mp4': 'assets/slide-04-rooftop.png',
          'assets/Green_Zone.mp4': 'assets/Green_zone.png',
          'assets/slide-04-coworking-01.mp4': 'assets/slide-04-coworking.png',
          'assets/slide-04-social-01-replacement.mp4': 'assets/slide-04-social.png',
        };

        return imageByVideo[videoPath] || 'assets/slide-04-02.png';
      },

      prepareHubPreviewImage(card) {
        const media = card?.querySelector('.hub-card-media');
        if (!media) return;

        const imagePath = this.getHubCardImagePath(card);
        const resolvedImage = this.resolveAsset?.(imagePath) || imagePath;
        media.style.setProperty('--hub-preview-image', `url("${resolvedImage}")`);
      },

      pauseHubCardVideos(card) {
        card?.querySelectorAll('.hub-card-video').forEach((video) => {
          video.pause();
        });
      },

      getRetainedHubCards(activeCard = this.hubCards?.[this.activeHubCard]) {
        const retained = new Set();
        if (!activeCard || this.isHubPreviewMode) return retained;

        retained.add(activeCard);

        return retained;
      },

      setHubPagePreviewMode(isPreview) {
        if (!this.hubCards.length) return;

        this.isHubPreviewMode = isPreview;
        this.hubSlider?.classList.toggle('is-preview-mode', isPreview);

        this.hubCards.forEach((card) => {
          this.prepareHubPreviewImage(card);
          const video = card.querySelector('.hub-card-video');
          if (!video) return;

          if (isPreview) {
            this.releaseSlideMedia?.(card);
            return;
          }

          if (!card.classList.contains('is-active') || this.isPreviewMode?.()) {
            return;
          }

          this.loadHubCardMedia?.(card);
          video.play()?.catch?.(() => {});
        });
      },

      releaseHubModalVideo() {
        if (!this.hubModalVideo) return;

        this.hubModalVideo.pause();
        this.hubModalVideo.removeAttribute('data-scenes');
        this.hubModalVideo.removeAttribute('data-scene-index');
        this.hubModalVideo.loop = false;
        this.hubModalVideo.removeAttribute('loop');

        if (this.releaseVideoSource) {
          this.releaseVideoSource(this.hubModalVideo);
        } else {
          this.hubModalVideo.removeAttribute('src');
          if (!this.isPreviewMode?.()) this.hubModalVideo.load();
        }

        this.hubModalVideo.removeAttribute('data-src');
        delete this.hubModalVideo.dataset.src;
        delete this.hubModalVideo.dataset.sequenceRunId;
      },

      fillHubModal(card) {
        if (!card || !this.hubModalVideo) return;

        const videoScenes = this.getHubCardVideoScenes(card);
        const videoPath = videoScenes[0] || '';

        this.releaseHubModalVideo();
        this.hubModalVideo.loop = videoScenes.length <= 1;
        this.hubModalVideo.toggleAttribute('loop', videoScenes.length <= 1);
        if (videoScenes.length > 1) {
          this.hubModalVideo.dataset.scenes = videoScenes.join('|');
          this.hubModalVideo.dataset.sceneIndex = '0';
        }
        if (videoPath) {
          if (this.ensureVideoSource && !this.isPreviewMode?.()) {
            this.ensureVideoSource(this.hubModalVideo, videoPath);
            this.hubModalVideo.play()?.catch?.(() => {});
          } else {
            this.hubModalVideo.src = this.resolveAsset?.(videoPath) || videoPath;
            if (!this.isPreviewMode?.()) {
              this.hubModalVideo.load();
              this.hubModalVideo.play()?.catch?.(() => {});
            }
          }
        }

        this.hubModalMeta.textContent =
          card.querySelector('.hub-card-meta')?.textContent.trim() || '';
        this.hubModalTitle.textContent =
          card.querySelector('.hub-card-title')?.textContent.trim() || '';
        this.hubModalCopy.textContent =
          card.querySelector('.hub-card-copy')?.textContent.trim() || '';

        this.hubModalTags.innerHTML = '';
        card.querySelectorAll('.hub-tag').forEach((tag) => {
          const modalTag = document.createElement('span');
          modalTag.className = 'hub-tag';
          modalTag.textContent = tag.textContent.trim();
          this.hubModalTags.appendChild(modalTag);
        });
      },

      showHubModalCard(index) {
        if (!this.hubCards.length) return;

        this.hubModalIndex = this.normalizeHubCardIndex(index);
        this.fillHubModal(this.hubCards[this.hubModalIndex]);
        if (this.isHubPreviewMode) {
          this.showHubCard(this.hubModalIndex, true);
        }
      },

      openHubModal(index = this.activeHubCard || 0) {
        if (!this.hubModal || !this.hubModalCard) return;

        window.clearTimeout(this.hubAnimationTimer);
        this.hubAnimationTimer = null;
        this.hubDragCandidate = null;
        this.hubSlider?.classList.remove('is-dragging', 'is-settling');
        this.cancelHubRainRoomFeature?.();
        this.releaseInactiveSlideMedia?.(document.getElementById('slide-4'));
        this.setHubPagePreviewMode(true);
        this.showHubModalCard(index);
        this.hubModal.hidden = false;
        this.hubModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('hub-modal-open');
        this.hubModal.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 240,
          easing: 'ease-out',
        });
        this.hubModalCard.animate(
          [
            { opacity: 0.94, transform: 'translateY(1.2rem) scale(0.985)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          {
            duration: 520,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          },
        );
        this.hubModalClose?.focus();
      },

      closeHubModal() {
        if (!this.hubModal || this.hubModal.hidden) return;

        this.releaseHubModalVideo();
        this.hubModal.hidden = true;
        this.hubModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('hub-modal-open');
        this.setHubPagePreviewMode(false);
      },

      setupHubSliderDrag() {
        if (!this.hubSlider || !window.PointerEvent) return;
        if (boundHubSliderDragNodes.has(this.hubSlider)) return;

        boundHubSliderDragNodes.add(this.hubSlider);
    
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let latestX = 0;
        let latestY = 0;
        let hasMoved = false;
    
        const resetDrag = (settle = true) => {
          const deltaX = latestX - startX;
    
          pointerId = null;
          hasMoved = false;
          this.hubSlider.classList.remove('is-dragging');
          if (settle) {
            this.settleHubDrag(false, deltaX);
          }
        };
    
        this.hubSlider.addEventListener('pointerdown', (event) => {
          if (
            event.button > 0 ||
            event.target?.closest?.('.hub-arrow, .hub-slider-dots, [data-hub-expand]')
          ) {
            return;
          }
    
          window.clearTimeout(this.hubAnimationTimer);
          this.clearHubCardMotion();
          pointerId = event.pointerId;
          startX = latestX = event.clientX;
          startY = latestY = event.clientY;
          hasMoved = false;
          this.hubSlider.classList.add('is-dragging');
    
          try {
            this.hubSlider.setPointerCapture(pointerId);
          } catch (error) {
            // Pointer capture can fail if the browser has already canceled input.
          }
        });
    
        this.hubSlider.addEventListener('pointermove', (event) => {
          if (event.pointerId !== pointerId) return;
    
          latestX = event.clientX;
          latestY = event.clientY;
    
          const deltaX = latestX - startX;
          const deltaY = latestY - startY;
          hasMoved = hasMoved || Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6;
    
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            event.preventDefault();
            this.renderHubDrag(deltaX);
          }
        });
    
        this.hubSlider.addEventListener('pointerup', (event) => {
          if (event.pointerId !== pointerId) return;
    
          const deltaX = latestX - startX;
          const deltaY = latestY - startY;
          const threshold = Math.min(
            92,
            Math.max(42, this.hubSlider.clientWidth * 0.1),
          );
          const isHorizontalSwipe =
            hasMoved &&
            Math.abs(deltaX) >= threshold &&
            Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
    
          resetDrag(false);
          this.settleHubDrag(isHorizontalSwipe, deltaX);
        });
    
        this.hubSlider.addEventListener('pointercancel', () => resetDrag());
        this.hubSlider.addEventListener('lostpointercapture', () => {
          if (pointerId !== null) {
            resetDrag();
          }
        });
      },

      normalizeHubCardIndex(index) {
        return (index + this.hubCards.length) % this.hubCards.length;
      },

      getHubCardTransitionDirection(index, nextIndex) {
        const count = this.hubCards.length;
        const targetIndex = this.normalizeHubCardIndex(nextIndex ?? index);
        if (!count || targetIndex === this.activeHubCard) return 0;
    
        if (index === this.activeHubCard + 1) return 1;
        if (index === this.activeHubCard - 1) return -1;
    
        const forwardDistance =
          (targetIndex - this.activeHubCard + count) % count;
        const backwardDistance =
          (this.activeHubCard - targetIndex + count) % count;
    
        if (forwardDistance === backwardDistance) {
          return index > this.activeHubCard ? 1 : -1;
        }
    
        return forwardDistance < backwardDistance ? 1 : -1;
      },

      getHubSliderWidth() {
        return Math.max(1, this.hubSlider?.clientWidth || 1);
      },

      prefersHubReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      },

      dispatchHubCardTransitionStart(fromIndex, toIndex, direction = 0) {
        window.dispatchEvent(
          new CustomEvent('deck:hub-card-transition-start', {
            detail: { fromIndex, toIndex, direction },
          }),
        );
      },

      dispatchHubCardVideoOpen(cardIndex, card) {
        const detail = { cardIndex };
        const video = card?.querySelector?.('.hub-card-video');
        const dispatch = () => {
          window.dispatchEvent(
            new CustomEvent('deck:hub-card-video-open', { detail }),
          );
        };

        if (!video || this.isPreviewMode?.() || video.readyState >= 2) {
          dispatch();
          return;
        }

        let fallbackTimer = null;
        const events = ['loadeddata', 'canplay', 'playing'];
        const cleanup = () => {
          window.clearTimeout(fallbackTimer);
          events.forEach((eventName) => {
            video.removeEventListener(eventName, done);
          });
        };
        const done = () => {
          cleanup();
          dispatch();
        };

        events.forEach((eventName) => {
          video.addEventListener(eventName, done, { once: true });
        });
        fallbackTimer = window.setTimeout(done, 520);
      },

      setHubCardInnerOffset(card, offset = 0, instant = false) {
        if (!card) return;

        card.classList.toggle('is-motion-instant', instant);
        card.style.setProperty('--hub-inner-offset', `${offset}px`);

        if (instant) {
          void card.offsetWidth;
          card.classList.remove('is-motion-instant');
        }
      },

      resetHubCardMotionStyles(card, instant = false) {
        if (!card) return;

        if (instant) {
          card.classList.add('is-motion-instant');
        }

        card.style.removeProperty('opacity');
        card.style.removeProperty('visibility');
        card.style.removeProperty('--hub-inner-offset');

        if (instant) {
          void card.offsetWidth;
          card.classList.remove('is-motion-instant');
        }
      },

      hideHubCardImmediately(card, { releaseMedia = true } = {}) {
        if (!card) return;

        if (releaseMedia && this.hasLoadedMedia?.(card)) {
          this.releaseSlideMedia?.(card);
        }
        card.style.transition = 'none';
        card.style.opacity = '0';
        card.style.visibility = 'hidden';
        card.classList.remove('is-active', 'is-drag-preview');
        card.style.removeProperty('--hub-inner-offset');
        void card.offsetWidth;
        card.style.removeProperty('transition');
        card.style.removeProperty('opacity');
        card.style.removeProperty('visibility');
      },

      clearHubCardMotion() {
        this.hubDragCandidate = null;
        this.hubSlider?.classList.remove('is-settling');
        const retainedCards = this.getRetainedHubCards();
        this.hubCards.forEach((card, index) => {
          const isActive = index === this.activeHubCard;
    
          if (!isActive) {
            const isAlreadyIdle =
              !card.classList.contains('is-active') &&
              !card.classList.contains('is-drag-preview') &&
              !this.hasLoadedMedia?.(card) &&
              !card.style.transition &&
              !card.style.opacity &&
              !card.style.visibility &&
              !card.style.getPropertyValue('--hub-inner-offset');
            if (isAlreadyIdle) return;

            this.hideHubCardImmediately(card, {
              releaseMedia: !retainedCards.has(card),
            });
            return;
          }
    
          card.classList.add('is-active');
          card.classList.remove('is-drag-preview');
          this.resetHubCardMotionStyles(card, true);
        });
        this.dispatchHubCardVideoOpen?.(
          this.activeHubCard,
          this.hubCards[this.activeHubCard],
        );
      },

      syncHubDots() {
        this.hubDots.forEach((dot, index) => {
          const isActive = index === this.activeHubCard;
          dot.classList.toggle('is-active', isActive);
          if (isActive) {
            dot.setAttribute('aria-current', 'true');
          } else {
            dot.removeAttribute('aria-current');
          }
        });
      },

      setHubActiveCard(index) {
        const nextIndex = this.normalizeHubCardIndex(index);
        const previousCard = this.hubCards[this.activeHubCard];
        const nextCard = this.hubCards[nextIndex];
        if (
          this.hubRainRoomCard &&
          previousCard === this.hubRainRoomCard &&
          nextCard !== this.hubRainRoomCard
        ) {
          this.cancelHubRainRoomFeature?.();
        }
        this.activeHubCard = nextIndex;
        this.syncHubDots();
        this.clearHubCardMotion();
        if (this.isHubPreviewMode) {
          this.prepareHubPreviewImage(nextCard);
          this.releaseSlideMedia?.(nextCard);
          return;
        }

        this.releaseInactiveHubMedia?.(new Set([nextCard]));
        this.loadHubCardMedia?.(nextCard);
        this.dispatchHubCardVideoOpen?.(nextIndex, nextCard);
        if (
          nextCard === this.hubRainRoomCard &&
          this.hubRainRoomState === 'spent'
        ) {
          this.setHubRainRoomFirstLoop?.();
        }
      },

      renderHubDrag(deltaX) {
        if (!this.hubCards.length || !this.hubSlider) return;
    
        const width = this.getHubSliderWidth();
        const offset = Math.max(
          -width * 0.92,
          Math.min(width * 0.92, deltaX),
        );
        const direction = offset < 0 ? 1 : -1;
        const candidateIndex = this.normalizeHubCardIndex(
          this.activeHubCard + direction,
        );
        const activeCard = this.hubCards[this.activeHubCard];
        const candidateCard = this.hubCards[candidateIndex];

        if (this.hubDragCandidate !== candidateIndex) {
          const previousCandidate = this.hubCards[this.hubDragCandidate];
          previousCandidate?.classList.remove('is-drag-preview');
          previousCandidate?.style.removeProperty('--hub-inner-offset');
          this.hubDragCandidate = candidateIndex;
          candidateCard.classList.add('is-drag-preview');
          if (this.isHubPreviewMode) {
            this.prepareHubPreviewImage(candidateCard);
            this.pauseHubCardVideos(candidateCard);
          } else {
            this.loadHubCardMedia?.(candidateCard, { play: false });
          }
          this.dispatchHubCardTransitionStart?.(
            this.activeHubCard,
            candidateIndex,
            direction,
          );
          if (direction > 0) {
            this.dispatchHubCardVideoOpen?.(candidateIndex, candidateCard);
          }
        }

        this.setHubCardInnerOffset(activeCard, offset);
        this.setHubCardInnerOffset(candidateCard, direction * width + offset);
      },

      settleHubDrag(shouldChangeCard, deltaX) {
        if (!this.hubCards.length || !this.hubSlider) return;
    
        const width = this.getHubSliderWidth();
        const offset = Math.max(
          -width * 0.92,
          Math.min(width * 0.92, deltaX),
        );
        const direction = offset < 0 ? 1 : -1;
        const candidateIndex =
          this.hubDragCandidate ??
          this.normalizeHubCardIndex(this.activeHubCard + direction);
    
        if (!shouldChangeCard && this.hubDragCandidate === null) {
          this.clearHubCardMotion();
          return;
        }
    
        if (shouldChangeCard) {
          this.animateHubCardTransition(candidateIndex, direction, offset);
          return;
        }

        if (this.prefersHubReducedMotion()) {
          this.clearHubCardMotion();
          return;
        }
    
        const activeCard = this.hubCards[this.activeHubCard];
        const candidateCard = this.hubCards[candidateIndex];
        this.hubSlider.classList.add('is-settling');
        candidateCard?.classList.add('is-drag-preview');

        this.hubAnimationFrame = window.requestAnimationFrame(() => {
          this.setHubCardInnerOffset(activeCard, 0);
          if (candidateCard) {
            this.setHubCardInnerOffset(candidateCard, direction * width);
          }
        });
    
        window.clearTimeout(this.hubAnimationTimer);
        this.hubAnimationTimer = window.setTimeout(() => {
          this.clearHubCardMotion();
        }, 430);
      },

      animateHubCardTransition(index, direction, startOffset = 0) {
        if (!this.hubCards.length || !this.hubSlider) return;
    
        const nextIndex = this.normalizeHubCardIndex(index);
        if (nextIndex === this.activeHubCard) return;
    
        const width = this.getHubSliderWidth();
        const offset = Math.max(
          -width * 0.92,
          Math.min(width * 0.92, startOffset),
        );
        const activeCard = this.hubCards[this.activeHubCard];
        const nextCard = this.hubCards[nextIndex];
        const fromIndex = this.activeHubCard;
        this.dispatchHubCardTransitionStart?.(fromIndex, nextIndex, direction);
        nextCard.classList.add('is-drag-preview');
        if (this.isHubPreviewMode) {
          this.prepareHubPreviewImage(nextCard);
          this.pauseHubCardVideos(nextCard);
        } else {
          this.loadHubCardMedia?.(nextCard, { play: false });
          if (direction > 0) {
            this.dispatchHubCardVideoOpen?.(nextIndex, nextCard);
          }
        }

        if (this.prefersHubReducedMotion()) {
          this.setHubActiveCard(nextIndex);
          return;
        }

        this.hubSlider.classList.add('is-settling');
        this.setHubCardInnerOffset(activeCard, offset, true);
        this.setHubCardInnerOffset(nextCard, direction * width + offset, true);
        void nextCard.offsetWidth;

        this.hubAnimationFrame = window.requestAnimationFrame(() => {
          this.setHubCardInnerOffset(activeCard, -direction * width);
          this.setHubCardInnerOffset(nextCard, 0);
        });
    
        window.clearTimeout(this.hubAnimationTimer);
        this.hubAnimationTimer = window.setTimeout(() => {
          this.setHubActiveCard(nextIndex);
        }, 430);
      },

      showHubCard(index, animate = false) {
        if (!this.hubCards.length) return;
    
        const nextIndex = this.normalizeHubCardIndex(index);
        if (nextIndex === this.activeHubCard) return;
    
        if (animate) {
          const direction = this.getHubCardTransitionDirection(
            index,
            nextIndex,
          );
          this.animateHubCardTransition(nextIndex, direction);
          return;
        }
    
        this.setHubActiveCard(nextIndex);
      },

      resetHubSlider(slide) {
        if (!slide?.querySelector('.hub-slider') || !this.hubCards.length) {
          if (this.hubRainRoomActiveSlide === this.hubSlide) {
            this.releaseSlideMedia?.(this.hubSlide);
          } else {
            this.teardownHubSlideRuntime?.(this.hubSlide);
          }
          this.hubRainRoomActiveSlide = null;
          return;
        }
    
        const isNewSlideEntry = this.hubRainRoomActiveSlide !== slide;
        this.hubRainRoomActiveSlide = slide;
        if (isNewSlideEntry) {
          this.cancelHubRainRoomFeature?.(true);
        }
        this.setHubActiveCard(0);
        if (isNewSlideEntry) {
          this.armHubRainRoomFeature?.();
        }
      }
  });
})();
