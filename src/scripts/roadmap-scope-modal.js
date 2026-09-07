/* ROADMAP SCOPE MODAL */
(function () {
  const modal = document.querySelector('[data-roadmap-scope-modal]');
  if (!modal) return;

  const card = modal.querySelector('.roadmap-scope-modal-card');
  const closeButton = modal.querySelector('[data-roadmap-scope-close]');
  const triggers = Array.from(
    document.querySelectorAll('[data-roadmap-scope-open]'),
  );

  let sourceTrigger = null;
  let closeTimer = null;

  function cancelAnimations() {
    window.clearTimeout(closeTimer);
    closeTimer = null;
    modal.getAnimations().forEach((animation) => animation.cancel());
    card?.getAnimations().forEach((animation) => animation.cancel());
  }

  function hasOpenBlockingModal() {
    return Boolean(
      document.querySelector(
        '.scenario-modal:not([hidden]), [data-value-modal]:not([hidden]), [data-roadmap-scope-modal]:not([hidden])',
      ),
    );
  }

  function lockDeckNavigation() {
    document.body.classList.add('roadmap-scope-modal-open', 'scenario-modal-open');
  }

  function unlockDeckNavigation() {
    document.body.classList.remove('roadmap-scope-modal-open');

    if (!hasOpenBlockingModal()) {
      document.body.classList.remove('scenario-modal-open');
    }
  }

  function openModal(trigger) {
    cancelAnimations();
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
    if (modal.hidden) return;

    const finish = () => {
      cancelAnimations();
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      unlockDeckNavigation();
      sourceTrigger?.focus?.();
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

  window.addEventListener(
    'beforeunload',
    () => {
      closeModal(true);
    },
    { once: true },
  );
})();
