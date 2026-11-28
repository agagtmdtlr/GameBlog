import { createRansomCanvas } from '../../lib/ransomText';
import type { GameDefinition } from '../game';
import { TowerSnakeView } from './graphics/towerSnakeView';
import type { EnemyType } from './enemies';
import { Minimap } from './minimap';
import type { TowerType } from './towers';
import { TowerSnakeWorld, type Cell, type Direction, type TowerBox } from './world';

/** 버튼 줄 높이 (CSS px) */
const TOP_BAR = 64;
/** 이 거리(CSS px)보다 끌면 그쪽으로 꺾는다. 이어서 끌면 다시 꺾을 수 있다. */
const SWIPE_STEP = 22;
/** 한 장면에서 따라잡는 가장 긴 시간 (초) */
const MAX_FRAME = 0.1;

const ICON_HOME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5"/></svg>';
const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5Z"/></svg>';
/** 버틴 시간: 모래시계 */
const ICON_TIME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/></svg>';
/** 처치 수: 터진 방울 */
const ICON_KILL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>';
/** 타워 마디 수: 작은 탑 */
const ICON_TOWER =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M7 20v-8h10v8M12 3l-6 6h12Z"/></svg>';
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
  const button = element('button', `tsnake-button ${className}`, parent);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.innerHTML = icon;
  return button;
}

/** 초 → `분:초` */
const clock = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** `ready`: 첫 입력을 기다림, `run`: 나아감, `pause`: 멈춤, `over`: 끝남 */
type Phase = 'ready' | 'run' | 'pause' | 'over';

function startTowerSnake(root: HTMLElement): void {
  const shell = element('div', 'tsnake', root);
  const canvas = element('canvas', 'tsnake-canvas', shell);
  const home = element('a', 'tsnake-button tsnake-home', shell);
  home.href = './';
  home.setAttribute('aria-label', '메인으로');
  home.innerHTML = ICON_HOME;
  const pauseButton = iconButton('tsnake-pause', '멈추기', ICON_PAUSE, shell);
  const again = iconButton('tsnake-again', '처음부터', ICON_AGAIN, shell);

  const scores = element('div', 'tsnake-scores', shell);
  const timeTag = element('div', 'tsnake-score', scores);
  timeTag.innerHTML = ICON_TIME;
  timeTag.setAttribute('aria-label', '버틴 시간');
  const timeValue = element('span', 'tsnake-score-value', timeTag);
  const killTag = element('div', 'tsnake-score tsnake-kills', scores);
  killTag.innerHTML = ICON_KILL;
  killTag.setAttribute('aria-label', '처치 수');
  const killValue = element('span', 'tsnake-score-value', killTag);
  const lengthTag = element('div', 'tsnake-score tsnake-length', scores);
  lengthTag.innerHTML = ICON_TOWER;
  lengthTag.setAttribute('aria-label', '타워 수');
  const lengthValue = element('span', 'tsnake-score-value', lengthTag);
  lengthTag.addEventListener('animationend', () => lengthTag.classList.remove('is-hit'));

  const minimap = new Minimap(shell);
  const hint = element('div', 'tsnake-overlay tsnake-hint', shell);
  hint.innerHTML = ICON_KEYS;
  const paused = element('button', 'tsnake-overlay tsnake-paused', shell);
  paused.type = 'button';
  paused.setAttribute('aria-label', '이어 하기');
  paused.innerHTML = ICON_PLAY;
  const overBanner = element('div', 'tsnake-overlay tsnake-banner', shell);
  overBanner.append(createRansomCanvas('GAME OVER', { letterSize: 72, seed: 'tower-snake-over' }));

  const world = new TowerSnakeWorld();
  const view = new TowerSnakeView(canvas);
  let phase: Phase = 'ready';

  const setPhase = (next: Phase) => {
    phase = next;
    shell.dataset.phase = next;
    hint.hidden = next !== 'ready';
    paused.hidden = next !== 'pause';
    overBanner.hidden = next !== 'over';
    pauseButton.disabled = next === 'over';
    pauseButton.innerHTML = next === 'pause' ? ICON_PLAY : ICON_PAUSE;
    pauseButton.setAttribute('aria-label', next === 'pause' ? '이어 하기' : '멈추기');
  };

  let shownSegments = -1;
  const showScore = () => {
    timeValue.textContent = clock(world.time);
    killValue.textContent = String(world.killed);
    if (world.segments !== shownSegments) {
      // 마디를 잃으면 점수 표가 흔들린다.
      if (world.segments < shownSegments) {
        lengthTag.classList.remove('is-hit');
        void lengthTag.offsetWidth;
        lengthTag.classList.add('is-hit');
      }
      shownSegments = world.segments;
      lengthValue.textContent = String(world.segments);
    }
  };

  const newGame = () => {
    world.reset();
    view.reset(world.body);
    shownSegments = -1;
    setPhase('ready');
    showScore();
  };

  const steer = (direction: Direction) => {
    if (phase === 'over') return;
    world.turn(direction);
    if (phase !== 'run') setPhase('run');
  };

  const togglePause = () => {
    if (phase === 'run') setPhase('pause');
    else if (phase === 'pause') setPhase('run');
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
      if (phase === 'over') newGame();
      else togglePause();
    }
  });

  // 끌어서 꺾기 (손가락·마우스). 누른 채 이어서 끌면 다시 꺾는다.
  let swipe: { id: number; x: number; y: number } | null = null;
  shell.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('.tsnake-button, .tsnake-paused')) return;
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
  again.addEventListener('click', newGame);
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
      for (const event of world.update(dt)) {
        if (event.kind === 'blast' || event.kind === 'bolt') {
          view.effect(event);
          continue;
        }
        if (event.kind === 'kill') {
          view.kill(event);
          continue;
        }
        if (event.hurt?.over) {
          view.crash();
          setPhase('over');
          break;
        }
        if (event.kind === 'bump') {
          // 적이 머리에 부딪혀 칸 사이에서 꼬리 끝 마디를 잃었다.
          if (event.hurt.lost) view.lose(event.hurt.lost, event.hurt.lostTower);
          continue;
        }
        const lost = event.hurt?.lost ? { cell: event.hurt.lost, tower: event.hurt.lostTower } : null;
        // 먹으면 꼬리 끝 타워가 새로 붙거나(늘어남) 바뀐다 (한계). 어느 쪽이든 꼬리 끝이 튀어나온다.
        view.step(event.before, world.body, lost, event.eat ? world.towers.length - 1 : null);
      }
      showScore();
    }
    const alpha = phase === 'over' ? 1 : world.alpha;
    view.render(dt, { alpha, invulnerable: world.invulnerable, dead: phase === 'over', towers: world.towers, boxes: world.boxes, enemies: world.enemies, projectiles: world.projectiles });
    minimap.draw(world.body, world.boxes, world.enemies, view.focus, view.visible, world.invulnerable > 0 && Math.sin(now / 25) > 0);
    requestAnimationFrame(frame);
  };
  newGame();
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __towerSnake: {
        world,
        view,
        gl: view.renderer.getContext(),
        steer,
        /** 개발 확인용: 적을 바로 놓는다. */
        spawn: (type: EnemyType, x: number, y: number) => world.spawnEnemy(type, x, y),
        get phase() {
          return phase;
        },
        /** 개발 확인용: 몸(과 타워, 상자)을 바로 놓는다. */
        load: (body: Cell[], direction: Direction, towers?: TowerType[], boxes?: TowerBox[]) => {
          world.load(body, direction, towers, boxes);
          view.reset(world.body);
          setPhase('ready');
          showScore();
        },
      },
    });
  }
}

/** 타워 뱀: 몸 마디마다 타워를 싣고 큰 판을 누빈다 (단계 5까지: 판, 움직임, 울타리·제 몸 피해, 타워 상자, 적, 자동 공격, 연출). */
export const towerSnakeGame: GameDefinition = {
  id: 'tower-snake',
  start(root) {
    startTowerSnake(root);
  },
};
