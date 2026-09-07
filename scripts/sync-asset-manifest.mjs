import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const deckRoot = path.resolve(scriptsDir, '..');
const srcDir = path.join(deckRoot, 'src');
const {
  collectAssetRefs,
  inferAssetKind,
  normalizeAssetPath,
} = require('../src/scripts/asset-utils.js');

async function readSource(relativePath) {
  return readFile(path.join(srcDir, relativePath), 'utf8');
}

async function readJsonSource(relativePath) {
  return JSON.parse(await readSource(relativePath));
}

async function readOptionalJsonSource(relativePath) {
  try {
    return await readJsonSource(relativePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function listFiles(dir) {
  const files = [];

  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await listFiles(fullPath)));
        continue;
      }

      files.push(fullPath);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return files;
}

async function hashFile(filePath) {
  const data = await readFile(filePath);
  return {
    bytes: data.length,
    hash: createHash('sha256').update(data).digest('hex'),
  };
}

function normalizeSlideId(value) {
  const number = Number(String(value || '').replace(/^0+/, '') || 0);
  return number ? `slide-${number}` : null;
}

function inferSlideIdFromPath(assetPath) {
  const match = normalizeAssetPath(assetPath).match(/(?:^|\/)slide-(\d{1,2})(?:[-_.]|$)/i);
  return match ? normalizeSlideId(match[1]) : null;
}

function slideIdFromStyleFile(file) {
  const match = normalizeAssetPath(file).match(/styles\/slides\/slide-(\d{1,2})\.css$/i);
  return match ? normalizeSlideId(match[1]) : null;
}

function addRefs(refsByPath, text, scope) {
  for (const ref of collectAssetRefs(text)) {
    const assetPath = normalizeAssetPath(ref);
    if (!assetPath.startsWith('assets/')) continue;

    if (!refsByPath.has(assetPath)) refsByPath.set(assetPath, new Set());
    refsByPath.get(assetPath).add(scope || 'shared');
  }
}

function getExistingAssets(manifest) {
  const assets = new Map();

  for (const asset of manifest.sharedAssets || []) {
    const assetPath = normalizeAssetPath(asset.path);
    if (assetPath) assets.set(assetPath, { asset, slideId: null });
  }

  for (const slide of manifest.slides || []) {
    for (const asset of slide.assets || []) {
      const assetPath = normalizeAssetPath(asset.path);
      if (assetPath) assets.set(assetPath, { asset, slideId: slide.id });
    }
  }

  return assets;
}

function getTargetSlideId(assetPath, scopes) {
  const slideScope = [...scopes].find((scope) => /^slide-\d+$/.test(scope));
  return slideScope || inferSlideIdFromPath(assetPath);
}

function cloneAsset(asset, sourceRef, isUsed) {
  const next = { ...asset };
  next.path = sourceRef.path;
  next.kind = sourceRef.kind;
  next.hash = sourceRef.hash;
  next.bytes = sourceRef.bytes;

  if (isUsed) {
    delete next.unused;
  } else {
    next.unused = true;
  }

  return next;
}

function sortAssets(assets) {
  return [...assets].sort((left, right) =>
    String(left.path).localeCompare(String(right.path), 'en'),
  );
}

async function collectRefs(manifest) {
  const refsByPath = new Map();

  for (const slide of manifest.slides || []) {
    addRefs(refsByPath, await readSource(slide.file), slide.id);
  }

  const stylesManifest = await readOptionalJsonSource('styles/manifest.json');
  if (stylesManifest?.files?.length) {
    for (const file of stylesManifest.files) {
      addRefs(refsByPath, await readSource(file), slideIdFromStyleFile(file) || 'style');
    }
  } else {
    addRefs(refsByPath, await readSource('styles.css'), 'style');
  }

  const scriptsManifest = await readOptionalJsonSource('scripts/manifest.json');
  for (const file of scriptsManifest?.files || []) {
    addRefs(refsByPath, await readSource(file), 'script');
  }

  const i18nManifest = await readOptionalJsonSource('i18n/manifest.json');
  addRefs(refsByPath, JSON.stringify(i18nManifest || {}), 'i18n');
  for (const language of i18nManifest?.languages || []) {
    const file = language.file || `${language.code}.json`;
    addRefs(refsByPath, await readSource(`i18n/${file}`), 'i18n');
  }

  return refsByPath;
}

async function buildSourceRef(assetPath) {
  const filePath = path.join(deckRoot, assetPath);
  const fileStats = await hashFile(filePath);

  return {
    path: assetPath,
    kind: inferAssetKind(assetPath),
    ...fileStats,
  };
}

async function main() {
  const manifestPath = path.join(srcDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const refsByPath = await collectRefs(manifest);
  const existingAssets = getExistingAssets(manifest);
  const sourceAssets = new Map();
  const errors = [];

  for (const assetPath of refsByPath.keys()) {
    try {
      sourceAssets.set(assetPath, await buildSourceRef(assetPath));
    } catch (error) {
      errors.push(`Нет ассета: ${assetPath}`);
    }
  }

  if (errors.length) {
    console.error('Синхронизация остановлена:');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  const nextSharedAssets = [];
  const nextSlideAssets = new Map(
    (manifest.slides || []).map((slide) => [slide.id, []]),
  );

  for (const [assetPath, record] of existingAssets.entries()) {
    const sourceRef = sourceAssets.get(assetPath);
    const sourceOrExisting = sourceRef || {
      ...record.asset,
      path: normalizeAssetPath(record.asset.path),
      kind: record.asset.kind || inferAssetKind(record.asset.path),
    };
    const nextAsset = cloneAsset(record.asset, sourceOrExisting, Boolean(sourceRef));

    if (record.slideId && nextSlideAssets.has(record.slideId)) {
      nextSlideAssets.get(record.slideId).push(nextAsset);
    } else {
      nextSharedAssets.push(nextAsset);
    }
  }

  let added = 0;
  for (const [assetPath, sourceRef] of sourceAssets.entries()) {
    if (existingAssets.has(assetPath)) continue;

    const targetSlideId = getTargetSlideId(assetPath, refsByPath.get(assetPath));
    const nextAsset = cloneAsset(sourceRef, sourceRef, true);
    added += 1;

    if (targetSlideId && nextSlideAssets.has(targetSlideId)) {
      nextSlideAssets.get(targetSlideId).push(nextAsset);
    } else {
      nextSharedAssets.push(nextAsset);
    }
  }

  manifest.sharedAssets = sortAssets(nextSharedAssets);
  manifest.slides = (manifest.slides || []).map((slide) => ({
    ...slide,
    assets: sortAssets(nextSlideAssets.get(slide.id) || []),
  }));

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const diskAssets = (await listFiles(path.join(deckRoot, 'assets'))).map((file) =>
    normalizeAssetPath(`assets/${path.relative(path.join(deckRoot, 'assets'), file)}`),
  );
  const unusedOnDisk = diskAssets.filter((assetPath) => !sourceAssets.has(assetPath));

  console.log(`Готово: manifest.json синхронизирован`);
  console.log(`Используемых ассетов: ${sourceAssets.size}`);
  console.log(`Добавлено в манифест: ${added}`);
  console.log(`Ассетов на диске без ссылок: ${unusedOnDisk.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
