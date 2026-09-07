const deckI18n = new window.DeckI18n();
deckI18n.init();
const presentation = new window.SlidePresentation(deckI18n);

window.deckI18n = deckI18n;
window.presentation = presentation;

(() => {
  const slide = document.getElementById('slide-2');
  const formula = slide?.querySelector('[data-business-calculation]');
  const label = formula?.querySelector('.formula-label');
  const inputs = formula?.querySelector('.formula-inputs');
  const total = formula?.querySelector('[data-business-total]');
  const buttons = Array.from(slide?.querySelectorAll('[data-business-stream]') || []);
  const backgroundVideo = slide?.querySelector('.business-bg-video');
  const backgroundSource = backgroundVideo?.querySelector('source');
  if (!slide || !formula || !label || !inputs || !total || !buttons.length) return;

  let timers = [];
  let animationFrame = null;
  let runId = 0;
  let lastCalculationVisible = null;
  let activeButton =
    buttons.find((button) => button.classList.contains('is-active')) || buttons[0];
  const baseBackgroundVideo =
    backgroundSource?.dataset?.src ||
    backgroundSource?.getAttribute('data-src') ||
    backgroundSource?.getAttribute('src') ||
    backgroundVideo?.dataset?.src ||
    backgroundVideo?.getAttribute('src') ||
    '';

  const NUMBER_PATTERN = /\d(?:[\d\s]*\d)?(?:[,.]\d+)?/;
  const BILLION_PATTERN = /(\u043c\u043b\u0440\u0434|billion|\u5341\u4ebf|\u0e1e\u0e31\u0e19\u0e25\u0e49\u0e32\u0e19)/i;
  const MILLION_PATTERN = /(\u043c\u043b\u043d|million|\u767e\u4e07|\u0e25\u0e49\u0e32\u0e19)/i;

  const formatInteger = (value) =>
    String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const toNumber = (value) =>
    Number(String(value).replace(/\s/g, '').replace(',', '.')) || 0;

  const getDecimals = (value) => {
    const [, decimals = ''] = String(value).split(/[,.]/);
    return decimals.length;
  };

  const getDecimalSeparator = (value) =>
    String(value).includes('.') ? '.' : ',';

  const formatNumber = (value, decimals = 0, separator = ',') => {
    if (!decimals) return formatInteger(value);

    const fixed = Number(value).toFixed(decimals);
    const [integer, fraction] = fixed.split('.');
    return `${formatInteger(integer)}${separator}${fraction}`;
  };

  const getBusinessText = (button, field) => {
    const i18nKey = button?.dataset?.[`business${field}I18n`];
    if (i18nKey && deckI18n?.t) {
      return deckI18n.t(i18nKey);
    }

    return button?.dataset?.[`business${field}`] || '';
  };

  const parseNumberFragment = (text) => {
    const source = String(text || '').trim();
    const match = source.match(NUMBER_PATTERN);
    if (!match) {
      return {
        source,
        hasNumber: false,
        prefix: '',
        suffix: '',
        target: 0,
        decimals: 0,
        separator: ',',
      };
    }

    const numberText = match[0];
    return {
      source,
      hasNumber: true,
      prefix: source.slice(0, match.index),
      suffix: source.slice((match.index || 0) + numberText.length),
      target: toNumber(numberText),
      decimals: getDecimals(numberText),
      separator: getDecimalSeparator(numberText),
    };
  };

  const parseResult = (text) => {
    const meta = parseNumberFragment(text);
    if (!meta.hasNumber) return meta;

    return {
      ...meta,
      scale: BILLION_PATTERN.test(text)
        ? 1000000000
        : MILLION_PATTERN.test(text)
          ? 1000000
          : 1,
    };
  };

  const clearTimers = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const renderNumberFragment = (meta, value) =>
    `${meta.prefix}${formatNumber(value, meta.decimals, meta.separator)}${meta.suffix}`;

  const renderResultValue = (meta, value) => {
    if (!meta.hasNumber) return meta.source;

    const scaledValue = value / (meta.scale || 1);
    return renderNumberFragment(meta, scaledValue);
  };

  const RESULT_LABELS = {
    ru: {
      billion: ' \u043c\u043b\u0440\u0434',
      day: '\u0434\u0435\u043d\u044c',
      month: '\u043c\u0435\u0441\u044f\u0446',
      year: '\u0433\u043e\u0434',
    },
    en: {
      billion: ' billion',
      day: 'day',
      month: 'month',
      year: 'year',
    },
    zh: {
      billion: ' \u5341\u4ebf',
      day: '\u5929',
      month: '\u6708',
      year: '\u5e74',
    },
    th: {
      billion: ' \u0e1e\u0e31\u0e19\u0e25\u0e49\u0e32\u0e19',
      day: '\u0e27\u0e31\u0e19',
      month: '\u0e40\u0e14\u0e37\u0e2d\u0e19',
      year: '\u0e1b\u0e35',
    },
  };

  const getResultLabels = () => {
    const language =
      deckI18n?.currentLanguage ||
      document.documentElement.dataset.lang ||
      document.documentElement.lang ||
      'ru';
    const normalizedLanguage = String(language).toLowerCase().split('-')[0];
    return RESULT_LABELS[normalizedLanguage] || RESULT_LABELS.ru;
  };

  const getResultPeriodSuffix = (factorIndex, factorCount) => {
    const labels = getResultLabels();

    if (factorIndex <= 0) return ' THB';
    if (factorIndex >= factorCount - 1) return ` THB / ${labels.year}`;
    if (factorIndex === factorCount - 2) return ` THB / ${labels.month}`;
    return ` THB / ${labels.day}`;
  };

  const getResultScale = (meta, value) => {
    const absoluteValue = Math.abs(value);
    const labels = getResultLabels();

    if (absoluteValue >= 1000000000) {
      return {
        decimals: meta.scale === 1000000000 ? meta.decimals : 2,
        label: labels.billion,
        scale: 1000000000,
      };
    }

    return {
      decimals: 0,
      label: '',
      scale: 1,
    };
  };

  const renderStagedResultValue = (meta, value, factorIndex, factorCount) => {
    if (!meta.hasNumber) return meta.source;

    const scaleMeta = getResultScale(meta, value);
    const periodSuffix = getResultPeriodSuffix(factorIndex, factorCount);
    const scaledValue = value / scaleMeta.scale;

    return `${meta.prefix}${formatNumber(
      scaledValue,
      scaleMeta.decimals,
      meta.separator,
    )}${scaleMeta.label}${periodSuffix}`;
  };

  const getCurrentButton = () =>
    buttons.find((button) => button.classList.contains('is-active')) ||
    activeButton ||
    buttons[0];

  const ensureBusinessBackgroundVideo = (sourcePath) => {
    if (!backgroundVideo || !backgroundSource || !sourcePath) return;

    backgroundSource.dataset.src = sourcePath;

    if (window.deckMedia?.ensureVideoSource) {
      window.deckMedia.ensureVideoSource(backgroundVideo);
    } else if (presentation?.ensureVideoSource) {
      presentation.ensureVideoSource(backgroundVideo);
    } else if (backgroundSource.getAttribute('src') !== sourcePath) {
      backgroundSource.setAttribute('src', sourcePath);
      backgroundVideo.load();
    }

    const playPromise = backgroundVideo.play?.();
    playPromise?.catch?.(() => {});
  };

  const syncBackgroundVideo = (button = getCurrentButton()) => {
    ensureBusinessBackgroundVideo(button?.dataset?.businessBgVideo || baseBackgroundVideo);
  };

  const setActiveButton = (selectedButton = buttons[0]) => {
    activeButton = selectedButton || buttons[0];
    buttons.forEach((button) => {
      const isSelected = button === activeButton;
      button.classList.toggle('is-active', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    });
    syncBackgroundVideo(activeButton);
  };

  const setFactorValue = (factor, value) => {
    const meta = parseNumberFragment(factor.dataset.businessSource || '');
    factor.textContent = renderNumberFragment(meta, value);
  };

  const buildFormulaInputs = (formulaText, { initial = false } = {}) => {
    inputs.replaceChildren();

    const parts = String(formulaText || '')
      .split(/\s*[\u00d7x]\s*/u)
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) {
      inputs.textContent = formulaText || '';
      return [];
    }

    const factors = [];
    parts.forEach((part, index) => {
      if (index > 0) {
        const multiply = document.createElement('span');
        multiply.className = 'formula-multiply';
        multiply.setAttribute('aria-hidden', 'true');
        multiply.textContent = '\u00d7';
        if (!initial) multiply.classList.add('is-visible');
        inputs.appendChild(multiply);
      }

      const meta = parseNumberFragment(part);
      if (!meta.hasNumber) {
        inputs.appendChild(document.createTextNode(part));
        return;
      }

      const factor = document.createElement('span');
      factor.className = 'formula-factor';
      factor.dataset.businessFactor = '';
      factor.dataset.businessSource = part;
      factor.dataset.businessTarget = String(meta.target);
      factor.textContent = renderNumberFragment(meta, initial ? 0 : meta.target);
      if (!initial) factor.classList.add('is-complete');
      inputs.appendChild(factor);
      factors.push(factor);
    });

    return factors;
  };

  const renderFormula = (button, { initial = false } = {}) => {
    activeButton = button || getCurrentButton();
    const labelText = getBusinessText(activeButton, 'Label');
    const inputText = getBusinessText(activeButton, 'Inputs');
    const resultText = getBusinessText(activeButton, 'Result');
    const resultMeta = parseResult(resultText);

    label.textContent = labelText;
    const factors = buildFormulaInputs(inputText, { initial });
    total.textContent =
      initial && resultMeta.hasNumber
        ? renderStagedResultValue(resultMeta, 0, 0, factors.length || 1)
        : resultText;

    return { factors, resultMeta };
  };

  const cancelCalculation = () => {
    runId += 1;
    clearTimers();
    slide.classList.remove('is-business-calculating', 'is-business-calculated');
  };

  const resetCalculation = (button = getCurrentButton()) => {
    activeButton = button || getCurrentButton();
    syncBackgroundVideo(activeButton);
    cancelCalculation();
    renderFormula(activeButton, { initial: true });
  };

  const factorAnimationMs = 640;
  const factorReadPauseMs = 620;

  const animateValue = (from, to, duration, render, currentRunId) =>
    new Promise((resolve) => {
      const startTime = window.performance.now();

      const tick = (now) => {
        if (currentRunId !== runId || !slide.classList.contains('visible')) {
          resolve(false);
          return;
        }

        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        render(from + (to - from) * eased);

        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(tick);
          return;
        }

        render(to);
        resolve(true);
      };

      animationFrame = window.requestAnimationFrame(tick);
    });

  const runCalculation = async (currentRunId) => {
    const { factors, resultMeta } = renderFormula(activeButton, { initial: true });
    if (!factors.length || !resultMeta.hasNumber) {
      renderFormula(activeButton, { initial: false });
      slide.classList.add('is-business-calculated', 'is-business-controls-ready');
      return;
    }

    slide.classList.add('is-business-calculating');

    let product = 0;
    for (let index = 0; index < factors.length; index += 1) {
      if (currentRunId !== runId || !slide.classList.contains('visible')) return;

      const factor = factors[index];
      const target = Number(factor.dataset.businessTarget) || 0;
      if (index > 0) {
        inputs.querySelectorAll('.formula-multiply')[index - 1]?.classList.add('is-visible');
      }
      factor.classList.add('is-active');

      const nextProduct = index === 0 ? target : product * target;
      const completed = await animateValue(
        0,
        target,
        factorAnimationMs,
        (value) => {
          setFactorValue(factor, value);
          const stagedValue = index === 0 ? value : product * value;
          total.textContent = renderStagedResultValue(
            resultMeta,
            stagedValue,
            index,
            factors.length,
          );
        },
        currentRunId,
      );
      if (!completed) return;
      if (currentRunId !== runId || !slide.classList.contains('visible')) return;

      product = nextProduct;
      factor.classList.remove('is-active');
      factor.classList.add('is-complete');

      await new Promise((resolve) => {
        timers.push(window.setTimeout(resolve, factorReadPauseMs));
      });
    }

    total.textContent = getBusinessText(activeButton, 'Result');
    slide.classList.add('is-business-calculated', 'is-business-controls-ready');
    slide.classList.remove('is-business-calculating');
  };

  const startCalculation = (button = getCurrentButton(), delay = 1550) => {
    activeButton = button || getCurrentButton();
    resetCalculation(activeButton);
    const currentRunId = runId;
    timers.push(
      window.setTimeout(() => {
        runCalculation(currentRunId);
      }, delay),
    );
  };

  const showFormula = (button = getCurrentButton(), options = {}) => {
    const { animate = slide.classList.contains('visible'), delay = 0 } = options;
    activeButton = button || getCurrentButton();
    const isVisible = slide.classList.contains('visible');

    syncBackgroundVideo(activeButton);
    cancelCalculation();

    if (
      !animate ||
      !isVisible ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      renderFormula(activeButton, { initial: false });
      slide.classList.add('is-business-calculated', 'is-business-controls-ready');
      return;
    }

    renderFormula(activeButton, { initial: true });
    const currentRunId = runId;
    timers.push(
      window.setTimeout(() => {
        runCalculation(currentRunId);
      }, delay),
    );
  };

  const syncCalculation = () => {
    const isVisible = slide.classList.contains('visible');
    if (isVisible === lastCalculationVisible) return;

    lastCalculationVisible = isVisible;

    if (isVisible) {
      setActiveButton(buttons[0]);
      if (window.matchMedia('(min-width: 861px)').matches) {
        slide.classList.remove('is-business-controls-ready');
      }
      startCalculation(buttons[0], 1550);
      return;
    }

    resetCalculation(getCurrentButton());
    if (window.matchMedia('(min-width: 861px)').matches) {
      slide.classList.remove('is-business-controls-ready');
    }
  };

  window.businessFormulaAnimator = {
    show: showFormula,
    reset: resetCalculation,
  };

  if (typeof window.MutationObserver === 'function') {
    const observer = new MutationObserver(syncCalculation);
    observer.observe(slide, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener(
      'beforeunload',
      () => {
        observer.disconnect();
        resetCalculation();
      },
      { once: true },
    );
  }

  syncCalculation();
})();

(() => {
  const slide = document.getElementById('slide-6');
  const visitorNodes = Array.from(slide?.querySelectorAll('.timing-card-visitors[data-i18n]') || []);
  if (!slide || !visitorNodes.length) return;

  const valuePattern = /(\d[\d\s.,]*\s*(?:млн|тыс\.?|M|K|万|ล้าน)?)/iu;

  const decorateVisitors = () => {
    visitorNodes.forEach((node) => {
      const text = deckI18n?.t?.(node.dataset.i18n) || node.textContent || '';
      const match = text.match(valuePattern);

      if (!match) {
        node.textContent = text;
        return;
      }

      const start = match.index || 0;
      const value = match[1].trim();
      const before = text.slice(0, start);
      const after = text.slice(start + match[1].length);
      const valueNode = document.createElement('span');
      valueNode.className = 'timing-card-visitors-value';
      valueNode.textContent = value;

      node.replaceChildren(
        document.createTextNode(before),
        valueNode,
        document.createTextNode(after),
      );
    });
  };

  decorateVisitors();
  window.addEventListener('deck:languagechange', decorateVisitors);
})();

(() => {
  const slide = document.getElementById('slide-4');
  const line = slide?.querySelector('.hub-line[data-i18n="slides.04.line"]');
  if (!slide || !line) return;

  const slider = slide.querySelector('.hub-slider');
  let latestSequence = null;
  let sequenceRunId = 0;
  let sequenceTimers = [];
  const hubSliderRevealDelay = 1.36;
  const sliderRevealDuration = 0.86;
  const segmentLeadAfterSlider = 0.56;

  const cancelHubLineCardSequence = () => {
    sequenceRunId += 1;
    sequenceTimers.forEach((timer) => window.clearTimeout(timer));
    sequenceTimers = [];
  };

  const scheduleHubLineCardSequence = ({
    startIndex = 0,
    baseIndex = null,
  } = {}) => {
    cancelHubLineCardSequence();

    if (!latestSequence || !slide.classList.contains('visible')) return;
    if (!window.matchMedia('(min-width: 861px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cards = Array.from(slide.querySelectorAll('.hub-card'));
    const cardCount = Math.min(cards.length, latestSequence.itemCount);
    if (cardCount < 2) return;

    const runId = sequenceRunId;
    const firstIndex = Math.max(0, Math.min(cardCount, startIndex));
    const baseDelay = Number.isFinite(baseIndex)
      ? latestSequence.cardDelays?.[baseIndex] ?? 0
      : 0;

    for (let index = firstIndex; index < cardCount; index += 1) {
      const delay =
        Math.max(0, (latestSequence.cardDelays?.[index] ?? 0) - baseDelay) *
        1000;
      const timer = window.setTimeout(() => {
        if (runId !== sequenceRunId) return;
        if (!slide.classList.contains('visible')) return;
        if (document.body.classList.contains('hub-modal-open')) return;

        const deck = window.presentation;
        if (deck?.showHubCard) deck.showHubCard(index, true);
      }, delay);
      sequenceTimers.push(timer);

      if (cards[index]?.dataset?.hubAdvanceAfterScenes) {
        break;
      }
    }
  };

  const syncHubLineSegments = (activeIndex = -1) => {
    if (!line.classList.contains('is-hub-line-sequenced')) return;

    const segments = Array.from(line.querySelectorAll('.hub-line-segment'));
    if (!segments.length) return;

    const lastVisibleIndex = Math.max(
      -1,
      Math.min(segments.length - 1, Number(activeIndex)),
    );

    segments.forEach((segment, index) => {
      segment.classList.toggle(
        'is-hub-line-segment-visible',
        index <= lastVisibleIndex,
      );
    });

    const isComplete = lastVisibleIndex >= segments.length - 1;
    const tail = line.querySelector('.hub-line-tail');
    tail?.classList.toggle('is-hub-line-follow-visible', isComplete);
    slide.classList.toggle('is-hub-line-complete', isComplete);
  };

  const readHubCardIndex = (detail, key) => {
    const index = Number(detail?.[key]);
    return Number.isInteger(index) ? index : null;
  };

  const handleHubCardVideoOpen = (event) => {
    const cardIndex = readHubCardIndex(event?.detail, 'cardIndex');
    if (cardIndex === null) return;
    if (!slide.classList.contains('visible')) return;
    const activeCard = slide.querySelectorAll('.hub-card')[cardIndex];
    if (!activeCard?.classList.contains('is-active')) return;

    syncHubLineSegments(cardIndex);
  };

  const handleHubCardTransitionStart = (event) => {
    const detail = event?.detail || {};
    const fromIndex = readHubCardIndex(detail, 'fromIndex');
    const toIndex = readHubCardIndex(detail, 'toIndex');
    if (fromIndex === null || toIndex === null) return;

    if (toIndex < fromIndex) {
      syncHubLineSegments(toIndex);
    }
  };

  const handleHubCardAutoAdvance = (event) => {
    const detail = event?.detail || {};
    if (detail.target === 'slide') {
      cancelHubLineCardSequence();
      return;
    }

    const cardIndex = Number(detail.cardIndex);
    if (!Number.isInteger(cardIndex)) {
      cancelHubLineCardSequence();
      return;
    }

    const cards = Array.from(slide.querySelectorAll('.hub-card'));
    const cardCount = Math.min(cards.length, latestSequence?.itemCount || 0);
    const nextIndex = cardIndex + 1;

    if (nextIndex < 0 || nextIndex >= cardCount) {
      cancelHubLineCardSequence();
      return;
    }

    if (cards[nextIndex]?.dataset?.hubAdvanceAfterScenes) {
      cancelHubLineCardSequence();
      return;
    }

    scheduleHubLineCardSequence({
      startIndex: nextIndex + 1,
      baseIndex: nextIndex,
    });
  };

  slider?.addEventListener('pointerdown', cancelHubLineCardSequence, {
    passive: true,
  });
  window.addEventListener('deck:hub-card-auto-advance', handleHubCardAutoAdvance);
  window.addEventListener('deck:hub-card-video-open', handleHubCardVideoOpen);
  window.addEventListener(
    'deck:hub-card-transition-start',
    handleHubCardTransitionStart,
  );
  window.addEventListener('deck:hub-slide-teardown', cancelHubLineCardSequence);
  slider?.addEventListener(
    'click',
    (event) => {
      if (event.target?.closest?.('.hub-arrow, .hub-dot, [data-hub-expand]')) {
        cancelHubLineCardSequence();
      }
    },
    true,
  );

  const splitListAndTail = (text) => {
    const source = String(text || '').trim();
    const patterns = [
      /\s+—\s+/u,
      /\s+are\s+not\s+/iu,
      /不是/u,
      /\s+ไม่ใช่/u,
    ];
    const match = patterns
      .map((pattern) => {
        const result = source.match(pattern);
        return result ? { index: result.index || 0, value: result[0] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index)[0];

    if (!match) {
      const sentenceBreak = source.indexOf('. ');
      if (sentenceBreak < 0) return { list: source, tail: '' };
      return {
        list: source.slice(0, sentenceBreak + 1),
        tail: source.slice(sentenceBreak + 1).trimStart(),
      };
    }

    return {
      list: source.slice(0, match.index),
      tail: `${match.value}${source.slice(match.index + match.value.length)}`,
    };
  };

  const splitItems = (text) => {
    const source = String(text || '').trim();
    if (!source) return [];
    if (source.includes('、')) return source.split('、').map((item) => item.trim());
    if (source.includes(',')) return source.split(',').map((item) => item.trim());
    return source.split(/\s+/u).map((item) => item.trim());
  };

  const decorateHubLine = () => {
    const text = deckI18n?.t?.('slides.04.line') || line.textContent || '';
    const isDesktop = window.matchMedia('(min-width: 861px)').matches;
    if (!isDesktop) {
      line.textContent = text;
      latestSequence = null;
      line.classList.remove('is-hub-line-sequenced');
      line.style.removeProperty('--hub-item-count');
      slide.style.removeProperty('--hub-slider-reveal-delay');
      slide.style.removeProperty('--hub-controls-reveal-delay');
      slide.classList.remove('is-hub-line-complete');
      return;
    }

    const { list, tail } = splitListAndTail(text);
    const items = splitItems(list).filter(Boolean);
    let tailText = tail;

    if (items.length < 2) {
      line.textContent = text;
      latestSequence = null;
      line.classList.remove('is-hub-line-sequenced');
      slide.style.removeProperty('--hub-slider-reveal-delay');
      slide.style.removeProperty('--hub-controls-reveal-delay');
      slide.classList.remove('is-hub-line-complete');
      return;
    }

    line.replaceChildren();
    line.style.setProperty('--hub-item-count', String(items.length));
    line.classList.add('is-hub-line-sequenced');

    const sliderRevealDelay = hubSliderRevealDelay;
    const segmentLandDuration = 0.38;
    const textDelayAfterCard = 1.25;
    const pauseAfterText = 1.2;
    const getCardHold = (card) => {
      const hold = Number.parseFloat(card?.dataset?.hubCardHold || '0');
      return Number.isFinite(hold) ? Math.max(0, hold) : 0;
    };
    const firstSegmentDelay =
      sliderRevealDelay + sliderRevealDuration + segmentLeadAfterSlider;
    const cards = Array.from(slide.querySelectorAll('.hub-card'));
    const cardCount = cards.length;
    slide.style.setProperty('--hub-slider-reveal-delay', `${sliderRevealDelay}s`);
    slide.style.setProperty(
      '--hub-controls-reveal-delay',
      `${sliderRevealDelay + sliderRevealDuration + 0.18}s`,
    );
    const itemCount = Math.min(items.length, cardCount);
    const cardDelays = [];
    const segmentDelays = [];
    let nextCardDelay = 0;

    for (let index = 0; index < itemCount; index += 1) {
      const cardDelay = index === 0 ? 0 : nextCardDelay;
      const segmentDelay =
        index === 0
          ? firstSegmentDelay
          : cardDelay + textDelayAfterCard;

      cardDelays[index] = cardDelay;
      segmentDelays[index] = segmentDelay;
      nextCardDelay = segmentDelay + segmentLandDuration + pauseAfterText;

      nextCardDelay = Math.max(nextCardDelay, cardDelay + getCardHold(cards[index]));
    }

    for (let index = itemCount; index < items.length; index += 1) {
      segmentDelays[index] =
        (segmentDelays[index - 1] || firstSegmentDelay) +
        segmentLandDuration +
        pauseAfterText;
    }

    latestSequence = {
      itemCount,
      cardDelays,
    };

    items.forEach((item, index) => {
      const segment = document.createElement('span');
      segment.className = 'hub-line-segment';
      segment.style.setProperty('--hub-item-index', String(index));
      segment.dataset.hubCardIndex = String(index);
      const segmentDelay = segmentDelays[index] || firstSegmentDelay;
      segment.style.setProperty(
        '--hub-segment-delay',
        `${segmentDelay}s`,
      );
      segment.textContent = `${item}${index < items.length - 1 ? ',' : ''}`;
      line.append(segment);
      line.append(document.createTextNode(' '));
    });

    if (tailText) {
      const tailNode = document.createElement('span');
      tailNode.className = 'hub-line-tail';
      tailNode.textContent = tailText.trimStart();
      line.append(tailNode);
      syncHubLineSegments(-1);
      return;
    }

    syncHubLineSegments(-1);
  };

  decorateHubLine();
  let wasSlideVisible = slide.classList.contains('visible');
  window.addEventListener('deck:languagechange', () => {
    decorateHubLine();
    if (slide.classList.contains('visible')) {
      syncHubLineSegments(window.presentation?.activeHubCard ?? 0);
      scheduleHubLineCardSequence();
    }
  });

  let hubLineObserver = null;
  if (typeof window.MutationObserver === 'function') {
    hubLineObserver = new MutationObserver(() => {
      const isSlideVisible = slide.classList.contains('visible');

      if (isSlideVisible && !wasSlideVisible) {
        wasSlideVisible = true;
        syncHubLineSegments(window.presentation?.activeHubCard ?? 0);
        scheduleHubLineCardSequence();
        return;
      }

      if (isSlideVisible) return;

      wasSlideVisible = false;
      cancelHubLineCardSequence();
      decorateHubLine();
    });
    hubLineObserver.observe(slide, { attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener(
    'beforeunload',
    () => {
      hubLineObserver?.disconnect();
      window.removeEventListener(
        'deck:hub-card-auto-advance',
        handleHubCardAutoAdvance,
      );
      window.removeEventListener(
        'deck:hub-card-video-open',
        handleHubCardVideoOpen,
      );
      window.removeEventListener(
        'deck:hub-card-transition-start',
        handleHubCardTransitionStart,
      );
      window.removeEventListener(
        'deck:hub-slide-teardown',
        cancelHubLineCardSequence,
      );
      cancelHubLineCardSequence();
    },
    { once: true },
  );

  if (slide.classList.contains('visible')) {
    syncHubLineSegments(window.presentation?.activeHubCard ?? 0);
    scheduleHubLineCardSequence();
  }
})();

(() => {
  const slide = document.getElementById('slide-8');
  const line = slide?.querySelector('.value-line[data-i18n="slides.08.line"]');
  if (!slide || !line) return;

  const desktopQuery = window.matchMedia('(min-width: 861px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const splitWords = (text) => {
    const source = String(text || '').trim();
    if (!source) return [];
    if (/\s/u.test(source)) return source.split(/\s+/u).filter(Boolean);

    if (typeof Intl?.Segmenter === 'function') {
      return Array.from(
        new Intl.Segmenter(document.documentElement.lang || 'ru', {
          granularity: 'word',
        }).segment(source),
      )
        .map((segment) => segment.segment.trim())
        .filter(Boolean);
    }

    return Array.from(source);
  };

  const getText = (key, node) => deckI18n?.t?.(key) || node.textContent || '';

  const decorateLine = () => {
    const text = getText('slides.08.line', line);

    if (!desktopQuery.matches || reducedMotionQuery.matches) {
      line.textContent = text;
      line.classList.remove('is-value-line-sequenced');
      return;
    }

    const words = splitWords(text);
    if (words.length < 2) {
      line.textContent = text;
      line.classList.remove('is-value-line-sequenced');
      return;
    }

    const wordStep = 0.075;
    line.replaceChildren();
    line.classList.add('is-value-line-sequenced');

    words.forEach((word, index) => {
      const wordNode = document.createElement('span');
      wordNode.className = 'value-line-word';
      wordNode.style.setProperty(
        '--value-line-word-delay',
        `${index * wordStep}s`,
      );
      wordNode.textContent = word;
      line.append(wordNode);

      if (index < words.length - 1) {
        line.append(document.createTextNode(' '));
      }
    });
  };

  const decorateValueSlide = () => {
    decorateLine();
  };

  decorateValueSlide();
  window.addEventListener('deck:languagechange', decorateValueSlide);
  desktopQuery.addEventListener?.('change', decorateValueSlide);
  reducedMotionQuery.addEventListener?.('change', decorateValueSlide);
})();

(() => {
  const slide = document.getElementById('slide-6');
  const counters = Array.from(slide?.querySelectorAll('[data-phuket-count]') || []);
  if (!slide || !counters.length) return;

  let animationFrame = null;
  let startTimer = null;

  const formatValue = (value) =>
    String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const parseTimeValue = (value) => {
    const firstValue = String(value || '0s').split(',')[0].trim();
    const number = Number.parseFloat(firstValue) || 0;
    return firstValue.endsWith('ms') ? number : number * 1000;
  };

  const getCounterStartDelay = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;

    const marker = slide.querySelector('.phuket-marker');
    if (!marker) return 0;

    const markerStyle = window.getComputedStyle(marker);
    if (window.matchMedia('(min-width: 861px)').matches) {
      return parseTimeValue(markerStyle.animationDelay);
    }

    return (
      parseTimeValue(markerStyle.animationDelay) +
      parseTimeValue(markerStyle.animationDuration)
    );
  };

  const resetCounters = () => {
    window.clearTimeout(startTimer);
    startTimer = null;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;

    counters.forEach((counter) => {
      counter.textContent = '0';
    });
  };

  const startCounters = () => {
    resetCounters();

    const targets = counters.map((counter) => ({
      counter,
      value: Number(counter.dataset.phuketCount) || 0,
    }));
    const duration = 2900;
    const startTime = window.performance.now();

    const render = (now) => {
      if (!slide.classList.contains('visible')) {
        resetCounters();
        return;
      }

      const progress = Math.min((now - startTime) / duration, 1);

      targets.forEach(({ counter, value }) => {
        counter.textContent = formatValue(value * progress);
      });

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(render);
        return;
      }

      targets.forEach(({ counter, value }) => {
        counter.textContent = formatValue(value);
      });
      animationFrame = null;
    };

    animationFrame = window.requestAnimationFrame(render);
  };

  const scheduleCounters = () => {
    resetCounters();
    startTimer = window.setTimeout(() => {
      startTimer = null;
      startCounters();
    }, getCounterStartDelay());
  };

  const syncCounters = () => {
    if (slide.classList.contains('visible')) {
      scheduleCounters();
      return;
    }

    resetCounters();
  };

  if (typeof window.MutationObserver === 'function') {
    const observer = new MutationObserver(syncCounters);
    observer.observe(slide, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener(
      'beforeunload',
      () => {
        observer.disconnect();
        resetCounters();
      },
      { once: true },
    );
  }

  syncCounters();
})();

window.addEventListener('load', () => {
  const requestedSlide = new URLSearchParams(window.location.search).get('slide');
  if (requestedSlide || !window.location.hash) return;

  const target = requestedSlide
    ? document.querySelector(`#slide-${requestedSlide}`)
    : document.querySelector(window.location.hash);
  if (!target) return;

  requestAnimationFrame(() => {
    const targetIndex = presentation.slides.indexOf(target);
    if (targetIndex >= 0) {
      presentation.goTo(targetIndex, true);
    }
  });
});
