import { createRansomCanvas } from '../../lib/ransomText';
import { openRecordBook, type RecordBook } from '../../lib/save';
import type { GameDefinition } from '../game';
import { cityParts, partNeighbors } from './city';
import { ColoringState } from './coloringState';
import { FreeCamera } from './freeCamera';
import { CityView } from './graphics/cityView';
import { randomPalette, type Rgb } from './palette';
import { COLORING_RECORDS, type ColoringPlay, type ColoringProgress, type ColoringStats } from './records';

type ColoringBook = RecordBook<ColoringStats, ColoringPlay, ColoringProgress>;

/** 저장에 실패해도 놀이는 계속한다. */
const warn = (error: unknown) => console.warn('색칠 기록을 저장하지 못했습니다.', error);

/** 이 시간(초) 동안 칠하지 않으면 안 칠한 조각을 반짝여 알려 준다. */
const HINT_AFTER_SECONDS = 7;
/** 이보다 적게 움직이고 뗀 누르기만 칠하기로 본다 (CSS px, 초) */
const TAP_MOVE = 8;
const TAP_SECONDS = 0.6;
/** 시점 돌리기 (라디안 / CSS px) */
const LOOK_SPEED = 0.005;
/** 걷기 빠르기 (m/s). Shift를 누르면 세 배 */
const MOVE_SPEED = 12;
/** 두 손가락 벌리기 1px당 앞으로 가는 거리 (m) */
const PINCH_SPEED = 0.12;
/** 두 손가락 끌기 1px당 옆·위로 가는 거리 (m) */
const PAN_SPEED = 0.06;

const ICON_HOME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>';
/** 일시 정지·재생을 바꾸는 키 */
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>';

/** 키마다 [앞, 오른쪽, 위] */
const MOVE_KEYS: Record<string, readonly [number, number, number]> = {
  KeyW: [1, 0, 0],
  ArrowUp: [1, 0, 0],
  KeyS: [-1, 0, 0],
  ArrowDown: [-1, 0, 0],
  KeyD: [0, 1, 0],
  ArrowRight: [0, 1, 0],
  KeyA: [0, -1, 0],
  ArrowLeft: [0, -1, 0],
  KeyE: [0, 0, 1],
  Space: [0, 0, 1],
  KeyQ: [0, 0, -1],
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

const cssColor = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

interface Pointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
}

function startColoring(root: HTMLElement): void {
  const shell = element('div', 'coloring', root);
  const canvas = element('canvas', 'coloring-canvas', shell);
  canvas.setAttribute('aria-label', '돌아다니며 도시의 물건을 눌러 색을 채우는 3D 장면');
  const home = element('a', 'coloring-button coloring-home', shell);
  home.href = './';
  home.setAttribute('aria-label', '메인으로');
  home.innerHTML = ICON_HOME;
  // 일시 정지: 차와 사람이 멈춘다. 둘러보기와 칠하기는 그대로 할 수 있다.
  const pauseButton = element('button', 'coloring-button coloring-pause', shell);
  pauseButton.type = 'button';
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

  const parts = cityParts();
  const neighbors = partNeighbors(parts);
  const view = new CityView(canvas, parts);
  const camera = new FreeCamera();

  let palette: Rgb[] = [];
  let state: ColoringState;
  let lastPaint = view.time;
  // 기록: 이번 판의 누른 횟수, 논 시간(초, 화면이 보일 때만 늘어남), 시작 시각
  let book: ColoringBook | null = null;
  let paints = 0;
  let playSeconds = 0;
  let startedAt = Date.now();
  /** 이번 판을 이미 판 기록으로 남겼는지 */
  let recorded = false;

  const saveProgress = () => {
    if (!book || recorded || paints === 0) return;
    book.saveProgress({ palette, colors: state.snapshot(), paints, seconds: playSeconds, startedAt }).catch(warn);
  };

  /** 이번 판을 판 기록으로 남기고 하다 만 판을 지운다. 한 번도 칠하지 않은 판은 남기지 않는다. */
  const finishPlay = () => {
    if (!book || recorded || paints === 0) return;
    recorded = true;
    const play: ColoringPlay = { cleared: state.isComplete, paints, seconds: playSeconds, palette, colors: state.snapshot() };
    book.record(play, { startedAt, endedAt: Date.now() }).catch(warn);
    book.clearProgress().catch(warn);
  };

  const showProgress = () => {
    const share = state.filledCount / state.regionCount;
    progressFill.style.width = `${(share * 100).toFixed(2)}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(share * 100)));
  };

  const finishIfComplete = (wasComplete: boolean) => {
    if (!state.isComplete || wasComplete) return;
    finishPlay();
    view.celebrate(palette);
    banner.hidden = false;
    shell.classList.add('is-clear');
  };

  const newGame = () => {
    palette = randomPalette(Math.random);
    state = new ColoringState(neighbors, palette.length, Math.random);
    view.resetPaint();
    view.calm();
    banner.hidden = true;
    shell.classList.remove('is-clear');
    progressFill.style.background = `linear-gradient(90deg, ${palette.map(cssColor).join(', ')})`;
    lastPaint = view.time;
    paints = 0;
    playSeconds = 0;
    startedAt = Date.now();
    recorded = false;
    showProgress();
  };

  /** 지난 방문에 칠하던 그림으로 이어 한다. 도시 조각 수가 바뀌었으면 새로 시작한다. */
  const resume = (saved: ColoringProgress) => {
    const next = new ColoringState(neighbors, saved.palette.length, Math.random);
    if (!next.restore(saved.colors) || next.isComplete) return false;
    newGame();
    palette = saved.palette;
    state = next;
    progressFill.style.background = `linear-gradient(90deg, ${palette.map(cssColor).join(', ')})`;
    // 칠해 둔 조각은 가운데에서 다시 번지며 나타난다.
    saved.colors.forEach((color, i) => color >= 0 && view.paintRegion(i + 1, palette[color]));
    paints = saved.paints;
    playSeconds = saved.seconds;
    startedAt = saved.startedAt;
    showProgress();
    return true;
  };

  const paintAt = (x: number, y: number) => {
    const hit = view.pick(x, y);
    if (!hit) return;
    const wasComplete = state.isComplete;
    view.paintRegion(hit.region, palette[state.paint(hit.region)], hit.point);
    paints++;
    lastPaint = view.time;
    showProgress();
    finishIfComplete(wasComplete);
    saveProgress();
  };

  // ── 입력: 끌어서 둘러보기, 두 손가락으로 움직이기, 짧게 눌러 칠하기 ──
  const pointers = new Map<number, Pointer>();
  let pinch: { distance: number; x: number; y: number } | null = null;
  let multiTouch = false;
  const local = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const twoFingers = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = local(event);
    pointers.set(event.pointerId, { x, y, startX: x, startY: y, startTime: view.time });
    if (pointers.size === 1) multiTouch = false;
    if (pointers.size >= 2) multiTouch = true;
    pinch = pointers.size === 2 ? twoFingers() : null;
  });
  canvas.addEventListener('pointermove', (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const { x, y } = local(event);
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    pointer.x = x;
    pointer.y = y;
    if (pointers.size === 1 && !multiTouch) {
      camera.look(-dx * LOOK_SPEED, -dy * LOOK_SPEED);
    } else if (pointers.size === 2 && pinch) {
      const now = twoFingers();
      camera.move((now.distance - pinch.distance) * PINCH_SPEED, -(now.x - pinch.x) * PAN_SPEED, (now.y - pinch.y) * PAN_SPEED);
      pinch = now;
    }
  });
  const release = (event: PointerEvent, tap: boolean) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId);
    pinch = null;
    const moved = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (tap && !multiTouch && moved < TAP_MOVE && view.time - pointer.startTime < TAP_SECONDS) paintAt(pointer.x, pointer.y);
  };
  canvas.addEventListener('pointerup', (event) => release(event, true));
  canvas.addEventListener('pointercancel', (event) => release(event, false));
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      camera.move(-event.deltaY * 0.02, 0, 0);
    },
    { passive: false },
  );

  let paused = false;
  const setPaused = (value: boolean) => {
    paused = value;
    pauseButton.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    pauseButton.setAttribute('aria-label', paused ? '움직임 다시 재생' : '움직임 일시 정지');
    pauseButton.setAttribute('aria-pressed', String(paused));
    shell.classList.toggle('is-paused', paused);
  };
  setPaused(false);
  pauseButton.addEventListener('click', () => setPaused(!paused));

  const keys = new Set<string>();
  window.addEventListener('keydown', (event) => {
    if (PAUSE_KEYS.has(event.code) && !event.repeat) {
      setPaused(!paused);
      return;
    }
    const shift = event.code === 'ShiftLeft' || event.code === 'ShiftRight';
    if (!(event.code in MOVE_KEYS) && !shift) return;
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  const walk = (seconds: number) => {
    let forward = 0;
    let strafe = 0;
    let up = 0;
    for (const code of keys) {
      const move = MOVE_KEYS[code];
      if (!move) continue;
      forward += move[0];
      strafe += move[1];
      up += move[2];
    }
    if (forward === 0 && strafe === 0 && up === 0) return;
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1;
    const step = MOVE_SPEED * fast * seconds;
    camera.move(forward * step, strafe * step, up * step);
  };

  again.addEventListener('click', () => {
    finishPlay();
    newGame();
  });
  // 논 시간을 남기려고 화면을 떠날 때도 하다 만 판을 저장한다.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveProgress());
  window.addEventListener('pagehide', saveProgress);
  const resize = () => view.resize(shell.clientWidth, shell.clientHeight);
  new ResizeObserver(resize).observe(shell);
  resize();
  newGame();

  // 기록장을 열고, 하다 만 판이 있으면 이어 한다. 그 사이에 칠하기 시작했으면 새 판을 그대로 둔다.
  void (async () => {
    const opened = await openRecordBook<ColoringStats, ColoringPlay, ColoringProgress>(COLORING_RECORDS);
    let saved: ColoringProgress | undefined;
    try {
      saved = await opened.progress();
    } catch (error) {
      warn(error);
    }
    book = opened;
    if (saved && paints === 0 && !resume(saved)) opened.clearProgress().catch(warn);
  })();

  let last = performance.now();
  const frame = (now: number) => {
    const seconds = Math.min((now - last) / 1000, 0.1);
    last = now;
    walk(seconds);
    if (!state.isComplete && paints > 0) playSeconds += seconds;
    if (!paused) view.update(seconds);
    const idle = view.time - lastPaint - HINT_AFTER_SECONDS;
    view.setHint(state.isComplete ? 0 : Math.max(0, Math.min(1, idle)));
    view.render(camera, seconds);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __coloring: {
        parts,
        view,
        camera,
        get state() {
          return state;
        },
        paintAt,
        setPaused,
        book: () => book,
        get paused() {
          return paused;
        },
        /** 개발 확인용: 남은 조각을 칠한다. 앞의 `leave`개는 남긴다. */
        fillAll: (leave = 0) => {
          const wasComplete = state.isComplete;
          for (const region of state.unfilledRegions().slice(leave)) {
            view.paintRegion(region, palette[state.paint(region)]);
            paints++;
          }
          showProgress();
          finishIfComplete(wasComplete);
          saveProgress();
        },
      },
    });
  }
}

/** 색칠 놀이: 해 질 녘 도시를 자유롭게 돌아다니며 물건을 누르면 그 판의 무작위 색이 채워진다. 모두 칠하면 완성 */
export const coloringGame: GameDefinition = {
  id: 'coloring',
  start(root) {
    try {
      startColoring(root);
    } catch (error) {
      console.error(error);
      root.textContent = '3D 그래픽을 시작하지 못했습니다. 새로 고쳐 주세요.';
    }
  },
};
