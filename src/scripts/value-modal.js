/* VALUE MODAL */
(function () {
  const modal = document.querySelector('[data-value-modal]');
  if (!modal) return;

  const card = modal.querySelector('.value-modal-card');
  const closeButton = modal.querySelector('[data-value-modal-close]');
  const metaNode = modal.querySelector('[data-value-modal-meta]');
  const titleNode = modal.querySelector('[data-value-modal-title]');
  const textNode = modal.querySelector('[data-value-modal-text]');
  const triggers = Array.from(document.querySelectorAll('[data-value-modal-open]'));
  const sources = new Map(
    Array.from(document.querySelectorAll('[data-value-modal-source]')).map(
      (source) => [source.dataset.valueModalSource, source],
    ),
  );

  let activeKey = null;
  let sourceTrigger = null;
  let closeTimer = null;

  function getSourceText(key, selector) {
    return sources.get(key)?.querySelector(selector)?.textContent.trim() || '';
  }

  function fillModalBody(key) {
    if (!textNode) return;

    const sourceText = sources.get(key)?.querySelector('[data-value-modal-source-text]');
    if (!sourceText) {
      textNode.textContent = '';
      return;
    }

    const children = Array.from(sourceText.childNodes).map((node) =>
      node.cloneNode(true),
    );
    textNode.replaceChildren(...children);
  }

  function fillModal(key) {
    if (!sources.has(key)) return false;

    if (metaNode) {
      metaNode.textContent = getSourceText(key, '[data-value-modal-source-meta]');
    }

    if (titleNode) {
      titleNode.textContent = getSourceText(key, '[data-value-modal-source-title]');
    }

    fillModalBody(key);

    return true;
  }

  function cancelAnimations() {
    window.clearTimeout(closeTimer);
    closeTimer = null;
    modal.getAnimations().forEach((animation) => animation.cancel());
    card?.getAnimations().forEach((animation) => animation.cancel());
  }

  function lockDeckNavigation() {
    document.body.classList.add('value-modal-open', 'scenario-modal-open');
  }

  function unlockDeckNavigation() {
    document.body.classList.remove('value-modal-open');

    if (!document.querySelector('.scenario-modal:not([hidden])')) {
      document.body.classList.remove('scenario-modal-open');
    }
  }

  function openModal(trigger) {
    const key = trigger?.dataset.valueModalOpen;
    if (!key || !fillModal(key)) return;

    cancelAnimations();
    activeKey = key;
    sourceTrigger = trigger;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    lockDeckNavigation();

    window.requestAnimationFrame(() => {
      modal.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 240,
        easing: 'ease-out',
      });

      card?.animate(
        [
          { opacity: 0, transform: 'translateY(1.2rem) scale(0.98)' },
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
    if (modal.hidden) return;

    const finish = () => {
      cancelAnimations();
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      unlockDeckNavigation();
      sourceTrigger?.focus?.();
      activeKey = null;
      sourceTrigger = null;
    };

    if (instant || !card) {
      finish();
      return;
    }

    modal.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 220,
      easing: 'ease-in',
      fill: 'forwards',
    });

    const panelAnimation = card.animate(
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

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      openModal(trigger);
    });
  });

  closeButton?.addEventListener('click', () => {
    closeModal();
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (modal.hidden || event.key !== 'Escape') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal();
  });

  window.addEventListener('deck:languagechange', () => {
    if (!modal.hidden && activeKey) {
      fillModal(activeKey);
    }
  });

  window.addEventListener(
    'beforeunload',
    () => {
      closeModal(true);
    },
    { once: true },
  );
})();
