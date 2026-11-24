import { createRansomCanvas } from '../lib/ransomText';
import { type CutContent, type CutPreview, loadCutContents, loadPageTitle, targetLink, youtubeThumbnails } from './comicContents';
import { COMIC_LAYOUT, type PlacedCut, placeCuts, type Point } from './comicLayout';
import contentsData from './contents.json';

/** `previews/`의 그림·영상 파일 이름 → 빌드된 주소 */
const PREVIEW_FILES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./previews/*', { query: '?url', import: 'default', eager: true }),
  ).map(([path, url]) => [path.slice('./previews/'.length), url]),
);

const SVG_NS = 'http://www.w3.org/2000/svg';

const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(4)}%`;

/** 컷 다각형을 컷 상자 기준 백분율 `clip-path`로 바꾼다. */
function clipPath(cut: PlacedCut): string {
  const { x, y, width, height } = cut.box;
  return `polygon(${cut.points.map(([px, py]) => `${percent(px - x, width)} ${percent(py - y, height)}`).join(', ')})`;
}

function previewElement(preview: CutPreview, title: string): HTMLElement {
  if (preview.kind === 'video') {
    const video = document.createElement('video');
    video.src = PREVIEW_FILES[preview.file] ?? '';
    Object.assign(video, { muted: true, loop: true, autoplay: true, playsInline: true });
    video.setAttribute('aria-hidden', 'true');
    return video;
  }
  const image = document.createElement('img');
  if (preview.kind === 'youtube') {
    const { large, fallback } = youtubeThumbnails(preview.videoId);
    image.src = large;
    image.addEventListener('error', () => (image.src = fallback), { once: true });
  } else {
    image.src = PREVIEW_FILES[preview.file] ?? '';
  }
  image.alt = title;
  image.decoding = 'async';
  image.draggable = false;
  return image;
}

function cutElement(cut: PlacedCut, content: CutContent | undefined, page: { width: number; height: number }) {
  const element = content ? document.createElement('a') : document.createElement('div');
  element.className = `comic-cut${content ? '' : ' is-empty'}`;
  element.dataset.cut = cut.id;
  Object.assign(element.style, {
    left: percent(cut.box.x, page.width),
    top: percent(cut.box.y, page.height),
    width: percent(cut.box.width, page.width),
    height: percent(cut.box.height, page.height),
    clipPath: clipPath(cut),
  });
  if (!content) return element;

  const link = element as HTMLAnchorElement;
  const { href, external } = targetLink(content.open);
  link.href = href;
  link.title = content.title;
  link.setAttribute('aria-label', content.title);
  if (external) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  if (content.open.kind === 'youtube') link.classList.add('is-youtube');
  link.append(previewElement(content.preview, content.title));
  return link;
}

const pointList = (points: readonly Point[]) => points.map(([x, y]) => `${x},${y}`).join(' ');

/**
 * 메인 페이지: 코믹 프레임의 컷마다 콘텐츠 미리 보기를 보여 주고, 누르면 그 콘텐츠로 간다.
 * 컷 배치는 `comicLayout.ts`, 컷에 넣을 콘텐츠는 `contents.json`에서 바꾼다.
 */
export function showComicPage(root: HTMLElement): void {
  const contents = loadCutContents(contentsData);
  const page = placeCuts(COMIC_LAYOUT);

  const sheet = document.createElement('nav');
  sheet.className = 'comic-page';
  sheet.setAttribute('aria-label', '콘텐츠');
  sheet.style.setProperty('--page-aspect', `${page.width} / ${page.height}`);

  // 컷 영역 위의 오림 글자 제목
  const header = document.createElement('h1');
  header.className = 'comic-title';
  Object.assign(header.style, {
    left: percent(page.header.x, page.width),
    top: percent(page.header.y, page.height),
    width: percent(page.header.width, page.width),
    height: percent(page.header.height, page.height),
  });
  header.append(createRansomCanvas(loadPageTitle(contentsData), { letterSize: 72 }));
  sheet.append(header);

  const cuts = page.cuts.map((cut) => cutElement(cut, contents.get(cut.id), page));
  sheet.append(...cuts);

  // 테두리는 clip-path에 잘리지 않도록 컷 위에 따로 그린다.
  const frame = document.createElementNS(SVG_NS, 'svg');
  frame.classList.add('comic-frame');
  frame.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`);
  frame.setAttribute('preserveAspectRatio', 'none');
  frame.setAttribute('aria-hidden', 'true');
  for (const cut of page.cuts) {
    const outline = document.createElementNS(SVG_NS, 'polygon');
    outline.setAttribute('points', pointList(cut.points));
    outline.dataset.cut = cut.id;
    frame.append(outline);
  }
  sheet.append(frame);

  // 마우스를 올리거나 키보드로 고른 컷의 테두리를 강조한다.
  for (const cut of cuts) {
    if (!(cut instanceof HTMLAnchorElement)) continue;
    const outline = frame.querySelector(`[data-cut="${cut.dataset.cut}"]`);
    const set = (on: boolean) => outline?.classList.toggle('is-active', on);
    cut.addEventListener('pointerenter', () => set(true));
    cut.addEventListener('pointerleave', () => set(false));
    cut.addEventListener('focus', () => set(true));
    cut.addEventListener('blur', () => set(false));
  }

  root.replaceChildren(sheet);
  root.hidden = false;
}
