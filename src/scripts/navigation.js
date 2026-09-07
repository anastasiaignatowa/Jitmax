/* SLIDE PRESENTATION CONTROLLER */
class SlidePresentation {
  constructor(i18n = null) {
    this.i18n = i18n;
    this.slides = Array.from(document.querySelectorAll('.slide'));
    this.assetCache = window.deckAssetCache || null;
    this.assetCache?.applyStaticAssetVersions(document);
      const requestedSlide = new URLSearchParams(
        window.location.search,
      ).get('slide');
      const requestedSlideElement = requestedSlide
        ? document.querySelector(`#slide-${requestedSlide}`)
        : null;
      const requestedSlideIndex = requestedSlideElement
        ? this.slides.indexOf(requestedSlideElement)
        : -1;
      const requestedSlideNumber = Number(requestedSlide);
      this.currentSlide =
        requestedSlideIndex >= 0
          ? requestedSlideIndex
          : Number.isInteger(requestedSlideNumber) &&
              requestedSlideNumber > 0
            ? Math.min(requestedSlideNumber - 1, this.slides.length - 1)
            : 0;
      this.isWheelLocked = false;
      this.transitionFrame = null;
      this.transitionTimer = null;
      this.animationFrame = null;
      this.fastNavTimer = null;
      this.numericInputTimer = null;
      this.numericInputBuffer = '';
      this.fastNavDelay = 155;
      this.slideChangeAudio = null;
      this.slideChangeAudioPath = 'assets/Change_Slides.wav';
      this.slideChangeAudioVolume = 0.54;
      this.titleVideoRevealTimer = null;
      this.titleVideoPlayTimer = null;
      this.hubSlider = null;
      this.hubCards = [];
      this.hubDots = [];
      this.hubAnimationTimer = null;
      this.hubDragCandidate = null;
      this.activeHubCard = 0;
      this.businessStreamLocked = false;
      this.setupIntersectionObserver();
      this.setupKeyboardNav();
      this.setupWheelNav();
      this.setupTouchNav();
      this.setupHubSlider();
      this.setupBusinessStreamCard();
      this.setupScenarioModes();
      this.setupScenarioModal();
      this.setupValueVideoSequence();
      this.setupMediaLifecycle?.();
      this.setupLanguageRefresh();
      const shouldAnimateInitialSlide = this.currentSlide === 0 && !requestedSlide;
      if (shouldAnimateInitialSlide) {
        document.documentElement.classList.add('is-initializing-slide');
      }
      this.applySlideState(this.currentSlide, !shouldAnimateInitialSlide);
      if (shouldAnimateInitialSlide) {
        window.setTimeout(() => {
          document.documentElement.classList.remove('is-initializing-slide');
        }, 650);
      }
    }

    setupIntersectionObserver() {
      this.slides.forEach((slide) => {
        slide.classList.remove('visible');
      });
    }

    applySlideState(activeIndex, instant = false) {
      window.cancelAnimationFrame(this.animationFrame);
      this.closeScenarioModal?.(true);
      this.closeHubModal?.();
  
      this.slides.forEach((slide, slideIndex) => {
        const isPast = slideIndex < activeIndex;
        const isCurrent = slideIndex === activeIndex;
  
        slide.classList.toggle('is-past', isPast);
        slide.classList.toggle('is-current', isCurrent);
        slide.classList.remove('visible');
        slide.classList.remove('media-ready');
      });
  
      const activeSlide = this.slides[activeIndex];
      if (!activeSlide) return;
  
    this.resetSlidePlayback(activeSlide);
    this.resetHubSlider(activeSlide);
    this.preloadNearbySlides?.(activeIndex);
    void activeSlide.offsetHeight;
  
      if (instant) {
        activeSlide.classList.add('visible');
        return;
      }
  
      this.animationFrame = window.requestAnimationFrame(() => {
        activeSlide.classList.add('visible');
      });
    }

    setupKeyboardNav() {
      window.addEventListener('keydown', (event) => {
        const nextKeys = ['ArrowDown', 'ArrowRight', ' ', 'PageDown'];
        const prevKeys = ['ArrowUp', 'ArrowLeft', 'PageUp'];
        const isNumberKey = /^\d$/.test(event.key);
        const isDeckNavigationKey =
          event.key === 'Home' ||
          event.key === 'End' ||
          isNumberKey ||
          nextKeys.includes(event.key) ||
          prevKeys.includes(event.key);
        const interactiveTarget = event.target?.closest?.(
          'button, a, input, select, textarea, [role="button"], [role="option"]',
        );
  
        if (interactiveTarget && event.key !== 'Escape') {
          const shouldLetDeckHandleKey =
            isDeckNavigationKey &&
            event.key !== ' ' &&
            !interactiveTarget.closest('.language-menu') &&
            !document.body.classList.contains('scenario-modal-open') &&
            !document.body.classList.contains('hub-modal-open');
  
          if (!shouldLetDeckHandleKey) return;
        }
  
        if (
          document.body.classList.contains('scenario-modal-open') ||
          document.body.classList.contains('hub-modal-open')
        ) {
          if (
            event.key === 'Escape' ||
            event.key === 'Home' ||
            event.key === 'End' ||
            isNumberKey ||
            nextKeys.includes(event.key) ||
            prevKeys.includes(event.key)
          ) {
            event.preventDefault();
          }
  
          if (event.key === 'Escape') {
            this.closeScenarioModal();
            this.closeHubModal?.();
          }
  
          return;
        }
  
        if (event.key === 'Home') {
          event.preventDefault();
          this.goToFast(0);
          return;
        }
  
        if (event.key === 'End') {
          event.preventDefault();
          this.goToFast(this.slides.length - 1);
          return;
        }
  
        if (isNumberKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          this.handleNumericNavigation(event.key);
          return;
        }
  
        if (nextKeys.includes(event.key)) {
          event.preventDefault();
          if (this.isWheelLocked) return;
          this.goTo(this.getCurrentSlideIndex() + 1);
        }
  
        if (prevKeys.includes(event.key)) {
          event.preventDefault();
          if (this.isWheelLocked) return;
          this.goTo(this.getCurrentSlideIndex() - 1);
        }
      });
    }

    setupBusinessStreamCard() {
      const slide = document.getElementById('slide-2');
      const card = slide?.querySelector('[data-business-card]');
      const buttons = Array.from(
        slide?.querySelectorAll('[data-business-stream]') || [],
      );
      if (!card || !buttons.length) return;
  
      const label = card.querySelector('.formula-label');
      const inputs = card.querySelector('.formula-inputs');
      const result = card.querySelector('.formula-result');
      if (!label || !inputs || !result) return;
  
      const activeButton =
        buttons.find((button) => button.classList.contains('is-active')) ||
        buttons[0];
      if (!activeButton.dataset.businessLabel) {
        activeButton.dataset.businessLabel = label.textContent.trim();
      }
      if (!activeButton.dataset.businessInputs) {
        activeButton.dataset.businessInputs = inputs.textContent.trim();
      }
      if (!activeButton.dataset.businessResult) {
        activeButton.dataset.businessResult = result.textContent.trim();
      }
  
      const setActiveButton = (selectedButton) => {
        buttons.forEach((button) => {
          const isSelected = button === selectedButton;
          button.classList.toggle('is-active', isSelected);
          button.setAttribute('aria-pressed', String(isSelected));
        });
      };
  
      setActiveButton(activeButton);
  
      const getBusinessText = (button, field) => {
        const i18nKey = button.dataset[`business${field}I18n`];
        if (i18nKey && this.i18n?.t) {
          return this.i18n.t(i18nKey);
        }
  
        return button.dataset[`business${field}`] || '';
      };
  
      const updateCard = (button, options = {}) => {
        if (window.businessFormulaAnimator?.show) {
          window.businessFormulaAnimator.show(button, {
            animate: slide.classList.contains('visible'),
            delay: 300,
            ...options,
          });
          return;
        }

        label.textContent = getBusinessText(button, 'Label');
        inputs.textContent = getBusinessText(button, 'Inputs');
        result.textContent = getBusinessText(button, 'Result');
      };
  
      let activeCardAnimation = null;
      const resetCardAnimationState = () => {
        activeCardAnimation?.cancel();
        activeCardAnimation = null;
        card.style.opacity = '';
        card.style.transform = '';
      };
  
      const prefersReducedMotion = () =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
      const waitForAnimation = (animation, fallbackDelay) =>
        new Promise((resolve) => {
          let isResolved = false;
          const finish = () => {
            if (isResolved) return;
            isResolved = true;
            resolve();
          };
  
          animation?.addEventListener?.('finish', finish, { once: true });
          animation?.addEventListener?.('cancel', finish, { once: true });
          window.setTimeout(finish, fallbackDelay);
        });
  
      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          if (
            this.businessStreamLocked ||
            button.classList.contains('is-active')
          ) {
            return;
          }
  
          setActiveButton(button);
  
          if (prefersReducedMotion() || typeof card.animate !== 'function') {
            updateCard(button, { animate: false });
            resetCardAnimationState();
            return;
          }
  
          this.businessStreamLocked = true;
          resetCardAnimationState();
          const cardRect = card.getBoundingClientRect();
          const exitX = Math.max(
            window.innerWidth - cardRect.left + 64,
            cardRect.width + 64,
          );
  
          const exitAnimation = card.animate(
            [
              { opacity: 1, transform: 'translateX(0)' },
              { opacity: 0.96, transform: `translateX(${exitX}px)` },
            ],
            {
              duration: 280,
              easing: 'cubic-bezier(0.4, 0, 1, 1)',
              fill: 'forwards',
            },
          );
          activeCardAnimation = exitAnimation;
  
          waitForAnimation(exitAnimation, 340)
            .then(() => {
              exitAnimation.cancel();
              updateCard(button);
  
              const enterAnimation = card.animate(
                [
                  { opacity: 0.96, transform: `translateX(${exitX}px)` },
                  { opacity: 1, transform: 'translateX(0)' },
                ],
                {
                  duration: 440,
                  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                  fill: 'forwards',
                },
              );
              activeCardAnimation = enterAnimation;
  
              return waitForAnimation(enterAnimation, 520).finally(() => {
                enterAnimation.cancel();
                activeCardAnimation = null;
              });
            })
            .finally(() => {
              resetCardAnimationState();
              this.businessStreamLocked = false;
            });
        });
      });
  
      window.addEventListener('deck:languagechange', () => {
        const currentButton =
          buttons.find((button) => button.classList.contains('is-active')) ||
          activeButton;
  
        updateCard(currentButton, { animate: false });
      });
    }

    setupWheelNav() {
      window.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
  
          if (
            document.body.classList.contains('scenario-modal-open') ||
            document.body.classList.contains('hub-modal-open')
          )
            return;
  
          if (this.isWheelLocked || Math.abs(event.deltaY) < 6) return;
  
          const direction = event.deltaY > 0 ? 1 : -1;
          const currentIndex = this.getCurrentSlideIndex();
          const nextIndex = currentIndex + direction;
  
          if (nextIndex < 0 || nextIndex >= this.slides.length) return;
  
          this.goTo(nextIndex);
        },
        { passive: false },
      );
    }

    getCurrentSlideIndex() {
      return this.currentSlide;
    }

    getSlideNumber(slide) {
      const match = slide?.id?.match(/^slide-(\d+)$/);
      return match ? Number(match[1]) : null;
    }

    getSlideIndexByNumber(number) {
      return this.slides.findIndex(
        (slide) => this.getSlideNumber(slide) === number,
      );
    }

    getSlideChangeAudio() {
      if (this.isPreviewMode?.()) return null;
      if (!this.slideChangeAudio) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.loop = false;
        audio.volume = this.slideChangeAudioVolume;
        this.slideChangeAudio = audio;
      }

      return this.slideChangeAudio;
    }

    playSlideChangeAudio() {
      const audio = this.getSlideChangeAudio();
      if (!audio) return;

      const source =
        this.resolveAsset?.(this.slideChangeAudioPath) ||
        this.slideChangeAudioPath;
      if (!source) return;

      if (audio.getAttribute('src') !== source) {
        audio.src = source;
        audio.load();
      }

      audio.loop = false;
      audio.volume = this.slideChangeAudioVolume;
      audio.pause();

      try {
        audio.currentTime = 0;
      } catch {}

      audio.play()?.catch?.(() => {});
    }

    hasSlideNumberPrefix(prefix) {
      return this.slides.some((slide) => {
        const number = this.getSlideNumber(slide);
        if (!number) return false;
  
        const value = String(number);
        return value !== prefix && value.startsWith(prefix);
      });
    }

    clearNumericNavigation() {
      window.clearTimeout(this.numericInputTimer);
      this.numericInputTimer = null;
      this.numericInputBuffer = '';
    }

    commitNumericNavigation() {
      const requestedNumber = Number(this.numericInputBuffer);
      this.clearNumericNavigation();
  
      if (!requestedNumber) return;
  
      const targetIndex = this.getSlideIndexByNumber(requestedNumber);
      if (targetIndex >= 0) {
        this.goToFast(targetIndex);
      }
    }

    handleNumericNavigation(key) {
      if (key === '0' && !this.numericInputBuffer) return;
  
      window.clearTimeout(this.numericInputTimer);
      this.numericInputBuffer = `${this.numericInputBuffer}${key}`.slice(-2);
  
      const targetIndex = this.getSlideIndexByNumber(
        Number(this.numericInputBuffer),
      );
      const waitForSecondDigit = this.hasSlideNumberPrefix(
        this.numericInputBuffer,
      );
  
      if (targetIndex >= 0 && !waitForSecondDigit) {
        this.commitNumericNavigation();
        return;
      }
  
      this.numericInputTimer = window.setTimeout(() => {
        this.commitNumericNavigation();
      }, 430);
    }

    lockWheel(targetIndex) {
      window.clearTimeout(this.transitionTimer);
      window.cancelAnimationFrame(this.transitionFrame);
  
      this.isWheelLocked = true;
      this.transitionTimer = window.setTimeout(() => {
        this.currentSlide = targetIndex;
        this.isWheelLocked = false;
      }, 850);
    }

    cancelFastNav() {
      window.clearTimeout(this.fastNavTimer);
      this.fastNavTimer = null;
      document.documentElement.classList.remove('is-fast-nav');
    }

    activateSlide(index, instant = false) {
      const boundedIndex = Math.max(
        0,
        Math.min(this.slides.length - 1, index),
      );
      this.currentSlide = boundedIndex;
      this.applySlideState(boundedIndex, instant);
      return boundedIndex;
    }

    goToFast(index) {
      this.clearNumericNavigation();
      this.cancelFastNav();
      window.clearTimeout(this.transitionTimer);
      window.cancelAnimationFrame(this.transitionFrame);
  
      const targetIndex = Math.max(
        0,
        Math.min(this.slides.length - 1, index),
      );
      const startIndex = this.getCurrentSlideIndex();
      if (targetIndex === startIndex) return;
      this.playSlideChangeAudio();
  
      const direction = targetIndex > startIndex ? 1 : -1;
      let nextIndex = startIndex;
      this.isWheelLocked = true;
      document.documentElement.classList.add('is-fast-nav');
  
      const step = () => {
        nextIndex += direction;
        const isFinal = nextIndex === targetIndex;
        this.activateSlide(nextIndex, false);
  
        if (!isFinal) {
          this.fastNavTimer = window.setTimeout(step, this.fastNavDelay);
          return;
        }
  
        this.transitionTimer = window.setTimeout(() => {
          this.currentSlide = targetIndex;
          this.isWheelLocked = false;
          document.documentElement.classList.remove('is-fast-nav');
        }, 700);
      };
  
      step();
    }

    setupTouchNav() {
      let startY = 0;
  
      window.addEventListener(
        'touchstart',
        (event) => {
          startY = event.touches[0].clientY;
        },
        { passive: true },
      );
  
      window.addEventListener(
        'touchend',
        (event) => {
          if (
            document.body.classList.contains('scenario-modal-open') ||
            document.body.classList.contains('hub-modal-open')
          )
            return;
  
          const endY = event.changedTouches[0].clientY;
          const delta = startY - endY;
  
          if (Math.abs(delta) > 46) {
            if (this.isWheelLocked) return;
            this.goTo(this.getCurrentSlideIndex() + (delta > 0 ? 1 : -1));
          }
        },
        { passive: true },
      );
    }

    goTo(index, instant = false) {
      this.clearNumericNavigation();
      this.cancelFastNav();
      const startIndex = this.getCurrentSlideIndex();
      const boundedIndex = this.activateSlide(index, instant);
  
      if (boundedIndex !== startIndex && !instant) {
        this.playSlideChangeAudio();
      }

      if (!instant) {
        this.lockWheel(boundedIndex);
      }
    }
}

window.SlidePresentation = SlidePresentation;
