import { createRansomCanvas } from '../../lib/ransomText';
import type { GameDefinition } from '../game';
import { ColoringState } from './coloringState';
import { ColoringView, type PictureRect } from './graphics/coloringView';
import { randomPalette, type Rgb } from './palette';
import { PICTURES } from './pictures';
import { PICTURE_SIZE } from './pictures/svg';
import { rasterizeSvg } from './rasterize';
import { labelRegions, regionAt } from './regions';

/** 종이와 선 색 (sRGB). 메인 페이지 종이와 같은 색 */
const PAPER: Rgb = [0xfb / 255, 0xf6 / 255, 0xec / 255];
const INK: Rgb = [0x2a / 255, 0x22 / 255, 0x1e / 255];

/** 그림을 읽는 픽셀 크기 후보. 화면에 그려질 크기보다 크거나 같은 가장 작은 것 */
const MAP_SIZES = [1024, 1536, 2048];
/** 이보다 작은 틈(그림 넓이 비율)은 선으로 합친다. 1000칸 그림에서 약 14 × 14칸 */
const MIN_REGION_SHARE = 0.0002;
/** 선 너머 이웃을 찾는 거리 (그림 칸). 선 굵기 8칸보다 넉넉히 */
const NEIGHBOR_REACH = 18;
/** 이 시간(초) 동안 누르지 않으면 안 칠한 곳을 반짝여 알려 준다. */
const HINT_AFTER_SECONDS = 7;
/** 버튼 줄 높이와 진행 막대 자리 (CSS px) */
const TOP_BAR = 64;
const BOTTOM_BAR = 44;

const ICON_HOME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5"/></svg>';
const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

const cssColor = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

/** 화면에 맞는 그림 자리. 위에 버튼 줄, 아래에 진행 막대를 두고 남은 곳에 가장 큰 정사각형 */
function pictureRect(width: number, height: number): PictureRect {
  const size = Math.max(64, Math.min(width - 24, height - TOP_BAR - BOTTOM_BAR));
  return { x: (width - size) / 2, y: TOP_BAR + (height - TOP_BAR - BOTTOM_BAR - size) / 2, size };
}

async function startColoring(root: HTMLElement): Promise<void> {
  const shell = element('div', 'coloring', root);
  const canvas = element('canvas', 'coloring-canvas', shell);
  canvas.setAttribute('aria-label', '선으로 나뉜 곳을 눌러 색을 채우는 그림');
  const home = element('a', 'coloring-button coloring-home', shell);
  home.href = './';
  home.setAttribute('aria-label', '메인으로');
  home.innerHTML = ICON_HOME;
  const again = element('button', 'coloring-button coloring-again', shell);
  again.type = 'button';
  again.setAttribute('aria-label', '새 색으로 처음부터');
  again.innerHTML = ICON_AGAIN;
  const progress = element('div', 'coloring-progress', shell);
  progress.setAttribute('role', 'progressbar');
  const progressFill = element('div', 'coloring-progress-fill', progress);
  const banner = element('div', 'coloring-clear', shell);
  banner.hidden = true;
  banner.append(createRansomCanvas('CLEAR!', { letterSize: 72, seed: 'coloring-clear' }));

  let rect = pictureRect(shell.clientWidth, shell.clientHeight);
  const wanted = rect.size * Math.min(window.devicePixelRatio || 1, 2);
  const mapSize = MAP_SIZES.find((size) => size >= wanted) ?? MAP_SIZES[MAP_SIZES.length - 1];
  const picture = PICTURES[Math.floor(Math.random() * PICTURES.length)];
  const inkImage = await rasterizeSvg(picture.svg, mapSize);
  const map = labelRegions(inkImage.mask, mapSize, mapSize, {
    minArea: MIN_REGION_SHARE * mapSize * mapSize,
    neighborReach: (NEIGHBOR_REACH / PICTURE_SIZE) * mapSize,
  });
  const view = new ColoringView(canvas, map, inkImage.amount, PAPER, INK);
  const neighbors = map.regions.map((region) => region.neighbors);

  let palette: Rgb[] = [];
  let state: ColoringState;
  let lastTouch = view.time;

  const showProgress = () => {
    const share = state.filledCount / state.regionCount;
    progressFill.style.width = `${(share * 100).toFixed(2)}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(share * 100)));
  };

  const newGame = () => {
    palette = randomPalette(Math.random);
    state = new ColoringState(neighbors, palette.length, Math.random);
    view.resetRegions();
    view.calm();
    banner.hidden = true;
    shell.classList.remove('is-clear');
    progressFill.style.background = `linear-gradient(90deg, ${palette.map(cssColor).join(', ')})`;
    lastTouch = view.time;
    showProgress();
  };

  const layout = () => {
    rect = pictureRect(shell.clientWidth, shell.clientHeight);
    view.layout(rect, shell.clientWidth, shell.clientHeight);
    Object.assign(progress.style, { left: `${rect.x}px`, width: `${rect.size}px`, top: `${rect.y + rect.size + 14}px` });
    Object.assign(banner.style, { left: `${rect.x}px`, width: `${rect.size}px`, top: `${rect.y}px`, height: `${rect.size}px` });
  };

  canvas.addEventListener('click', (event) => {
    const bounds = canvas.getBoundingClientRect();
    const point = view.toPicture(event.clientX - bounds.left, event.clientY - bounds.top);
    if (!point) return;
    const region = regionAt(map, point[0], point[1]);
    if (region === 0) return;
    lastTouch = view.time;
    const wasComplete = state.isComplete;
    view.paintRegion(region, palette[state.paint(region)], point);
    showProgress();
    if (state.isComplete && !wasComplete) {
      view.celebrate(palette);
      banner.hidden = false;
      shell.classList.add('is-clear');
    }
  });
  again.addEventListener('click', newGame);

  new ResizeObserver(layout).observe(shell);
  newGame();
  layout();

  let last = performance.now();
  const frame = (now: number) => {
    const seconds = Math.min((now - last) / 1000, 0.1);
    last = now;
    const idle = view.time - lastTouch - HINT_AFTER_SECONDS;
    view.setHint(state.isComplete ? 0 : Math.max(0, Math.min(1, idle)));
    view.render(seconds);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __coloring: {
        map,
        view,
        get state() {
          return state;
        },
        /** 개발 확인용: 남은 영역을 모두 칠한다. */
        fillAll: () => {
          for (const region of state.unfilledRegions()) {
            const info = map.regions[region - 1];
            view.paintRegion(region, palette[state.paint(region)], [(info.minX + info.maxX) / 2, (info.minY + info.maxY) / 2]);
          }
          showProgress();
          view.celebrate(palette);
          banner.hidden = false;
          shell.classList.add('is-clear');
        },
      },
    });
  }
}

/** 색칠 놀이: 선으로 나뉜 곳을 누르면 그 판의 무작위 색이 채워진다. 모두 칠하면 완성 */
export const coloringGame: GameDefinition = {
  id: 'coloring',
  start(root) {
    startColoring(root).catch((error: unknown) => {
      console.error(error);
      root.textContent = '그림을 불러오지 못했습니다. 새로 고쳐 주세요.';
    });
  },
};
