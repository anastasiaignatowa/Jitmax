/* I18N CONTROLLER */
class DeckI18n {
  constructor() {
    this.data = this.readData();
    this.defaultLanguage = this.data?.defaultLanguage || 'en';
    this.sourceLanguage = this.data?.sourceLanguage || 'ru';
    this.storageKey = this.data?.storageKey || 'jitmaxDeckLanguage';
    this.languages = Array.isArray(this.data?.languages)
      ? this.data.languages
      : [];
    this.translations = this.data?.translations || {};
    this.currentLanguage = this.resolveInitialLanguage();
    this.switcher = null;
    this.toggleButton = null;
    this.menu = null;
  }

  readData() {
    const node = document.getElementById('deck-i18n-data');
    if (node?.textContent?.trim()) {
      try {
        return JSON.parse(node.textContent);
      } catch (error) {
        console.warn('Не удалось прочитать переводы презентации', error);
      }
    }

    return window.DECK_I18N || null;
  }

  resolveInitialLanguage() {
    let savedLanguage = null;

    try {
      savedLanguage = window.localStorage.getItem(this.storageKey);
    } catch (error) {
      savedLanguage = null;
    }

    if (this.hasLanguage(savedLanguage)) return savedLanguage;
    return this.hasLanguage(this.defaultLanguage)
      ? this.defaultLanguage
      : this.languages[0]?.code || 'en';
  }

  hasLanguage(language) {
    return Boolean(language && this.translations[language]);
  }

  resolveAsset(path) {
    return window.deckAssetCache?.resolve(path) || path;
  }

  t(key, language = this.currentLanguage) {
    return (
      this.translations[language]?.[key] ||
      this.translations[this.defaultLanguage]?.[key] ||
      this.translations[this.sourceLanguage]?.[key] ||
      key
    );
  }

  init() {
    if (!this.data || !this.languages.length) return;

    this.createSwitcher();
    this.applyLanguage(this.currentLanguage, false);
  }

  createSwitcher() {
    this.switcher = document.createElement('div');
    this.switcher.className = 'language-switcher';
    this.switcher.dataset.languageSwitcher = '';

    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'language-toggle';
    this.toggleButton.type = 'button';
    this.toggleButton.setAttribute('aria-haspopup', 'listbox');
    this.toggleButton.setAttribute('aria-expanded', 'false');

    this.menu = document.createElement('div');
    this.menu.className = 'language-menu';
    this.menu.role = 'listbox';
    this.menu.hidden = true;

    this.toggleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setMenuOpen(this.menu.hidden);
    });

    this.languages.forEach((language) => {
      const option = document.createElement('button');
      option.className = 'language-option';
      option.type = 'button';
      option.role = 'option';
      option.dataset.language = language.code;
      option.innerHTML = `
        <img class="language-flag" src="${this.resolveAsset(language.flag)}" alt="" aria-hidden="true" />
        <span class="language-option-label">${language.label}</span>
        <span class="language-option-name">${language.nativeName}</span>
      `;
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        this.applyLanguage(language.code);
        this.setMenuOpen(false);
        this.toggleButton.blur();
      });
      this.menu.append(option);
    });

    this.switcher.append(this.toggleButton, this.menu);
    document.body.append(this.switcher);

    document.addEventListener('click', () => {
      this.setMenuOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.setMenuOpen(false);
      }
    });
  }

  getLanguageMeta(languageCode) {
    return (
      this.languages.find((language) => language.code === languageCode) ||
      this.languages[0]
    );
  }

  setMenuOpen(isOpen) {
    if (!this.menu || !this.toggleButton) return;

    this.menu.hidden = !isOpen;
    this.switcher.classList.toggle('is-open', isOpen);
    this.toggleButton.setAttribute('aria-expanded', String(isOpen));
  }

  updateSwitcher() {
    const language = this.getLanguageMeta(this.currentLanguage);
    if (!language || !this.toggleButton || !this.menu) return;

    this.toggleButton.setAttribute('aria-label', this.t('common.toggle'));
    this.toggleButton.innerHTML = `
      <img class="language-flag" src="${this.resolveAsset(language.flag)}" alt="" aria-hidden="true" />
    `;

    this.menu.querySelectorAll('.language-option').forEach((option) => {
      const isSelected = option.dataset.language === this.currentLanguage;
      option.classList.toggle('is-active', isSelected);
      option.setAttribute('aria-selected', String(isSelected));
    });
  }

  applyLanguage(languageCode, persist = true) {
    if (!this.hasLanguage(languageCode)) return;

    this.currentLanguage = languageCode;
    document.documentElement.lang =
      languageCode === 'zh' ? 'zh-Hans' : languageCode;
    document.documentElement.dataset.lang = languageCode;
    document.querySelector('.deck')?.setAttribute('data-lang', languageCode);
    document.title = this.t('document.title');

    document.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = this.t(node.dataset.i18n);
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', this.t(node.dataset.i18nAriaLabel));
    });

    document.querySelectorAll('[data-i18n-alt]').forEach((node) => {
      node.setAttribute('alt', this.t(node.dataset.i18nAlt));
    });

    this.updateSwitcher();

    if (persist) {
      try {
        window.localStorage.setItem(this.storageKey, languageCode);
      } catch (error) {
        // Storage can be unavailable in restrictive browser modes.
      }
    }

    window.dispatchEvent(
      new CustomEvent('deck:languagechange', {
        detail: { language: languageCode },
      }),
    );
  }
}

window.DeckI18n = DeckI18n;
