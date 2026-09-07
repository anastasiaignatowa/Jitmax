(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  root.DeckAssetUtils = api;
})(
  typeof globalThis !== 'undefined' ? globalThis : this,
  function createDeckAssetUtils() {
    const ASSET_REF_PATTERN =
      /assets\/[A-Za-z0-9._\-\/ ()]+\.(?:png|jpe?g|mp4|mp3|wav|svg|webp|gif)(?![A-Za-z0-9._\-\/ ()]*[?#])/gi;
    const ASSET_ATTR_PATTERN =
      /\b(?:src|poster|data-[\w-]+)=["']([^"']+)["']/gi;
    const CSS_URL_PATTERN = /url\((['"]?)([^'")]+)\1\)/gi;

    function stripAssetComments(value) {
      return String(value || '')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[\s;])\/\/[^\n\r]*/g, '$1 ');
    }

    function normalizeAssetPath(value) {
      return String(value || '')
        .replace(/\\/g, '/')
        .replace(/[?#].*$/, '')
        .replace(/^\.\//, '')
        .trim();
    }

    function isLocalAssetPath(value) {
      return normalizeAssetPath(value).startsWith('assets/');
    }

    function inferAssetKind(value) {
      const cleanPath = normalizeAssetPath(value).toLowerCase();
      if (/\.(mp4|webm|mov)$/.test(cleanPath)) return 'video';
      if (/\.(mp3|wav|ogg|m4a)$/.test(cleanPath)) return 'audio';
      if (/\.(png|jpe?g|svg|webp|gif)$/.test(cleanPath)) return 'image';
      return 'file';
    }

    function collectManifestAssets(manifest) {
      const assets = new Map();

      (manifest?.sharedAssets || []).forEach((asset) => {
        const path = normalizeAssetPath(asset?.path);
        if (path) assets.set(path, { asset, slideId: null });
      });

      (manifest?.slides || []).forEach((slide) => {
        (slide.assets || []).forEach((asset) => {
          const path = normalizeAssetPath(asset?.path);
          if (path) assets.set(path, { asset, slideId: slide.id || null });
        });
      });

      return assets;
    }

    function resolveAssetRef(value, manifestOrAssets) {
      const cleanPath = normalizeAssetPath(value);
      if (!cleanPath || !cleanPath.startsWith('assets/')) return value;
      if (String(value || '').includes('?v=')) return value;

      const assets =
        manifestOrAssets instanceof Map
          ? manifestOrAssets
          : collectManifestAssets(manifestOrAssets);
      const record = assets.get(cleanPath);
      const hash = record?.asset?.hash || record?.hash;

      return hash ? `${cleanPath}?v=${String(hash).slice(0, 12)}` : cleanPath;
    }

    function versionAssetRefs(value, manifestOrAssets) {
      const assets =
        manifestOrAssets instanceof Map
          ? manifestOrAssets
          : collectManifestAssets(manifestOrAssets);

      return String(value || '').replace(ASSET_REF_PATTERN, (match) =>
        resolveAssetRef(match, assets),
      );
    }

    function addRef(refs, value) {
      const cleanPath = normalizeAssetPath(value);
      if (
        cleanPath &&
        !cleanPath.startsWith('#') &&
        !cleanPath.startsWith('data:') &&
        !/^https?:\/\//i.test(cleanPath)
      ) {
        refs.add(cleanPath);
      }
    }

    function collectAssetRefs(value) {
      const refs = new Set();
      const text = stripAssetComments(value);
      let match;

      while ((match = ASSET_ATTR_PATTERN.exec(text))) {
        match[1].split('|').forEach((part) => addRef(refs, part));
      }

      while ((match = CSS_URL_PATTERN.exec(text))) {
        addRef(refs, match[2]);
      }

      while ((match = ASSET_REF_PATTERN.exec(text))) {
        addRef(refs, match[0]);
      }

      return [...refs];
    }

    return {
      ASSET_REF_PATTERN,
      collectAssetRefs,
      collectManifestAssets,
      inferAssetKind,
      isLocalAssetPath,
      normalizeAssetPath,
      resolveAssetRef,
      versionAssetRefs,
    };
  },
);
