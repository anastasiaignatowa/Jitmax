/* SCENARIO MODAL */
(function () {
  const { SlidePresentation } = window;
  if (!SlidePresentation) {
    throw new Error('SlidePresentation must be loaded before scenario-modal.js');
  }

  const initializedScenarioModals = new WeakSet();

  Object.assign(SlidePresentation.prototype, {
      setupScenarioModal() {
        this.scenarioModal = document.querySelector('.scenario-modal');
        if (!this.scenarioModal) return;
    
        this.scenarioModalCard = this.scenarioModal.querySelector(
          '.scenario-modal-card',
        );
        this.scenarioModalVisual = this.scenarioModal.querySelector(
          '.scenario-modal-visual',
        );
        this.scenarioModalMeta = this.scenarioModal.querySelector(
          '.scenario-modal-meta',
        );
        this.scenarioModalTitle = this.scenarioModal.querySelector(
          '.scenario-modal-title',
        );
        this.scenarioModalText = this.scenarioModal.querySelector(
          '.scenario-modal-text',
        );
        this.scenarioModalModes = this.scenarioModal.querySelector(
          '.scenario-modal-modes',
        );
        this.scenarioModalClose = this.scenarioModal.querySelector(
          '[data-scenario-close]',
        );
        this.scenarioModalSourceCard = null;
        this.scenarioModalSourceButton = null;
        this.scenarioModalCloseTimer = null;
        this.scenarioModalVideo = null;
        this.scenarioModalVideoStartTimer = null;
        this.scenarioModalVideoSceneHandler = null;

        if (initializedScenarioModals.has(this.scenarioModal)) return;
        initializedScenarioModals.add(this.scenarioModal);
    
        this.scenarioModalClose?.addEventListener('click', () => {
          this.closeScenarioModal();
        });
    
        this.scenarioModal.addEventListener('click', (event) => {
          if (event.target === this.scenarioModal) {
            this.closeScenarioModal();
          }
        });
    
        document.querySelectorAll('[data-scenario-expand]').forEach((button) => {
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.openScenarioModal(button.closest('.scenario-card'), button);
          });
        });
      },

      setupLanguageRefresh() {
        window.addEventListener('deck:languagechange', () => {
          if (
            this.scenarioModal &&
            !this.scenarioModal.hidden &&
            this.scenarioModalSourceCard
          ) {
            this.fillScenarioModal(this.scenarioModalSourceCard);
          }
        });
      },

      getScenarioCardImage(card) {
        return (
          card.style.getPropertyValue('--scenario-image') ||
          getComputedStyle(card).getPropertyValue('--scenario-image')
        ).trim();
      },

      getScenarioActiveChip(card) {
        const chips = Array.from(
          card.querySelectorAll('.scenario-chip[data-scenario-image]'),
        );
        if (!chips.length) return null;
    
        const activeChip = chips.find((chip) =>
          chip.classList.contains('is-active'),
        );
        if (activeChip) return activeChip;
    
        const image = this.getScenarioCardImage(card);
        return (
          chips.find((chip) => image.includes(chip.dataset.scenarioImage)) ||
          chips[0]
        );
      },

      clearScenarioModalVideo() {
        window.clearTimeout(this.scenarioModalVideoStartTimer);
        this.scenarioModalVideoStartTimer = null;

        const videos = Array.from(
          this.scenarioModalVisual?.querySelectorAll('video') || [],
        );
    
        videos.forEach((video) => {
          video.pause();
          if (this.scenarioModalVideoSceneHandler) {
            video.removeEventListener('ended', this.scenarioModalVideoSceneHandler);
          }
          if (typeof this.releaseVideoSource === 'function') {
            this.releaseVideoSource(video);
          } else {
            video.removeAttribute('src');
            video.load();
          }
          video.remove();
        });
    
        this.scenarioModalVideo = null;
        this.scenarioModalVideoSceneHandler = null;
      },

      getScenarioModalVideoScenes(videoPath, videoScenes) {
        const scenes = String(videoScenes || '')
          .split('|')
          .map((scene) => scene.trim())
          .filter(Boolean);

        if (scenes.length) return scenes;
        return videoPath ? [videoPath] : [];
      },

      setScenarioModalVisual(imagePath, videoPath, videoScenes) {
        if (!this.scenarioModalVisual) return;
    
        const resolvedImage = imagePath
          ? this.resolveAsset?.(imagePath) || imagePath
          : '';
        const resolvedVideos = this.getScenarioModalVideoScenes(
          videoPath,
          videoScenes,
        ).map((scene) => this.resolveAsset?.(scene) || scene);

        this.scenarioModalVisual.style.setProperty(
          '--scenario-modal-image',
          resolvedImage ? `url("${resolvedImage}")` : 'none',
        );
    
        this.clearScenarioModalVideo();
    
        if (!resolvedVideos.length) return;
    
        const video = document.createElement('video');
        video.className = 'scenario-modal-video';
        video.muted = true;
        video.loop = resolvedVideos.length === 1;
        video.playsInline = true;
        video.preload = 'metadata';
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('preload', 'metadata');
        if (video.loop) {
          video.setAttribute('loop', '');
        }
        video.src = resolvedVideos[0];
    
        this.scenarioModalVisual.appendChild(video);
        this.scenarioModalVideo = video;

        if (resolvedVideos.length > 1) {
          let sceneIndex = 0;
          this.scenarioModalVideoSceneHandler = () => {
            sceneIndex = (sceneIndex + 1) % resolvedVideos.length;
            video.src = resolvedVideos[sceneIndex];
            video.load();
            const nextPlayPromise = video.play();
            if (
              nextPlayPromise &&
              typeof nextPlayPromise.catch === 'function'
            ) {
              nextPlayPromise.catch(() => {});
            }
          };
          video.addEventListener('ended', this.scenarioModalVideoSceneHandler);
        }

        this.scenarioModalVideoStartTimer = window.setTimeout(() => {
          this.scenarioModalVideoStartTimer = null;
          if (this.scenarioModalVideo !== video) return;
          if (!video.isConnected || this.scenarioModal?.hidden) return;

          video.preload = 'auto';
          video.setAttribute('preload', 'auto');
          const playPromise = video.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
          }
        }, 220);
      },

      cancelScenarioModalAnimations() {
        window.clearTimeout(this.scenarioModalCloseTimer);
        this.scenarioModalCloseTimer = null;
        this.scenarioModal
          ?.getAnimations()
          .forEach((animation) => animation.cancel());
        this.scenarioModalCard
          ?.getAnimations()
          .forEach((animation) => animation.cancel());
      },

      fillScenarioModal(card) {
        if (!card || !this.scenarioModalVisual || !this.scenarioModalModes)
          return;
    
        const activeChip = this.getScenarioActiveChip(card);
        const activeImage = activeChip?.dataset.scenarioImage;
        const activeVideo = activeChip?.dataset.scenarioVideo;
        const activeVideoScenes = activeChip?.dataset.scenarioVideoScenes;
    
        this.setScenarioModalVisual(activeImage, activeVideo, activeVideoScenes);
        this.scenarioModalMeta.textContent =
          card.querySelector('.scenario-card-meta')?.textContent.trim() || '';
        this.scenarioModalTitle.textContent =
          card.querySelector('.scenario-card-title')?.textContent.trim() || '';
        this.scenarioModalText.textContent =
          card.querySelector('.scenario-card-text')?.textContent.trim() || '';
        this.scenarioModalModes.innerHTML = '';
    
        const sourceChips = Array.from(
          card.querySelectorAll('.scenario-chip'),
        );
    
        sourceChips.forEach((chip) => {
          const imagePath = chip.dataset.scenarioImage;
          const videoPath = chip.dataset.scenarioVideo;
          const videoScenes = chip.dataset.scenarioVideoScenes;
          const modalChip = document.createElement(imagePath ? 'button' : 'span');
          modalChip.className = chip.className;
          modalChip.textContent = chip.textContent.trim();
    
          if (imagePath) {
            modalChip.type = 'button';
            modalChip.dataset.scenarioImage = imagePath;
            if (videoPath) {
              modalChip.dataset.scenarioVideo = videoPath;
            }
            if (videoScenes) {
              modalChip.dataset.scenarioVideoScenes = videoScenes;
            }
    
            modalChip.addEventListener('click', () => {
                card.style.setProperty(
                  '--scenario-image',
                  `url("${this.resolveAsset?.(imagePath) || imagePath}")`,
                );
              this.setScenarioModalVisual(imagePath, videoPath, videoScenes);
    
              card
                .querySelectorAll('.scenario-chip[data-scenario-image]')
                .forEach((button) => {
                  button.classList.toggle(
                    'is-active',
                    button.dataset.scenarioImage === imagePath,
                  );
                });
    
              this.scenarioModalModes
                .querySelectorAll('.scenario-chip[data-scenario-image]')
                .forEach((button) => {
                  button.classList.toggle(
                    'is-active',
                    button.dataset.scenarioImage === imagePath,
                  );
                });
            });
          }
    
          this.scenarioModalModes.appendChild(modalChip);
        });
      },

      openScenarioModal(card, button) {
        if (!this.scenarioModal || !this.scenarioModalCard || !card) return;
    
        this.cancelScenarioModalAnimations();
        this.scenarioModalSourceCard = card;
        this.scenarioModalSourceButton = button;
        window.dispatchEvent(
          new CustomEvent('deck:scenario-modal-open', {
            detail: { card, button },
          }),
        );
        this.scenarioModal.classList.remove('is-closing');
        this.fillScenarioModal(card);
    
        const sourceRect = card
          .querySelector('.scenario-card-visual')
          ?.getBoundingClientRect();
    
        this.scenarioModal.hidden = false;
        this.scenarioModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('scenario-modal-open');
    
        window.requestAnimationFrame(() => {
          const targetRect = this.scenarioModalCard.getBoundingClientRect();
    
          if (sourceRect) {
            const dx = sourceRect.left - targetRect.left;
            const dy = sourceRect.top - targetRect.top;
            const sx = sourceRect.width / targetRect.width;
            const sy = sourceRect.height / targetRect.height;
    
            this.scenarioModalCard.animate(
              [
                {
                  transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
                  opacity: 0.92,
                },
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
              ],
              {
                duration: 620,
                easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              },
            );
          }
    
          this.scenarioModal.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 260,
            easing: 'ease-out',
          });
    
          this.scenarioModalClose?.focus();
        });
      },

      closeScenarioModal(instant = false) {
        if (!this.scenarioModal || this.scenarioModal.hidden) return;
    
        let isFinished = false;
        const finish = () => {
          if (isFinished) return;
          isFinished = true;
          window.clearTimeout(this.scenarioModalCloseTimer);
          this.scenarioModalCloseTimer = null;
          this.cancelScenarioModalAnimations();
          this.clearScenarioModalVideo();
          this.scenarioModal.hidden = true;
          this.scenarioModal.setAttribute('aria-hidden', 'true');
          this.scenarioModal.classList.remove('is-closing');
          document.body.classList.remove('scenario-modal-open');
          window.dispatchEvent(
            new CustomEvent('deck:scenario-modal-close', {
              detail: {
                card: this.scenarioModalSourceCard,
                button: this.scenarioModalSourceButton,
                instant,
              },
            }),
          );
          this.scenarioModalSourceButton?.focus?.();
          this.scenarioModalSourceCard = null;
          this.scenarioModalSourceButton = null;
        };
    
        if (instant || !this.scenarioModalCard) {
          finish();
          return;
        }
    
        this.scenarioModal.classList.add('is-closing');
    
        const sourceRect = this.scenarioModalSourceCard
          ?.querySelector('.scenario-card-visual')
          ?.getBoundingClientRect();
        const modalRect = this.scenarioModalCard.getBoundingClientRect();
    
        if (!sourceRect || !modalRect) {
          finish();
          return;
        }
    
        const dx = sourceRect.left - modalRect.left;
        const dy = sourceRect.top - modalRect.top;
        const sx = sourceRect.width / modalRect.width;
        const sy = sourceRect.height / modalRect.height;
    
        const panelAnimation = this.scenarioModalCard.animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            {
              transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
              opacity: 0,
            },
          ],
          {
            duration: 460,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          },
        );
    
        this.scenarioModal.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 460,
          easing: 'ease-in',
          fill: 'forwards',
        });
    
        panelAnimation.addEventListener('finish', finish, { once: true });
        this.scenarioModalCloseTimer = window.setTimeout(finish, 560);
      }
  });
})();
