import './scripts/asset-utils.js';

const pageParams = new URLSearchParams(window.location.search);
const isFreshLoad = pageParams.get('fresh') === '1';
const freshToken = String(Date.now());
const devFetchOptions = isFreshLoad ? { cache: 'reload' } : { cache: 'default' };
const { versionAssetRefs } = window.DeckAssetUtils;
let deckManifestPromise = null;
let deckStylesPromise = null;
let deckI18nPromise = null;

function withFreshParam(path) {
  if (!isFreshLoad) return path;

  const separator = String(path).includes('?') ? '&' : '?';
  return `${path}${separator}fresh=${freshToken}`;
}

async function fetchText(path) {
  const response = await fetch(withFreshParam(path), devFetchOptions);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  }

  return response.text();
}

async function fetchJson(path) {
  return JSON.parse(await fetchText(path));
}

function injectDeckAssetData(manifest) {
  if (document.getElementById('deck-assets-data')) return;

  const script = document.createElement('script');
  script.type = 'application/json';
  script.id = 'deck-assets-data';
  script.textContent = JSON.stringify(manifest);
  document.head.append(script);
}

export async function loadDeckManifest() {
  if (deckManifestPromise) return deckManifestPromise;

  deckManifestPromise = fetchJson('src/manifest.json');
  return deckManifestPromise;
}

export async function loadDeckStyles() {
  if (deckStylesPromise) return deckStylesPromise;

  deckStylesPromise = (async () => {
    let css = '';
    const deckManifest = await loadDeckManifest();
    injectDeckAssetData(deckManifest);

    try {
      const response = await fetch(
        withFreshParam('src/styles/manifest.json'),
        devFetchOptions,
      );
      if (!response.ok) {
        throw new Error(
          `Не удалось загрузить src/styles/manifest.json: ${response.status}`,
        );
      }

      const manifest = await response.json();
      const files = manifest.files ?? [];

      if (!Array.isArray(files) || !files.length) {
        throw new Error('src/styles/manifest.json не содержит список files');
      }

      css = (
        await Promise.all(files.map((file) => fetchText(`src/${file}`)))
      ).join('\n');
    } catch (error) {
      if (!String(error.message).includes('src/styles/manifest.json')) {
        throw error;
      }

      const fallbackLink = document.createElement('link');
      fallbackLink.rel = 'stylesheet';
      fallbackLink.href = withFreshParam('src/styles.css');
      document.head.append(fallbackLink);
      return;
    }

    const style = document.createElement('style');
    style.dataset.deckStyles = 'loaded';
    style.textContent = versionAssetRefs(css, deckManifest);
    document.head.append(style);
  })();

  return deckStylesPromise;
}

export async function loadDeckI18n() {
  if (deckI18nPromise) return deckI18nPromise;

  deckI18nPromise = (async () => {
    const response = await fetch(
      withFreshParam('src/i18n/manifest.json'),
      devFetchOptions,
    );

    if (!response.ok) {
      throw new Error(
        `Не удалось загрузить src/i18n/manifest.json: ${response.status}`,
      );
    }

    const manifest = await response.json();
    const translations = {};

    await Promise.all(
      (manifest.languages ?? []).map(async (language) => {
        const file = language.file || `${language.code}.json`;
        const languageResponse = await fetch(
          withFreshParam(`src/i18n/${file}`),
          devFetchOptions,
        );

        if (!languageResponse.ok) {
          throw new Error(
            `Не удалось загрузить src/i18n/${file}: ${languageResponse.status}`,
          );
        }

        translations[language.code] = await languageResponse.json();
      }),
    );

    const script = document.createElement('script');
    script.type = 'application/json';
    script.id = 'deck-i18n-data';
    script.textContent = JSON.stringify({ ...manifest, translations });
    document.head.append(script);
  })();

  return deckI18nPromise;
}

export async function loadDeckSlides() {
  const deck = document.querySelector('[data-deck-root]');
  if (!deck) {
    throw new Error('Не найден контейнер [data-deck-root]');
  }

  const manifest = await loadDeckManifest();
  injectDeckAssetData(manifest);

  const slides = await Promise.all(
    manifest.slides.map(async (slide) => {
      const slideResponse = await fetch(
        withFreshParam(`src/${slide.file}`),
        devFetchOptions,
      );

      if (!slideResponse.ok) {
        throw new Error(`Не удалось загрузить ${slide.file}`);
      }

      return versionAssetRefs(await slideResponse.text(), manifest);
    }),
  );

  deck.innerHTML = slides.join('\n\n');
  return manifest;
}

let deckScriptsPromise = null;

export async function loadDeckScripts() {
  if (deckScriptsPromise) return deckScriptsPromise;

  deckScriptsPromise = (async () => {
  const manifest = await fetchJson('src/scripts/manifest.json');

  for (const file of manifest.files || []) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = withFreshParam(`src/${file}`);
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Не удалось загрузить src/${file}`));
      document.body.append(script);
    });
  }
  })();

  return deckScriptsPromise;
}
