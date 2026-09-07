import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const deckRoot = path.resolve(scriptsDir, '..');
const srcDir = path.join(deckRoot, 'src');
const { versionAssetRefs } = require('../src/scripts/asset-utils.js');

const headPreviewScript = `      const pageParams = new URLSearchParams(window.location.search);
      const previewSlide = pageParams.get('slide');
      if (previewSlide && pageParams.get('preview') === '1') {
        document.documentElement.dataset.previewSlide = previewSlide;
      }`;

async function readSource(relativePath) {
  return readFile(path.join(srcDir, relativePath), 'utf8');
}

async function readStyles(deckManifest) {
  try {
    const styleManifest = JSON.parse(await readSource('styles/manifest.json'));
    const files = styleManifest.files ?? [];

    if (!Array.isArray(files) || !files.length) {
      throw new Error('src/styles/manifest.json не содержит список files');
    }

    const parts = [];
    for (const file of files) {
      parts.push(await readSource(file));
    }

    return versionAssetRefs(parts.join('\n'), deckManifest);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return versionAssetRefs(await readSource('styles.css'), deckManifest);
    }

    throw error;
  }
}

async function readI18n(deckManifest) {
  const manifest = JSON.parse(await readSource('i18n/manifest.json'));
  const translations = {};

  for (const language of manifest.languages ?? []) {
    const file = language.file || `${language.code}.json`;
    translations[language.code] = JSON.parse(await readSource(`i18n/${file}`));
  }

  return versionAssetRefs(
    JSON.stringify({ ...manifest, translations }, null, 2),
    deckManifest,
  ).replace(/<\/script/gi, '<\\/script');
}

async function readDeckScripts() {
  const scriptManifest = JSON.parse(await readSource('scripts/manifest.json'));
  const files = scriptManifest.files ?? [];

  if (!Array.isArray(files) || !files.length) {
    throw new Error('src/scripts/manifest.json не содержит список files');
  }

  const parts = [];
  for (const file of files) {
    parts.push(await readSource(file));
  }

  return parts.join('\n');
}

function indentBlock(value, spaces) {
  const pad = ' '.repeat(spaces);
  return value
    .trimEnd()
    .split('\n')
    .map((line) => (line ? `${pad}${line}` : line))
    .join('\n');
}

async function main() {
  const manifest = JSON.parse(await readSource('manifest.json'));
  const styles = await readStyles(manifest);
  const i18n = await readI18n(manifest);
  const deckAssets = JSON.stringify(manifest, null, 2).replace(
    /<\/script/gi,
    '<\\/script',
  );
  const deckScript = await readDeckScripts();
  const slideHtml = [];

  for (const slide of manifest.slides) {
    slideHtml.push(versionAssetRefs((await readSource(slide.file)).trim(), manifest));
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Jitmax Group — HTML presentation</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Geologica:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&family=Russo+One&display=swap"
      rel="stylesheet"
    />
    <script>
${headPreviewScript}
    </script>
    <style>
${indentBlock(styles, 6)}
    </style>
    <script type="application/json" id="deck-i18n-data">
${indentBlock(i18n, 6)}
    </script>
    <script type="application/json" id="deck-assets-data">
${indentBlock(deckAssets, 6)}
    </script>
  </head>
  <body>
    <main class="deck">
${slideHtml.map((slide) => indentBlock(slide, 6)).join('\n\n')}
    </main>

    <script>
${indentBlock(deckScript, 6)}
    </script>
  </body>
</html>
`;

  await writeFile(path.join(deckRoot, 'index.html'), html, 'utf8');
  console.log(`Готово: index.html собран из ${manifest.slides.length} слайдов`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
