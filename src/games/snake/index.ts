import { createRansomCanvas } from '../../lib/ransomText';
import { openRecordBook, type RecordBook } from '../../lib/save';
import type { GameDefinition } from '../game';
import { SnakeView } from './graphics/snakeView';
import { emptySnakeStats, SNAKE_RECORDS, type SnakePlay, type SnakeProgress, type SnakeStats } from './records';
import { SnakeGame, type Cell, type Direction } from './snakeGame';

/** 버튼 줄 높이 (CSS px) */
const TOP_BAR = 64;
/** 이 거리(CSS px)보다 끌면 그쪽으로 꺾는다. 이어서 끌면 다시 꺾을 수 있다. */
const SWIPE_STEP = 22;
/** 한 장면에서 따라잡는 가장 긴 시간 (초). 탭을 오래 비운 뒤 한꺼번에 나아가지 않게 */
const MAX_FRAME = 0.1;

const ICON_HOME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5"/></svg>';
const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>';
const ICON_BERRY =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14" r="6.5"/><path d="M12 7.5V4m0 1.5c1.5-2 4-2.2 5.5-1.2-1 1.8-3.4 2.4-5.5 1.2"/></svg>';
const ICON_CROWN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M4.5 15 3 7l5 3.5L12 5l4 5.5L21 7l-1.5 8Z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5Z"/></svg>';
/** 시작 안내: 화살표 키 네 개 */
const ICON_KEYS =
  '<svg viewBox="0 0 96 66" aria-hidden="true">' +
  '<rect x="34" y="3" width="28" height="28" rx="6"/><rect x="3" y="35" width="28" height="28" rx="6"/>' +
  '<rect x="34" y="35" width="28" height="28" rx="6"/><rect x="65" y="35" width="28" height="28" rx="6"/>' +
  '<path d="m42 20 6-6 6 6M23 43l-6 6 6 6M42 46l6 6 6-6M73 43l6 6-6 6"/></svg>';

const KEYS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  a: 'left',
  d: 'right',
  w: 'up',
  s: 'down',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

function iconButton(className: string, label: string, icon: string, parent: HTMLElement): HTMLButtonElement {
  const button = element('button', `snake-button ${className}`, parent);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.innerHTML = icon;
  return button;
}

/** 저장에 실패해도 게임은 계속한다. */
const warn = (error: unknown) => console.warn('뱀 기록을 저장하지 못했습니다.', error);

/** `ready`: 첫 입력을 기다림, `run`: 나아감, `pause`: 멈춤, `over`: 끝남 */
type Phase = 'ready' | 'run' | 'pause' | 'over';

function startSnake(root: HTMLElement): void {
  const shell = element('div', 'snake', root);
  const canvas = element('canvas', 'snake-canvas', shell);
  const home = element('a', 'snake-button snake-home', shell);
  home.href = './';
  home.setAttribute('aria-label', '메인으로');
  home.innerHTML = ICON_HOME;
  const pauseButton = iconButton('snake-pause', '멈추기', ICON_PAUSE, shell);
  const again = iconButton('snake-again', '처음부터', ICON_AGAIN, shell);

  const scores = element('div', 'snake-scores', shell);
  const scoreTag = element('div', 'snake-score', scores);
  scoreTag.innerHTML = ICON_BERRY;
  scoreTag.setAttribute('aria-label', '먹은 수');
  const scoreValue = element('span', 'snake-score-value', scoreTag);
  const bestTag = element('div', 'snake-score snake-best', scores);
  bestTag.innerHTML = ICON_CROWN;
  bestTag.setAttribute('aria-label', '가장 많이 먹은 수');
  const bestValue = element('span', 'snake-score-value', bestTag);

  const hint = element('div', 'snake-overlay snake-hint', shell);
  hint.innerHTML = ICON_KEYS;
  const paused = element('button', 'snake-overlay snake-paused', shell);
  paused.type = 'button';
  paused.setAttribute('aria-label', '이어 하기');
  paused.innerHTML = ICON_PLAY;
  const overBanner = element('div', 'snake-overlay snake-banner', shell);
  overBanner.append(createRansomCanvas('GAME OVER', { letterSize: 72, seed: 'snake-over' }));
  const fullBanner = element('div', 'snake-overlay snake-banner', shell);
  fullBanner.append(createRansomCanvas('PERFECT!', { letterSize: 72, seed: 'snake-full' }));

  const game = new SnakeGame();
  const view = new SnakeView(canvas);
  let phase: Phase = 'ready';
  let book: RecordBook<SnakeStats, SnakePlay, SnakeProgress> | null = null;
  let stats = emptySnakeStats();
  /** 이번 칸에서 흐른 시간 (초) */
  let pending = 0;
  /** 이번 판의 논 시간 (초, 멈춘 때 뺌) */
  let played = 0;
  let startedAt = Date.now();
  let recorded = false;

  const setPhase = (next: Phase) => {
    phase = next;
    shell.dataset.phase = next;
    hint.hidden = next !== 'ready';
    paused.hidden = next !== 'pause';
    overBanner.hidden = !(next === 'over' && !game.full);
    fullBanner.hidden = !(next === 'over' && game.full);
    pauseButton.disabled = next === 'over';
    pauseButton.innerHTML = next === 'pause' ? ICON_PLAY : ICON_PAUSE;
    pauseButton.setAttribute('aria-label', next === 'pause' ? '이어 하기' : '멈추기');
  };

  const showScore = (gained = false) => {
    scoreValue.textContent = String(game.score);
    bestValue.textContent = String(Math.max(stats.best, game.score));
    if (gained) {
      const pop = element('span', 'snake-gain', scoreTag);
      pop.textContent = '+1';
      pop.addEventListener('animationend', () => pop.remove());
    }
  };

  /** 이번 판을 판 기록으로 남긴다. 한 칸도 나아가지 않은 판은 남기지 않는다. */
  const finishPlay = (end: SnakePlay['end']) => {
    if (recorded || game.ticks === 0 || !book) return;
    recorded = true;
    const play: SnakePlay = { score: game.score, length: game.body.length, ticks: game.ticks, seconds: Math.round(played * 10) / 10, end };
    book
      .record(play, { startedAt, endedAt: Date.now() })
      .then((next) => {
        stats = next;
        showScore();
      })
      .catch(warn);
  };

  const newGame = () => {
    game.reset();
    view.reset(game.body, game.food);
    pending = 0;
    played = 0;
    recorded = false;
    startedAt = Date.now();
    setPhase('ready');
    showScore();
  };

  const advance = () => {
    const before = game.body.slice();
    const result = game.tick();
    if (result.crash) {
      view.crash();
      finishPlay(result.crash);
      setPhase('over');
      return;
    }
    view.step(before, game.body, game.food, result.ate, game.ticks);
    if (result.ate) showScore(true);
    if (result.full) {
      finishPlay('full');
      setPhase('over');
    }
  };

  const steer = (direction: Direction) => {
    if (phase === 'over') return;
    game.turn(direction);
    if (phase !== 'run') {
      if (phase === 'ready') startedAt = Date.now();
      setPhase('run');
    }
  };

  const togglePause = () => {
    if (phase === 'run') setPhase('pause');
    else if (phase === 'pause') setPhase('run');
  };

  const restart = () => {
    finishPlay('restart');
    newGame();
  };

  window.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (direction) {
      event.preventDefault();
      steer(direction);
    } else if (event.key === ' ' || event.key === 'Enter' || event.key === 'p' || event.key === 'Escape') {
      if (event.target instanceof HTMLButtonElement && event.key !== 'p' && event.key !== 'Escape') return;
      event.preventDefault();
      if (phase === 'over') restart();
      else togglePause();
    }
  });

  // 끌어서 꺾기 (손가락·마우스). 누른 채 이어서 끌면 다시 꺾는다.
  let swipe: { id: number; x: number; y: number } | null = null;
  shell.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('.snake-button, .snake-paused')) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  shell.addEventListener('pointermove', (event) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_STEP) return;
    swipe.x = event.clientX;
    swipe.y = event.clientY;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  const endSwipe = () => (swipe = null);
  shell.addEventListener('pointerup', endSwipe);
  shell.addEventListener('pointercancel', endSwipe);

  pauseButton.addEventListener('click', togglePause);
  paused.addEventListener('click', togglePause);
  again.addEventListener('click', restart);
  // 다른 탭이나 창으로 가면 멈춘다.
  const autoPause = () => {
    if (phase === 'run') setPhase('pause');
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) autoPause();
  });
  window.addEventListener('blur', autoPause);

  const layout = () => view.resize(shell.clientWidth, shell.clientHeight, TOP_BAR);
  layout();
  new ResizeObserver(layout).observe(shell);

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    if (phase === 'run') {
      played += dt;
      pending += dt;
      // 빨라져도 한 장면에 여러 칸을 나아갈 수 있다.
      while (phase === 'run' && pending >= 1 / game.speed) {
        pending -= 1 / game.speed;
        advance();
      }
    }
    const alpha = phase === 'over' ? 1 : Math.min(1, pending * game.speed);
    view.render(dt, alpha, game.ticks, phase === 'over' && !game.full);
    requestAnimationFrame(frame);
  };
  newGame();
  requestAnimationFrame(frame);

  // 기록장을 연다. 여는 동안에도 놀 수 있고, 연 뒤의 판부터 남는다.
  void (async () => {
    const opened = await openRecordBook<SnakeStats, SnakePlay, SnakeProgress>(SNAKE_RECORDS);
    try {
      stats = await opened.stats();
    } catch (error) {
      warn(error);
    }
    book = opened;
    showScore();
  })();

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __snake: {
        game,
        view,
        gl: view.renderer.getContext(),
        steer,
        get phase() {
          return phase;
        },
        get stats() {
          return stats;
        },
        book: () => book,
        /** 개발 확인용: 몸과 먹이를 바로 놓는다. */
        load: (body: Cell[], direction: Direction, food: Cell | null) => {
          game.load(body, direction, food);
          view.reset(game.body, game.food);
          setPhase('ready');
        },
      },
    });
  }
}

/** 뱀: 판 위를 나아가며 열매를 먹고 길어진다. 벽이나 제 몸에 부딪히면 끝난다. */
export const snakeGame: GameDefinition = {
  id: 'snake',
  start(root) {
    startSnake(root);
  },
};
