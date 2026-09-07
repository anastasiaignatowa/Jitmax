import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const deckRoot = path.resolve(scriptsDir, '..');
const srcDir = path.join(deckRoot, 'src');
const sourceCssPath = path.join(srcDir, 'styles.css');

const sections = [
  { label: 'SLIDE 01:', file: 'styles/slides/slide-01.css' },
  { label: 'SLIDE 02:', file: 'styles/slides/slide-02.css' },
  { label: 'SLIDE 03:', file: 'styles/slides/slide-03.css' },
  { label: 'SLIDE 04:', file: 'styles/slides/slide-04.css' },
  { label: 'SLIDE 05:', file: 'styles/slides/slide-05.css' },
  { label: 'SLIDE 06:', file: 'styles/slides/slide-06.css' },
  { label: 'SLIDE 08:', file: 'styles/slides/slide-08.css' },
  { label: 'SLIDE 09:', file: 'styles/slides/slide-09.css' },
  { label: 'SLIDE 10:', file: 'styles/slides/slide-10.css' },
  { label: 'SLIDE 11:', file: 'styles/slides/slide-11.css' },
  { label: 'RESPONSIVE COMPOSITION', file: 'styles/responsive.css' },
  { label: 'KEYFRAMES', file: 'styles/animations.css' },
];

function getLineOffsets(value) {
  const lines = value.split(/(?<=\n)/);
  const offsets = [];
  let offset = 0;

  for (const line of lines) {
    offsets.push(offset);
    offset += line.length;
  }

  return { lines, offsets };
}

function findSectionStart(css, label) {
  const { lines, offsets } = getLineOffsets(css);
  const labelLine = lines.findIndex((line) => line.includes(label));

  if (labelLine === -1) {
    throw new Error(`Не найден CSS-раздел: ${label}`);
  }

  const commentStartLine = Math.max(0, labelLine - 1);
  return offsets[commentStartLine];
}

function normalizeBlock(value) {
  return `${value.trimEnd()}\n`;
}

function buildImportFile(files) {
  return [
    '/*',
    '  Файл-индекс для редакторов. Для правок используйте файлы из src/styles/.',
    '  Финальный index.html собирает CSS через src/styles/manifest.json.',
    '*/',
    ...files.map((file) => `@import url("./${file}");`),
    '',
  ].join('\n');
}

async function main() {
  const css = await readFile(sourceCssPath, 'utf8');

  if (!css.includes('SLIDE 01:')) {
    throw new Error(
      'src/styles.css уже не похож на цельный CSS-файл. Если стили уже разделены, повторный split не нужен.',
    );
  }

  const markers = sections.map((section) => ({
    ...section,
    start: findSectionStart(css, section.label),
  }));

  const files = ['styles/base.css', ...sections.map((section) => section.file)];
  const chunks = new Map();

  chunks.set('styles/base.css', normalizeBlock(css.slice(0, markers[0].start)));

  for (const [index, marker] of markers.entries()) {
    const next = markers[index + 1]?.start ?? css.length;
    chunks.set(marker.file, normalizeBlock(css.slice(marker.start, next)));
  }

  await mkdir(path.join(srcDir, 'styles', 'slides'), { recursive: true });

  for (const [relativePath, content] of chunks.entries()) {
    await writeFile(path.join(srcDir, relativePath), content, 'utf8');
  }

  await writeFile(
    path.join(srcDir, 'styles', 'manifest.json'),
    `${JSON.stringify({ files }, null, 2)}\n`,
    'utf8',
  );

  await writeFile(sourceCssPath, buildImportFile(files), 'utf8');

  console.log(`Готово: CSS разделен на ${files.length} файлов`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
