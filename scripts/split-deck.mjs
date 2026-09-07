import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const deckRoot = path.resolve(scriptsDir, '..');
const sourceHtmlPath = path.join(deckRoot, 'index.html');
const srcDir = path.join(deckRoot, 'src');
const slidesDir = path.join(srcDir, 'slides');
const force = process.argv.includes('--force');

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getRequiredMatch(value, pattern, description) {
  const match = value.match(pattern);
  if (!match) {
    throw new Error(`Не найден блок: ${description}`);
  }

  return match;
}

function extractSections(mainHtml) {
  const sections = [];
  const sectionPattern = /<section\b[\s\S]*?<\/section>/gi;
  let match;

  while ((match = sectionPattern.exec(mainHtml))) {
    sections.push(match[0]);
  }

  if (!sections.length) {
    throw new Error('Внутри <main class="deck"> не найдены секции слайдов');
  }

  return sections;
}

function normalizeSlideFileName(slideId) {
  const numberMatch = slideId.match(/^slide-(\d+)$/);
  if (!numberMatch) {
    return `${slideId}.html`;
  }

  return `slide-${numberMatch[1].padStart(2, '0')}.html`;
}

function getAttribute(html, name) {
  const pattern = new RegExp(`${name}="([^"]*)"`, 'i');
  return html.match(pattern)?.[1] ?? '';
}

function getText(html, pattern) {
  const match = html.match(pattern);
  if (!match) return '';

  return match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildManifestEntry(sectionHtml, index) {
  const id = getAttribute(sectionHtml, 'id');
  if (!id) {
    throw new Error(`У секции ${index + 1} нет id`);
  }

  const numberMatch = id.match(/^slide-(\d+)$/);
  const number = numberMatch ? Number(numberMatch[1]) : index + 1;
  const file = `slides/${normalizeSlideFileName(id)}`;
  const title =
    getAttribute(sectionHtml, 'aria-label') ||
    getText(sectionHtml, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
    getText(sectionHtml, /<h2\b[^>]*>([\s\S]*?)<\/h2>/i) ||
    `Слайд ${String(number).padStart(2, '0')}`;

  return {
    id,
    number,
    order: index + 1,
    title,
    file,
    status: 'READY',
    owner: 'unassigned',
    assets: [],
  };
}

async function main() {
  const manifestPath = path.join(srcDir, 'manifest.json');
  if (!force && (await fileExists(manifestPath))) {
    throw new Error(
      'src/manifest.json уже существует. Чтобы заново разнести index.html и перезаписать src, запустите: node scripts/split-deck.mjs --force',
    );
  }

  const html = await readFile(sourceHtmlPath, 'utf8');
  const styleMatch = getRequiredMatch(html, /<style>([\s\S]*?)<\/style>/i, 'style');
  const mainMatch = getRequiredMatch(
    html,
    /<main class="deck">([\s\S]*?)<\/main>/i,
    'main.deck',
  );
  const bodyScriptMatch = getRequiredMatch(
    html,
    /<\/main>\s*<script>([\s\S]*?)<\/script>\s*<\/body>/i,
    'основной script после main',
  );

  await mkdir(slidesDir, { recursive: true });

  const style = styleMatch[1].replace(/^\n/, '').replace(/\n\s*$/, '\n');
  const deckScript = bodyScriptMatch[1].replace(/^\n/, '').replace(/\n\s*$/, '\n');
  const sections = extractSections(mainMatch[1]);
  const manifest = [];

  await writeFile(path.join(srcDir, 'styles.css'), style, 'utf8');
  await writeFile(path.join(srcDir, 'deck.js'), deckScript, 'utf8');

  for (const [index, section] of sections.entries()) {
    const entry = buildManifestEntry(section, index);
    manifest.push(entry);
    await writeFile(path.join(srcDir, entry.file), `${section.trim()}\n`, 'utf8');
  }

  await writeFile(
    path.join(srcDir, 'manifest.json'),
    `${JSON.stringify({ slides: manifest }, null, 2)}\n`,
    'utf8',
  );

  console.log(`Готово: вынесено слайдов: ${manifest.length}`);
  console.log(`Слайды: ${manifest.map((entry) => entry.id).join(', ')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
