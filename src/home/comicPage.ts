import { createRansomCanvas } from '../lib/ransomText';
import { type CutContent, type CutPreview, loadCutContents, loadPageTitle, targetLink, titleLineOptions, youtubeThumbnails } from './comicContents';
import { COMIC_LAYOUT, type PlacedCut, type PlacedPage, placeCuts, type Point } from './comicLayout';
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

/** 종이 좌표의 상자를 종이 기준 백분율 위치로 놓는다. */
function placeBox(element: HTMLElement | SVGElement, box: PlacedCut['box'], page: PlacedPage): void {
  Object.assign(element.style, {
    left: percent(box.x, page.width),
    top: percent(box.y, page.height),
    width: percent(box.width, page.width),
    height: percent(box.height, page.height),
  });
}

function cutElement(id: string, content: CutContent | undefined) {
  const element = content ? document.createElement('a') : document.createElement('div');
  element.className = `comic-cut${content ? '' : ' is-empty'}`;
  element.dataset.cut = id;
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
 *
 * 종이는 화면을 꽉 채운다. 세로로 긴 화면에서는 종이를 세로로 늘여(`placeCuts`의 `aspect`) 빈 곳을 없애고,
 * 제목은 한 줄과 두 줄 가운데 제목 띠에 더 크게 들어가는 쪽을 쓴다. 화면 크기가 바뀌면 다시 놓는다.
 */
export function showComicPage(root: HTMLElement): void {
  const contents = loadCutContents(contentsData);

  const sheet = document.createElement('nav');
  sheet.className = 'comic-page';
  sheet.setAttribute('aria-label', '콘텐츠');

  // 컷 영역 위의 오림 글자 제목. 줄 나눔마다 캔버스를 하나씩 만들어 두고 맞는 것만 보인다.
  const header = document.createElement('h1');
  header.className = 'comic-title';
  const titles = titleLineOptions(loadPageTitle(contentsData)).map((text) => {
    const canvas = createRansomCanvas(text, { letterSize: 72 });
    canvas.setAttribute('aria-label', text.replace(/\n/g, ' '));
    return canvas;
  });
  header.append(...titles);
  sheet.append(header);

  const cuts = COMIC_LAYOUT.cuts.map((cut) => cutElement(cut.id, contents.get(cut.id)));
  sheet.append(...cuts);

  // 테두리는 clip-path에 잘리지 않도록 컷 위에 따로 그린다.
  const frame = document.createElementNS(SVG_NS, 'svg');
  frame.classList.add('comic-frame');
  frame.setAttribute('preserveAspectRatio', 'none');
  frame.setAttribute('aria-hidden', 'true');
  const outlines = COMIC_LAYOUT.cuts.map((cut) => {
    const outline = document.createElementNS(SVG_NS, 'polygon');
    outline.dataset.cut = cut.id;
    frame.append(outline);
    return outline;
  });
  sheet.append(frame);

  // 마우스를 올리거나 키보드로 고른 컷의 테두리를 강조한다.
  cuts.forEach((cut, i) => {
    if (!(cut instanceof HTMLAnchorElement)) return;
    const set = (on: boolean) => outlines[i].classList.toggle('is-active', on);
    cut.addEventListener('pointerenter', () => set(true));
    cut.addEventListener('pointerleave', () => set(false));
    cut.addEventListener('focus', () => set(true));
    cut.addEventListener('blur', () => set(false));
  });

  const place = () => {
    const areaWidth = root.clientWidth;
    const areaHeight = root.clientHeight;
    if (areaWidth === 0 || areaHeight === 0) return;
    const page = placeCuts(COMIC_LAYOUT, areaWidth / areaHeight);
    const scale = Math.min(areaWidth / page.width, areaHeight / page.height);
    sheet.style.width = `${page.width * scale}px`;
    sheet.style.height = `${page.height * scale}px`;

    placeBox(header, page.header, page);
    page.cuts.forEach((cut, i) => {
      placeBox(cuts[i], cut.box, page);
      cuts[i].style.clipPath = clipPath(cut);
      outlines[i].setAttribute('points', pointList(cut.points));
    });
    frame.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`);

    // 제목 띠에 가장 크게 들어가는 줄 나눔을 고른다.
    const boxWidth = page.header.width * scale;
    const boxHeight = page.header.height * scale;
    const fit = (canvas: HTMLCanvasElement) => Math.min(boxWidth / canvas.width, boxHeight / canvas.height);
    // 한 줄이 화면 너비를 꽉 채워 보이므로, 두 줄은 글자가 훨씬(1.3배) 커질 때만 쓴다.
    const best = titles.reduce((a, b) => (fit(b) > fit(a) * 1.3 ? b : a));
    for (const canvas of titles) canvas.hidden = canvas !== best;
  };

  root.replaceChildren(sheet);
  root.hidden = false;
  place();
  new ResizeObserver(place).observe(root);
}
