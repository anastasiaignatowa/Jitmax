import { createRequire } from 'node:module';
import { access, readdir, readFile } from 'node:fs/promises';
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

const allowedLatinWords = new Set([
  'Bebas',
  'Neue',
  'Geologica',
  'Jitmax',
  'Group',
  'Madison',
  'Park',
  'THB',
  'CAPEX',
  'OPEX',
  'EBITDA',
  'ROI',
  'MIN',
  'BASE',
  'MAX',
  'LED',
  'F',
  'B',
]);

function normalizeLatinWord(word) {
  return word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readSource(relativePath) {
  return readFile(path.join(srcDir, relativePath), 'utf8');
}

async function readOptionalJson(relativePath) {
  try {
    return JSON.parse(await readSource(relativePath));
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

async function readStyles() {
  const manifest = await readOptionalJson('styles/manifest.json');
  const sources = [];

  if (manifest?.files?.length) {
    for (const file of manifest.files) {
      sources.push({
        label: file,
        text: await readSource(file),
      });
    }
    return sources;
  }

  sources.push({
    label: 'styles.css',
    text: await readSource('styles.css'),
  });
  return sources;
}

async function readScriptSources() {
  const manifest = await readOptionalJson('scripts/manifest.json');
  const sources = [];

  for (const file of manifest?.files || []) {
    sources.push({
      label: file,
      text: await readSource(file),
    });
  }

  return sources;
}

async function readI18nSources(i18n) {
  const sources = [
    {
      label: 'i18n/manifest.json',
      text: JSON.stringify(i18n || {}),
    },
  ];

  for (const language of i18n?.languages || []) {
    const file = language.file || `${language.code}.json`;
    sources.push({
      label: `i18n/${file}`,
      text: await readSource(`i18n/${file}`),
    });
  }

  return sources;
}

function collectI18nKeys(slides) {
  const keys = new Set();
  const pattern = /\bdata-i18n(?:-[\w-]+)?=["']([^"']+)["']/gi;

  for (const slide of slides) {
    let match;
    while ((match = pattern.exec(slide.html))) {
      keys.add(match[1]);
    }
  }

  return [...keys].sort();
}

function stripHtml(text) {
  return text
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectLatinWarnings(slides) {
  const warnings = [];

  for (const slide of slides) {
    const visibleText = stripHtml(slide.html);
    const words = visibleText.match(/[A-Za-z][A-Za-z0-9&./+-]*/g) ?? [];
    const unexpected = [...new Set(words)].filter(
      (word) => !allowedLatinWords.has(normalizeLatinWord(word)),
    );

    if (unexpected.length) {
      warnings.push({
        slide: slide.id,
        words: unexpected.slice(0, 25),
      });
    }
  }

  return warnings;
}

function getAttributeValue(attributes, name) {
  const pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return attributes.match(pattern)?.[2] || '';
}

function hasAttribute(attributes, name) {
  const pattern = new RegExp(`(?:^|\\s)${name}(?:\\s*=|\\s|$)`, 'i');
  return pattern.test(attributes);
}

function collectTags(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
  return [...html.matchAll(pattern)].map((match) => match[1] || '');
}

function extractIndexSlideHtml(indexHtml, slideId) {
  const startPattern = new RegExp(
    `<section\\b(?=[^>]*\\bid=["']${slideId}["'])`,
    'i',
  );
  const startMatch = startPattern.exec(indexHtml);
  if (!startMatch) return '';

  const start = startMatch.index;
  const nextSection = indexHtml
    .slice(start + startMatch[0].length)
    .search(/<section\b[^>]*class=["'][^"']*\bslide\b/i);

  if (nextSection < 0) return indexHtml.slice(start);

  return indexHtml.slice(start, start + startMatch[0].length + nextSection);
}

function validateSlide4HubMedia(sourceHtml, indexHtml, scripts, styles, errors, warnings) {
  const scriptText = scripts.map((script) => script.text).join('\n');
  const styleText = styles.map((style) => style.text).join('\n');
  const slideHtmlByLabel = [
    ['src/slides/slide-04.html', sourceHtml],
    ['index.html#slide-4', extractIndexSlideHtml(indexHtml, 'slide-4')],
  ];

  if (/preloadNextHubCardMedia|preloadHubCardMedia/.test(scriptText)) {
    errors.push(
      'Слайд 4: код снова содержит предварительную загрузку следующей hub-карточки',
    );
  }

  if (/is-video-deferred|prepareHubDeferredCard|clearHubDeferredCard/.test(scriptText)) {
    errors.push(
      'Слайд 4: код снова содержит deferred-постер вместо видео при hub-переходе',
    );
  }

  if (!/teardownHubSlideRuntime/.test(scriptText)) {
    errors.push('Слайд 4: не найден teardown runtime для освобождения hub-слайда');
  }

  if (!/this\.teardownHubSlideRuntime\?\.\(slide\)/.test(scriptText)) {
    errors.push('Слайд 4: releaseSlideMedia не вызывает teardown hub-слайда');
  }

  if (!/video\.closest\(['"]\.hub-modal['"]\)/.test(scriptText)) {
    errors.push('Слайд 4: общий media lifecycle не пропускает скрытое hub-modal video');
  }

  if (!/delete this\.hubModalVideo\.dataset\.src/.test(scriptText)) {
    errors.push('Слайд 4: releaseHubModalVideo не очищает временный data-src');
  }

  if (!/deck:hub-slide-teardown/.test(scriptText)) {
    errors.push('Слайд 4: не найдено событие teardown для таймеров hub-линии');
  }

  if (!/cancelAnimationFrame\(this\.hubAnimationFrame\)/.test(scriptText)) {
    errors.push('Слайд 4: teardown не отменяет requestAnimationFrame hub-перехода');
  }

  if (!/ownerSlide && !ownerSlide\.classList\.contains\('visible'\)/.test(scriptText)) {
    errors.push('Слайд 4: sequence handlers не защищены от невидимого слайда');
  }

  if (!/HUB_RAIN_ROOM_RETURN_LEAD_MS\s*=\s*1200/.test(scriptText)) {
    errors.push('Слайд 4: второй ролик rain room должен уходить за 1,2 секунды до конца');
  }

  if (
    !/const firstSceneHold = this\.getValueVideoSceneHold\?\.\(video,\s*0\) \|\| 4/.test(
      scriptText,
    ) ||
    !/\(video\.currentTime \|\| 0\) < firstSceneHold/.test(scriptText)
  ) {
    errors.push('Слайд 4: desktop Rain room должен читать 4-секундный порог из data-sequence-scene-holds');
  }

  if (!/scheduleHubRainRoomReturn/.test(scriptText)) {
    errors.push('Слайд 4: не найден ранний возврат второго ролика rain room');
  }

  if (!/hubRainRoomReturnMetadataCleanup/.test(scriptText)) {
    errors.push('Слайд 4: loadedmetadata-обработчик rain room должен сниматься при отмене временного видео');
  }

  if (!/this\.hubRainRoomState !== ['"]expanded-second['"]/.test(scriptText)) {
    errors.push('Слайд 4: finishHubRainRoomFeature не защищен от повторного запуска');
  }

  if (!/data-hub-rain-room/.test(scriptText) || !/scenes\.slice\(0,\s*1\)/.test(scriptText)) {
    errors.push('Слайд 4: модальное окно должно брать только первый ролик rain room');
  }

  if (!/verifyInactiveSlideMediaReleased/.test(scriptText)) {
    errors.push('Слайд 4: после выезда следующего слайда нет проверки очистки предыдущих медиа');
  }

  if (!/\.hub-rain-feature-layer/.test(scriptText)) {
    errors.push('Слайд 4: проверка загруженных медиа не учитывает временный слой rain room');
  }

  if (!/video\.dataset\.poster\s*=\s*normalizeMediaPath\(poster\)/.test(scriptText)) {
    errors.push('Медиа: poster не сохраняется в data-poster перед освобождением');
  }

  if (!/video\.setAttribute\(['"]poster['"],\s*resolveMediaAsset\(posterSource\)\)/.test(scriptText)) {
    errors.push('Медиа: poster не восстанавливается из data-poster при повторной загрузке');
  }

  if (!/video\.removeAttribute\(['"]poster['"]\)/.test(scriptText)) {
    errors.push('Медиа: releaseVideoSourceElement не снимает poster');
  }

  if (!/video\[poster\]/.test(scriptText)) {
    errors.push('Медиа: проверка загруженных медиа не учитывает video[poster]');
  }

  if (
    !/disposeMediaRuntime/.test(scriptText) ||
    !/addEventListener\(['"]pagehide['"]/.test(scriptText) ||
    !/addEventListener\(['"]pageshow['"]/.test(scriptText)
  ) {
    errors.push('Медиа: рантайм должен освобождать видео и таймеры при уходе со страницы и восстанавливаться при возврате');
  }

  if (!/deck:hub-card-video-open/.test(scriptText)) {
    errors.push('Слайд 4: строка Onsen/Yoga не привязана к открытию видео карточки');
  }

  if (!/deck:hub-card-transition-start/.test(scriptText)) {
    errors.push('Слайд 4: строка Onsen/Yoga не получает событие начала обратного перехода');
  }

  if (!/is-hub-line-segment-visible/.test(scriptText) || !/is-hub-line-segment-visible/.test(indexHtml)) {
    errors.push('Слайд 4: сегменты строки Onsen/Yoga должны открываться классом состояния');
  }

  if (!/is-hub-line-follow-visible/.test(scriptText) || !/is-hub-line-follow-visible/.test(indexHtml)) {
    errors.push('Слайд 4: следующий текст после коворкинга должен открываться классом состояния');
  }

  if (!/is-hub-line-complete/.test(scriptText) || !/is-hub-line-complete/.test(indexHtml)) {
    errors.push('Слайд 4: punchline должен открываться после завершения списка сценариев');
  }

  if (/--hub-punchline-reveal-delay/.test(scriptText) || /--hub-punchline-reveal-delay/.test(indexHtml)) {
    errors.push('Слайд 4: punchline снова зависит от старой расчетной задержки');
  }

  if (
    /hub-title-rest-ink/.test(scriptText) ||
    /hub-title-rest-ink-write/.test(styleText) ||
    /Great Vibes|Dancing Script|Allison|Charm|The Nautigal|MonteCarlo/.test(styleText)
  ) {
    errors.push('Слайд 4: каллиграфический шрифт и сборка рукописной строки должны быть убраны');
  }

  if (/family=(Great\+Vibes|Dancing\+Script|Allison|Charm|The\+Nautigal|MonteCarlo)(?:&|%26|:)/.test(indexHtml)) {
    errors.push('Слайд 4: собранный HTML не должен подключать каллиграфический script-шрифт');
  }

  if (
    /(is-hub-title-sequenced|hub-title-lead|hub-title-rest|hub-title-measure|hub-title-line|hub-title-line-mask|hub-title-line-underline-sweep)/.test(
      sourceHtml + scriptText + styleText,
    ) ||
    /slides\.04\.title\.rest/.test(scriptText)
  ) {
    errors.push('Слайд 4: заголовок должен быть одним обычным reveal-блоком без отдельной маски');
  }

  if (!/\.hub-title\s*\{[\s\S]*white-space:\s*pre-line/.test(styleText)) {
    errors.push('Слайд 4: desktop-заголовок должен переносить Several reasons на новую строку через pre-line');
  }

  if (!/Один центр\.\s*\n\s*Несколько причин\s*\n\s*прийти и остаться\./.test(sourceHtml)) {
    errors.push('Слайд 4: fallback-текст заголовка должен содержать переносы перед второй и третьей фразой');
  }

  if (
    /value-title-char/.test(scriptText) ||
    /value-title-char/.test(styleText) ||
    /value-title-char-print/.test(styleText) ||
    /value-char-delay/.test(scriptText) ||
    /(titleLine01|titleLine02|slides\.08\.title\.line01|slides\.08\.title\.line02|value-title-line01|value-title-line02|value-title-mask-reveal|value-title-sweep|value-title-underline)/.test(
      scriptText + styleText + indexHtml,
    )
  ) {
    errors.push('Слайд 8: заголовок должен быть одним обычным reveal-блоком без отдельной сборки строк');
  }

  const slide8TitleBlock =
    extractIndexSlideHtml(indexHtml, 'slide-8').match(
      /<h2\b[^>]*class=["'][^"']*\bvalue-title\b[^>]*>[\s\S]*?<\/h2>/i,
    )?.[0] || '';

  if (!/data-i18n=["']slides\.08\.title["']/.test(slide8TitleBlock) || /<span\b/i.test(slide8TitleBlock)) {
    errors.push('Слайд 8: value-title должен брать единый ключ slides.08.title без внутренних span');
  }

  if (
    !/--hub-slider-reveal-delay/.test(scriptText) ||
    !/hub-slider-expand-from-line/.test(styleText) ||
    !/\.slide\.hub-slide\.visible\s+\.hub-slider\.reveal/.test(styleText)
  ) {
    errors.push('Слайд 4: блок с видео должен раскрываться из линии после заголовка');
  }

  if (/items\.push\(bridgeMatch\[1\]\)/.test(scriptText)) {
    errors.push('Слайд 4: фраза после коворкинга снова стала отдельным сегментом без карточки');
  }

  if (!/!slide\.classList\.contains\(['"]visible['"]\)/.test(scriptText)) {
    errors.push('Слайд 4: обработчик открытия видео должен игнорировать невидимый слайд');
  }

  if (!/activeCard\?\.classList\.contains\(['"]is-active['"]\)/.test(scriptText)) {
    errors.push('Слайд 4: обработчик открытия видео должен проверять активную карточку');
  }

  for (const [label, html] of slideHtmlByLabel) {
    if (!html) {
      errors.push(`Слайд 4: не найден фрагмент ${label}`);
      continue;
    }

    const hubCardBlocks = [
      ...html.matchAll(
        /<article\b(?=[^>]*class=["'][^"']*\bhub-card\b)[\s\S]*?<\/article>/gi,
      ),
    ].map((match) => match[0] || '');
    const hubCards = html.match(/<article\b[^>]*class=["'][^"']*\bhub-card\b/gi) || [];
    const videoBlocks = [
      ...html.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi),
    ];
    const videos = videoBlocks.map((match) => match[1] || '');
    const sources = collectTags(html, 'source');
    const dataSrcSources = sources.filter((attrs) => hasAttribute(attrs, 'data-src'));
    const lastHubCardBlock = hubCardBlocks.at(-1) || '';

    if (hubCards.length !== 15) {
      errors.push(`Слайд 4: ${label} содержит ${hubCards.length} hub-карточек вместо 15`);
    }

    if (!/slides\.04\.card13\.title/.test(lastHubCardBlock)) {
      errors.push(`Слайд 4: ${label} последняя hub-карточка должна быть коворкингом`);
    }

    if (/data-hub-advance-after-scenes/.test(lastHubCardBlock)) {
      errors.push(`Слайд 4: ${label} коворкинг не должен ждать следующего video-sequence события`);
    }

    if (videos.length !== hubCards.length) {
      errors.push(
        `Слайд 4: ${label} содержит ${videos.length} видео на ${hubCards.length} hub-карточек`,
      );
    }

    videos.forEach((attrs, index) => {
      if (hasAttribute(attrs, 'src')) {
        errors.push(`Слайд 4: ${label} video #${index + 1} содержит ранний src`);
      }

      if (getAttributeValue(attrs, 'preload').toLowerCase() === 'auto') {
        errors.push(
          `Слайд 4: ${label} video #${index + 1} содержит preload="auto"`,
        );
      }
    });

    sources.forEach((attrs, index) => {
      if (hasAttribute(attrs, 'src')) {
        errors.push(`Слайд 4: ${label} source #${index + 1} содержит ранний src`);
      }
    });

    if (dataSrcSources.length !== videos.length) {
      errors.push(
        `Слайд 4: ${label} содержит ${dataSrcSources.length} source[data-src] на ${videos.length} видео`,
      );
    }

    videoBlocks.forEach((match, index) => {
      const attrs = match[1] || '';
      const body = match[2] || '';
      const isRainRoom = hasAttribute(attrs, 'data-hub-rain-room');
      const scenes = getAttributeValue(attrs, 'data-scenes')
        .split('|')
        .map((scene) => normalizeAssetPath(scene))
        .filter(Boolean);
      const sceneHolds = getAttributeValue(attrs, 'data-sequence-scene-holds')
        .split(/[|,]/)
        .map((hold) => Number.parseFloat(hold.trim()))
        .filter((hold) => Number.isFinite(hold));
      const sourceDataSrc = normalizeAssetPath(
        getAttributeValue(body.match(/<source\b([^>]*)>/i)?.[1] || '', 'data-src'),
      );

      if (!isRainRoom) {
        sceneHolds.forEach((hold) => {
          if (hold > 0 && hold < 4) {
            errors.push(
              `Слайд 4: ${label} video #${index + 1} содержит смену ролика короче 4 секунд`,
            );
          }
        });
      }

      if (scenes.length && sourceDataSrc && scenes[0] !== sourceDataSrc) {
        errors.push(
          `Слайд 4: ${label} video #${index + 1} первая сцена не совпадает с source[data-src]`,
        );
      }
    });
  }
}

function validateQueuedPresentationTasks(slides, indexHtml, scripts, styles, errors) {
  const scriptText = scripts.map((script) => script.text).join('\n');
  const styleText = styles.map((style) => style.text).join('\n');
  const slide3Source = slides.find((slide) => slide.id === 'slide-3')?.html || '';
  const slide3Index = extractIndexSlideHtml(indexHtml, 'slide-3');
  const slide3Html = `${slide3Source}\n${slide3Index}`;
  const slide4Source = slides.find((slide) => slide.id === 'slide-4')?.html || '';
  const slide4Index = extractIndexSlideHtml(indexHtml, 'slide-4');
  const slide4Html = `${slide4Source}\n${slide4Index}`;
  const slide5Source = slides.find((slide) => slide.id === 'slide-5')?.html || '';
  const slide5Index = extractIndexSlideHtml(indexHtml, 'slide-5');
  const slide5Html = `${slide5Source}\n${slide5Index}`;

  if (
    /(splitTitleParts|scenario-title-lead|scenario-title-rest|scenario-title-measure|scenario-title-line|scenarioTitleLineRevealDesktop|is-scenario-title-sequenced)/.test(
      scriptText + styleText + slide5Html,
    )
  ) {
    errors.push('Слайд 5: заголовок должен быть одним обычным reveal-блоком без отдельной маски');
  }

  if (!/\.scenario-title\s*\{[\s\S]*white-space:\s*pre-line/.test(styleText)) {
    errors.push('Слайд 5: desktop-заголовок должен переносить вторую фразу на новую строку через pre-line');
  }

  if (!/Сценарий меняется\.\s*\n\s*Назначение зоны остается\./.test(slide5Html)) {
    errors.push('Слайд 5: fallback-текст заголовка должен содержать перенос перед второй фразой');
  }

  const participationModalBlock =
    styleText.match(/\.participation-modal\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
  const participationModalCloseBlocks = [
    ...styleText.matchAll(/\.participation-modal-close(?::hover|:focus-visible)?\s*\{[\s\S]*?\n\s*\}/g),
  ]
    .map((match) => match[0])
    .join('\n');

  if (
    /rgba\(4,\s*24,\s*20|rgba\(0,\s*7,\s*9|rgba\(2,\s*10,\s*12|rgba\(4,\s*20,\s*20/.test(
      `${participationModalBlock}\n${participationModalCloseBlocks}`,
    )
  ) {
    errors.push('Слайд 11: модальное затемнение и кнопка закрытия не должны уходить в зеленый оттенок');
  }

  if (
    !/@media\s*\(min-width:\s*761px\)[\s\S]*\.participation-stage-number,\s*\.participation-stage-title,\s*\.participation-stage-copy\s*\{[\s\S]*font-size\s+560ms var\(--ease-out-expo\)/.test(
      styleText,
    )
  ) {
    errors.push('Слайд 11: desktop-текст табов должен плавно менять размер вместе с плашкой');
  }

  if (
    !/\.definition-content::before,\s*\.definition-content::after\s*\{[\s\S]*transform:\s*translate3d\(calc\(-100% - var\(--definition-panel-bleed-right\)\),\s*0,\s*0\)/.test(
      styleText,
    ) ||
    !/\.slide\.definition-slide\.visible \.definition-content::before,\s*\.slide\.definition-slide\.visible \.definition-content::after\s*\{[\s\S]*transition-delay:\s*0\.08s/.test(
      styleText,
    )
  ) {
    errors.push('Слайд 3: desktop-плашка должна заметно выезжать слева перед текстом');
  }

  if (
    !/\.slide\.definition-slide\.visible \.definition-title\.reveal\s*\{[\s\S]*transition-delay:\s*0\.56s/.test(
      styleText,
    ) ||
    !/\.slide\.definition-slide\.visible[\s\S]*\.definition-content[\s\S]*>\s*\.kicker\.reveal\s*\{[\s\S]*transition-delay:\s*0\.92s/.test(
      styleText,
    )
  ) {
    errors.push('Слайд 3: desktop-порядок должен быть плашка, затем заголовок, затем Format definition с декором');
  }

  if (
    /<video\b(?=[^>]*class=["'][^"']*\bdefinition-video\b)[^>]*poster=["']assets\/slide-03-scene-01\.png["']/.test(
      slide3Html,
    )
  ) {
    errors.push('Слайд 3: definition-video не должен показывать постер, совпадающий с кадром слайда 11');
  }

  if (
    !/startDefinitionVideoCrossfade\(video,\s*scenes,\s*nextIndex\)/.test(scriptText) ||
    !/startDefinitionVideoCrossfade\(video,\s*scenes,\s*nextIndex\)[\s\S]*if \(video\.dataset\.sequenceTransition === ['"]crossfade['"]\)/.test(
      scriptText,
    ) ||
    !/startDefinitionVideoCrossfade\(video,\s*scenes,\s*nextIndex\)[\s\S]*definition-video-loop-layer/.test(
      scriptText,
    )
  ) {
    errors.push('Слайд 3: смена сцен definition-video должна идти через готовый временный слой, а не прямую замену src');
  }

  if (!/\.definition-chip:nth-child\(2\)\s*\{[\s\S]*--definition-chip-delay:\s*3s/.test(styleText)) {
    errors.push('Слайд 3: чип LED-пол должен появляться на 3 секунды позже готовности второй сцены');
  }

  if (
    !/\.slide\.value-slide \.value-copy > \.value-title\.reveal\s*\{[\s\S]*transform:\s*translateX\(clamp\(2rem,\s*5vw,\s*5rem\)\)/.test(
      styleText,
    ) ||
    !/\.slide\.value-slide\.visible \.value-copy > \.value-title\.reveal\s*\{[\s\S]*animation:\s*value-kicker-slide-in\s+660ms\s+0\.28s/.test(
      styleText,
    )
  ) {
    errors.push('Слайд 8: desktop-заголовок должен снова выезжать отдельной reveal-анимацией');
  }

  if (
    !/assets\/slide-10-background-20260606\.png/.test(indexHtml) ||
    /<img\b(?=[^>]*class=["'][^"']*\blaunch-image\b)[^>]*src=["']assets\/slide-10-background-20260529-v2\.png["']/.test(
      indexHtml,
    )
  ) {
    errors.push('Слайд 10: фоном должна быть новая картинка slide-10-background-20260606.png');
  }

  if (!/--launch-image-stop-offset:\s*450px/.test(styleText)) {
    errors.push('Слайд 10: финальное кадрирование картинки должно быть сдвинуто вправо на 150px от прежней позиции');
  }

  if (
    !/data-hub-rain-room/.test(slide4Html) ||
    !/data-scenes=["']assets\/slide-04-rain-room\.mp4\|assets\/Max_taking_selfie_LED_screen_202605312032 1\.mp4["'][\s\S]*data-sequence-scene-holds=["']4["']/.test(
      slide4Html,
    )
  ) {
    errors.push('Слайд 4: первый Rain room ролик должен играть 4 секунды перед полноэкранным роликом');
  }

  if (!/scenario-card-event[\s\S]*data-scenario-swipe/.test(slide5Html)) {
    errors.push('Слайд 5: event-карточка должна поддерживать свайп внутри видео-рамки');
  }

  const canRunScenarioCardVideoBlock =
    scriptText.match(/const canRunScenarioCardVideo = \(card\) => \{[\s\S]*?\n\s*\};/)?.[0] ||
    '';
  if (
    !/scenarioCard !== ['"]event['"]/.test(canRunScenarioCardVideoBlock) ||
    !/scenarioCard === ['"]yoga['"]/.test(canRunScenarioCardVideoBlock) ||
    !/slide\?\.classList\.contains\(secondPositionClass\)/.test(
      canRunScenarioCardVideoBlock,
    ) ||
    !/\(min-width:\s*861px\)/.test(canRunScenarioCardVideoBlock) ||
    !/desktopOnly:\s*card\.dataset\.scenarioCard === ['"]event['"]/.test(scriptText) ||
    !/visualOnly:\s*card\.dataset\.scenarioCard === ['"]event['"]/.test(scriptText)
  ) {
    errors.push('Слайд 5: event-видео должно запускаться только на desktop после появления event-блока');
  }

  if (
    !/\.scenario-card\[data-scenario-swipe\]/.test(styleText) ||
    !/scenario-card-yoga\[data-scenario-swipe\][\s\S]*touch-action:\s*pan-y/.test(styleText)
  ) {
    errors.push('Слайд 5: desktop swipe-стили должны быть общими, а мобильный touch-action должен остаться у yoga');
  }

  if (!/resolvedScenes\.length < 2 && !button\.dataset\.scenarioNextMode/.test(scriptText)) {
    errors.push('Слайд 5: одиночные event-видео не должны перезапускаться по yoga-таймеру');
  }

  if (
    !/if \(slide\.classList\.contains\(secondPositionClass\)\) \{[\s\S]*clearScenarioCardVideo\(slide\.querySelector\(['"]\.scenario-card-yoga['"]\)\);[\s\S]*return;[\s\S]*\}/.test(
      scriptText,
    ) ||
    !/startScenarioEventVideo\(\{ restart: true \}\);/.test(scriptText) ||
    !/clearScenarioCardVideo\(slide\.querySelector\(['"]\.scenario-card-yoga['"]\)\);\s*startScenarioEventVideo\(\{ restart \}\);\s*return;/.test(
      scriptText,
    ) ||
    !/querySelectorAll\(['"]\.scenario-card-yoga['"]\)/.test(
      scriptText,
    ) ||
    /querySelectorAll\(['"]\.scenario-card-yoga,\s*\.scenario-card-event['"]\)/.test(
      scriptText,
    ) ||
    !/animateScenarioCardFlip\(yogaCard,\s*firstRect,\s*lastRect\);\s*clearScenarioCardVideo\(yogaCard\);/.test(
      scriptText,
    )
  ) {
    errors.push('Слайд 5: после перехода к залу событий yoga-видео должно выгружаться, а event-видео стартовать сразу');
  }

  const scenarioModalScript =
    scripts.find((script) => /scenario-modal\.js$/.test(script.label))?.text || '';
  if (
    !/scenarioModalVideoStartTimer/.test(scenarioModalScript) ||
    !/video\.preload = ['"]metadata['"]/.test(scenarioModalScript) ||
    !/video\.setAttribute\(['"]preload['"],\s*['"]metadata['"]\)/.test(
      scenarioModalScript,
    ) ||
    !/window\.setTimeout\([\s\S]*video\.preload = ['"]auto['"][\s\S]*video\.play\(\)[\s\S]*,\s*220\)/.test(
      scenarioModalScript,
    ) ||
    /video\.autoplay\s*=\s*true/.test(scenarioModalScript)
  ) {
    errors.push('Слайд 5: видео в модалке должно стартовать отложенно, без autoplay и preload auto на первом кадре');
  }

  const visibilityHandler =
    scriptText.match(/document\.addEventListener\(['"]visibilitychange['"][\s\S]*?\n\s*\}\);/)?.[0] ||
    '';
  if (/applySlideState/.test(visibilityHandler)) {
    errors.push('Слайд 11: возврат на вкладку не должен вызывать полный applySlideState');
  }

  if (!/pauseActiveSlideMediaForVisibility/.test(scriptText) || !/resumeActiveSlideMedia/.test(scriptText)) {
    errors.push('Слайд 11: возврат на вкладку должен точечно ставить активные видео на паузу и возобновлять их');
  }

  const participationStart = scriptText.indexOf(
    "document.querySelector('[data-participation-slide]')",
  );
  const participationScript =
    participationStart >= 0 ? scriptText.slice(participationStart) : scriptText;
  const closeModalStart = participationScript.indexOf(
    'function closeModal(instant = false)',
  );
  const cleanupStart = participationScript.indexOf(
    'function cleanup',
    closeModalStart,
  );
  const closeModalBlock =
    closeModalStart >= 0 && cleanupStart > closeModalStart
      ? participationScript.slice(closeModalStart, cleanupStart)
      : '';
  if (/startTimeline\(\)/.test(closeModalBlock)) {
    errors.push('Слайд 11: закрытие модали не должно перезапускать таймлайн');
  }

  if (!/nextVisible === isSlideVisible/.test(participationScript) || !/enterSlide\(\)/.test(participationScript)) {
    errors.push('Слайд 11: observer должен запускать сцену только при реальном входе на слайд');
  }
}

function collectManifestAssets(manifest) {
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

function collectSourceAssetRefs(sources) {
  const refs = new Map();

  for (const source of sources) {
    for (const ref of collectAssetRefs(source.text)) {
      const assetPath = normalizeAssetPath(ref);
      if (!assetPath.startsWith('assets/')) continue;

      if (!refs.has(assetPath)) refs.set(assetPath, new Set());
      refs.get(assetPath).add(source.label);
    }
  }

  return refs;
}

function formatMb(bytes = 0) {
  return `${(Number(bytes || 0) / 1024 / 1024).toFixed(2)} МБ`;
}

function getAssetBytes(asset) {
  return Number(asset?.bytes || 0);
}

function sumAssetBytes(assets) {
  return assets.reduce((sum, asset) => sum + getAssetBytes(asset), 0);
}

function printAssetReport(manifest, manifestAssets, sourceRefs, diskAssets) {
  const usedManifestAssets = [...manifestAssets.values()]
    .map((record) => record.asset)
    .filter((asset) => sourceRefs.has(normalizeAssetPath(asset.path)));
  const byKind = new Map();

  for (const asset of usedManifestAssets) {
    const kind = asset.kind || inferAssetKind(asset.path);
    byKind.set(kind, (byKind.get(kind) || 0) + getAssetBytes(asset));
  }

  console.log('Вес используемых ассетов по типам:');
  for (const [kind, bytes] of [...byKind.entries()].sort()) {
    console.log(`- ${kind}: ${formatMb(bytes)}`);
  }

  console.log('Вес по слайдам:');
  for (const slide of manifest.slides || []) {
    const assets = (slide.assets || []).filter((asset) =>
      sourceRefs.has(normalizeAssetPath(asset.path)),
    );
    console.log(`- ${slide.id}: ${formatMb(sumAssetBytes(assets))}`);
  }

  const topAssets = usedManifestAssets
    .sort((left, right) => getAssetBytes(right) - getAssetBytes(left))
    .slice(0, 10);

  console.log('Самые тяжелые ассеты:');
  for (const asset of topAssets) {
    console.log(`- ${formatMb(asset.bytes)} ${asset.path}`);
  }

  const diskRefs = new Set(diskAssets);
  const diskWithoutSource = [...diskRefs].filter((assetPath) => !sourceRefs.has(assetPath));
  const diskWithoutManifest = [...diskRefs].filter(
    (assetPath) => !manifestAssets.has(assetPath),
  );

  if (diskWithoutSource.length) {
    console.log(`Ассеты на диске без ссылок: ${diskWithoutSource.length}`);
    diskWithoutSource.slice(0, 20).forEach((assetPath) => {
      console.log(`- ${assetPath}`);
    });
  }

  if (diskWithoutManifest.length) {
    console.log(`Ассеты на диске вне манифеста: ${diskWithoutManifest.length}`);
    diskWithoutManifest.slice(0, 20).forEach((assetPath) => {
      console.log(`- ${assetPath}`);
    });
  }
}

async function main() {
  const errors = [];
  const warnings = [];
  const manifest = JSON.parse(await readSource('manifest.json'));
  const i18n = JSON.parse(await readSource('i18n/manifest.json'));
  const dictionaries = {};
  const styles = await readStyles();
  const scripts = await readScriptSources();
  const i18nSources = await readI18nSources(i18n);
  const indexHtml = await readFile(path.join(deckRoot, 'index.html'), 'utf8');
  const slides = [];

  for (const slide of manifest.slides) {
    const slidePath = path.join(srcDir, slide.file);
    if (!(await fileExists(slidePath))) {
      errors.push(`Нет файла слайда: ${slide.file}`);
      continue;
    }

    slides.push({
      ...slide,
      html: await readFile(slidePath, 'utf8'),
    });
  }

  const indexSlideCount = (indexHtml.match(/<section\b[^>]*class="[^"]*\bslide\b/gi) ?? [])
    .length;
  if (indexSlideCount !== manifest.slides.length) {
    errors.push(
      `Количество слайдов в index.html (${indexSlideCount}) не совпадает с manifest.json (${manifest.slides.length})`,
    );
  }

  if (!indexHtml.includes('id="deck-i18n-data"')) {
    errors.push('index.html не содержит встроенные данные переводов');
  }

  const manifestSlide4 = manifest.slides.find((slide) => slide.id === 'slide-4');
  const manifestSlide5 = manifest.slides.find((slide) => slide.id === 'slide-5');

  if (manifestSlide4?.title !== 'Один центр.\nНесколько причин\nприйти и остаться') {
    errors.push('Слайд 4: title в src/manifest.json должен содержать переносы перед второй и третьей фразой');
  }

  if (manifestSlide5?.title !== 'Сценарий меняется.\nНазначение зоны остается') {
    errors.push('Слайд 5: title в src/manifest.json должен содержать перенос перед второй фразой');
  }

  const languageCodes = (i18n.languages || []).map((language) => language.code);

  if (!languageCodes.includes(i18n.defaultLanguage)) {
    errors.push(`Язык по умолчанию отсутствует в languages: ${i18n.defaultLanguage}`);
  }

  if (!languageCodes.includes(i18n.sourceLanguage)) {
    errors.push(`Исходный язык отсутствует в languages: ${i18n.sourceLanguage}`);
  }

  for (const language of i18n.languages || []) {
    const file = language.file || `${language.code}.json`;
    try {
      dictionaries[language.code] = JSON.parse(await readSource(`i18n/${file}`));
    } catch (error) {
      errors.push(`Не удалось прочитать src/i18n/${file}: ${error.message}`);
    }
  }

  const i18nKeys = collectI18nKeys(slides);
  const i18nKeyRegistry = JSON.parse(await readSource('i18n/keys.json'));
  const registeredKeys = [...(i18nKeyRegistry.slideKeys || [])].sort();
  const staleRegisteredKeys = registeredKeys.filter(
    (key) => !i18nKeys.includes(key),
  );
  const unregisteredKeys = i18nKeys.filter(
    (key) => !registeredKeys.includes(key),
  );

  if (staleRegisteredKeys.length || unregisteredKeys.length) {
    errors.push(
      [
        staleRegisteredKeys.length
          ? `лишние ключи в src/i18n/keys.json: ${staleRegisteredKeys.slice(0, 20).join(', ')}`
          : null,
        unregisteredKeys.length
          ? `нет ключей в src/i18n/keys.json: ${unregisteredKeys.slice(0, 20).join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join('; '),
    );
  }

  const sourceDictionary = dictionaries[i18n.sourceLanguage] || {};
  const missingSourceKeys = i18nKeys.filter((key) => !sourceDictionary[key]);

  if (missingSourceKeys.length) {
    errors.push(
      `Нет исходных русских строк: ${missingSourceKeys.slice(0, 30).join(', ')}`,
    );
  }

  for (const languageCode of languageCodes.filter(
    (code) => code !== i18n.sourceLanguage,
  )) {
    const dictionary = dictionaries[languageCode] || {};
    const missingKeys = i18nKeys.filter((key) => !dictionary[key]);

    if (missingKeys.length) {
      warnings.push(
        `${languageCode}: не заполнено ${missingKeys.length} ключей перевода`,
      );
    }
  }

  const sourceRefs = collectSourceAssetRefs([
    ...slides.map((slide) => ({ label: slide.file, text: slide.html })),
    ...styles,
    ...scripts,
    ...i18nSources,
  ]);
  const manifestAssets = collectManifestAssets(manifest);

  for (const [assetPath, sources] of sourceRefs.entries()) {
    const assetFile = path.join(deckRoot, assetPath);
    if (!(await fileExists(assetFile))) {
      errors.push(`Нет ассета: ${assetPath}`);
    }

    if (!manifestAssets.has(assetPath)) {
      errors.push(
        `Ассет используется, но отсутствует в src/manifest.json: ${assetPath} (${[...sources].slice(0, 3).join(', ')})`,
      );
    }
  }

  for (const [assetPath, record] of manifestAssets.entries()) {
    if (!sourceRefs.has(assetPath) && !record.asset.unused) {
      warnings.push(`В манифесте есть ассет без ссылки: ${assetPath}`);
    }
  }

  const diskAssets = (await listFiles(path.join(deckRoot, 'assets'))).map((file) =>
    normalizeAssetPath(`assets/${path.relative(path.join(deckRoot, 'assets'), file)}`),
  );

  const latinWarnings = collectLatinWarnings(slides);
  const slide4 = slides.find((slide) => slide.id === 'slide-4');
  if (slide4) {
    validateSlide4HubMedia(slide4.html, indexHtml, scripts, styles, errors, warnings);
  } else {
    errors.push('Слайд 4: слайд отсутствует в manifest.json');
  }

  validateQueuedPresentationTasks(slides, indexHtml, scripts, styles, errors);

  if (errors.length) {
    console.error('Проверка не пройдена:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Структура проверена: ${manifest.slides.length} слайдов`);
  console.log('Ассеты проверены: локальные ссылки существуют и описаны в манифесте');
  printAssetReport(manifest, manifestAssets, sourceRefs, diskAssets);

  if (latinWarnings.length) {
    console.log('Предупреждения по видимому английскому тексту:');
    for (const warning of latinWarnings) {
      console.log(`- ${warning.slide}: ${warning.words.join(', ')}`);
    }
  }

  if (warnings.length) {
    console.log('Предупреждения:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
