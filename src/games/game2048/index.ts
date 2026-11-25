import { createRansomCanvas } from '../../lib/ransomText';
import { openRecordBook, type RecordBook } from '../../lib/save';
import type { GameDefinition } from '../game';
import { Board, SIZE, type Direction, type Tile } from './board';
import { emptyStats2048, LEGACY_BEST_KEY, RECORDS_2048, type Play2048, type Progress2048, type Stats2048 } from './records';
import { tileStyle } from './tileStyle';

/** 버튼 줄 높이 (CSS px) */
const TOP_BAR = 64;
/** 판 둘레 여백 (CSS px) */
const MARGIN = 12;
/** 칸 사이 틈: 칸 크기에 대한 비율 */
const GAP_SHARE = 0.12;
/** 타일이 미끄러지는 시간 (ms). style.css의 `.g2048-tile` transition과 같게 둔다. */
const SLIDE_MS = 110;
/** 이 거리(CSS px)보다 길게 끌면 민 것으로 본다. */
const SWIPE_MIN = 24;

const ICON_HOME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5"/></svg>';
const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>';
const ICON_STAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7Z"/></svg>';
const ICON_CROWN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M4.5 15 3 7l5 3.5L12 5l4 5.5L21 7l-1.5 8Z"/></svg>';

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

type Book2048 = RecordBook<Stats2048, Play2048, Progress2048>;

/** 예전 방식(localStorage)으로 남긴 가장 높은 점수를 누적 수치로 옮기고 지운다. */
async function moveLegacyBest(book: Book2048): Promise<void> {
  let legacy = 0;
  try {
    legacy = Number(localStorage.getItem(LEGACY_BEST_KEY)) || 0;
  } catch {
    return;
  }
  if (legacy > 0) await book.adjustStats((stats) => ({ ...stats, best: Math.max(stats.best, legacy) }));
  // 이 기기에 오래 남는 저장소로 옮겼을 때만 지운다.
  if (book.lasting) localStorage.removeItem(LEGACY_BEST_KEY);
}

/** 저장에 실패해도 게임은 계속한다. */
const warn = (error: unknown) => console.warn('2048 기록을 저장하지 못했습니다.', error);

/** 타일마다 조금씩 다른 기울기 (도). 종이를 오려 붙인 느낌을 준다. */
const tilt = (id: number) => (((id * 37) % 7) - 3) * 0.7;

function start2048(root: HTMLElement): void {
  const shell = element('div', 'g2048', root);
  const home = element('a', 'g2048-button g2048-home', shell);
  home.href = './';
  home.setAttribute('aria-label', '메인으로');
  home.innerHTML = ICON_HOME;
  const again = element('button', 'g2048-button g2048-again', shell);
  again.type = 'button';
  again.setAttribute('aria-label', '처음부터');
  again.innerHTML = ICON_AGAIN;

  const scores = element('div', 'g2048-scores', shell);
  const scoreTag = element('div', 'g2048-score', scores);
  scoreTag.innerHTML = ICON_STAR;
  scoreTag.setAttribute('aria-label', '점수');
  const scoreValue = element('span', 'g2048-score-value', scoreTag);
  const bestTag = element('div', 'g2048-score g2048-best', scores);
  bestTag.innerHTML = ICON_CROWN;
  bestTag.setAttribute('aria-label', '가장 높은 점수');
  const bestValue = element('span', 'g2048-score-value', bestTag);

  const boardNode = element('div', 'g2048-board', shell);
  boardNode.setAttribute('role', 'application');
  boardNode.setAttribute('aria-label', '화살표 키나 밀기로 같은 숫자를 합치는 판');
  const cells: HTMLElement[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) cells.push(element('div', 'g2048-cell', boardNode));
  const tileLayer = element('div', 'g2048-tiles', boardNode);

  const winBanner = element('div', 'g2048-banner g2048-win', boardNode);
  winBanner.append(createRansomCanvas('2048!', { letterSize: 72, seed: '2048-win' }));
  winBanner.hidden = true;
  const overBanner = element('div', 'g2048-banner g2048-over', boardNode);
  overBanner.append(createRansomCanvas('GAME OVER', { letterSize: 72, seed: '2048-over' }));
  overBanner.hidden = true;

  const board = new Board();
  const nodes = new Map<number, HTMLElement>();
  // 기록: 누적 수치와 이번 판. 기록장을 열기 전에는 밀지 않는다.
  let book: Book2048 | null = null;
  let stats = emptyStats2048();
  let moves = 0;
  let startedAt = Date.now();
  /** 이번 판을 이미 판 기록으로 남겼는지 */
  let recorded = false;
  let cell = 0;
  let gap = 0;

  const place = (node: HTMLElement, tile: Pick<Tile, 'row' | 'col'>) => {
    node.style.transform = `translate(${gap + tile.col * (cell + gap)}px, ${gap + tile.row * (cell + gap)}px)`;
  };

  const makeTile = (tile: Tile, appear: 'new' | 'merged' | 'none') => {
    const node = element('div', 'g2048-tile', tileLayer);
    const face = element('div', 'g2048-face', node);
    const style = tileStyle(tile.value);
    face.textContent = String(tile.value);
    face.style.background = style.background;
    face.style.color = style.color;
    face.style.rotate = `${tilt(tile.id)}deg`;
    face.dataset.scale = String(style.fontScale);
    face.style.fontSize = `${cell * style.fontScale}px`;
    if (tile.value >= 2048) face.classList.add('is-gold');
    if (appear !== 'none') face.classList.add(appear === 'new' ? 'is-new' : 'is-merged');
    node.style.width = node.style.height = `${cell}px`;
    // 처음 자리에 transition 없이 놓는다.
    node.style.transition = 'none';
    place(node, tile);
    void node.offsetWidth;
    node.style.transition = '';
    nodes.set(tile.id, node);
    return node;
  };

  const showScore = (gained = 0) => {
    scoreValue.textContent = String(board.score);
    bestValue.textContent = String(Math.max(stats.best, board.score));
    if (gained > 0) {
      const pop = element('span', 'g2048-gain', scoreTag);
      pop.textContent = `+${gained}`;
      pop.addEventListener('animationend', () => pop.remove());
    }
  };

  const saveProgress = () => {
    book?.saveProgress({ grid: board.grid(), score: board.score, won: board.won, moves, startedAt }).catch(warn);
  };

  /** 이번 판을 판 기록으로 남긴다. 한 번도 밀지 않은 판은 남기지 않는다. */
  const finishPlay = (end: Play2048['end']) => {
    if (recorded || moves === 0 || !book) return;
    recorded = true;
    const play: Play2048 = { score: board.score, highest: board.highest, moves, won: board.won, end, grid: board.grid() };
    book
      .record(play, { startedAt, endedAt: Date.now() })
      .then((next) => {
        stats = next;
        showScore();
      })
      .catch(warn);
    if (end === 'over') book.clearProgress().catch(warn);
  };

  const showBoard = () => {
    tileLayer.replaceChildren();
    nodes.clear();
    for (const tile of board.all) makeTile(tile, 'new');
  };

  const newGame = () => {
    board.reset();
    moves = 0;
    startedAt = Date.now();
    recorded = false;
    showBoard();
    winBanner.hidden = true;
    overBanner.hidden = true;
    shell.classList.remove('is-over', 'is-won');
    showScore();
    saveProgress();
  };

  /** 지난 방문에 하다 만 판을 이어 한다. */
  const resume = (progress: Progress2048) => {
    board.load(progress.grid);
    board.score = progress.score;
    board.won = progress.won;
    moves = progress.moves;
    startedAt = progress.startedAt;
    recorded = false;
    wonShown = progress.won;
    showBoard();
    showScore();
  };

  let wonShown = false;
  const move = (direction: Direction) => {
    if (!book || !board.canMove()) return;
    winBanner.hidden = true;
    shell.classList.remove('is-won');
    const wasWon = board.won;
    const result = board.move(direction);
    if (!result.moved) {
      boardNode.classList.remove(`is-bump-${direction}`);
      void boardNode.offsetWidth;
      boardNode.classList.add(`is-bump-${direction}`);
      return;
    }
    moves++;
    // 합쳐진 두 타일은 합쳐진 자리로 미끄러진 뒤 사라진다.
    for (const gone of result.removed) {
      const node = nodes.get(gone.id);
      if (!node) continue;
      nodes.delete(gone.id);
      node.classList.add('is-leaving');
      place(node, gone);
      window.setTimeout(() => node.remove(), SLIDE_MS);
    }
    const merged = new Set(result.merged);
    for (const tile of board.all) {
      const node = nodes.get(tile.id);
      if (node) place(node, tile);
      else if (merged.has(tile.id) || tile.id === result.spawned?.id) {
        const fresh = makeTile(tile, merged.has(tile.id) ? 'merged' : 'new');
        fresh.style.visibility = 'hidden';
        window.setTimeout(() => (fresh.style.visibility = ''), SLIDE_MS);
      }
    }
    showScore(result.gained);
    if (board.won && !wasWon && !wonShown) {
      wonShown = true;
      window.setTimeout(() => {
        winBanner.hidden = false;
        shell.classList.add('is-won');
      }, SLIDE_MS * 2);
    }
    if (board.canMove()) saveProgress();
    else {
      finishPlay('over');
      window.setTimeout(() => {
        overBanner.hidden = false;
        shell.classList.add('is-over');
      }, SLIDE_MS * 4);
    }
  };

  const layout = () => {
    const width = shell.clientWidth;
    const height = shell.clientHeight;
    const size = Math.max(160, Math.min(width - MARGIN * 2, height - TOP_BAR - MARGIN * 2, 620));
    cell = size / (SIZE + (SIZE + 1) * GAP_SHARE);
    gap = cell * GAP_SHARE;
    Object.assign(boardNode.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${(width - size) / 2}px`,
      top: `${TOP_BAR + (height - TOP_BAR - size) / 2}px`,
      borderRadius: `${gap * 1.4}px`,
    });
    cells.forEach((node, i) => {
      Object.assign(node.style, { width: `${cell}px`, height: `${cell}px` });
      place(node, { row: Math.floor(i / SIZE), col: i % SIZE });
    });
    for (const node of nodes.values()) {
      node.style.transition = 'none';
      node.style.width = node.style.height = `${cell}px`;
      const face = node.firstElementChild as HTMLElement;
      face.style.fontSize = `${cell * Number(face.dataset.scale)}px`;
    }
    for (const tile of board.all) {
      const node = nodes.get(tile.id);
      if (node) place(node, tile);
    }
    void tileLayer.offsetWidth;
    for (const node of nodes.values()) node.style.transition = '';
  };

  window.addEventListener('keydown', (event) => {
    const direction = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    move(direction);
  });

  // 끌어서 밀기 (손가락·마우스). 끈 방향 가운데 긴 쪽으로 민다.
  let swipe: { id: number; x: number; y: number } | null = null;
  shell.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('.g2048-button')) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  const endSwipe = (event: PointerEvent) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) {
      // 이긴 표시는 누르기만 해도 닫힌다.
      if (!winBanner.hidden) {
        winBanner.hidden = true;
        shell.classList.remove('is-won');
      }
      return;
    }
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };
  shell.addEventListener('pointerup', endSwipe);
  shell.addEventListener('pointercancel', () => (swipe = null));

  again.addEventListener('click', () => {
    if (!book) return;
    finishPlay('restart');
    wonShown = false;
    newGame();
  });

  layout();
  new ResizeObserver(layout).observe(shell);

  // 기록장을 열고, 하다 만 판이 있으면 이어 한다.
  void (async () => {
    const opened = await openRecordBook<Stats2048, Play2048, Progress2048>(RECORDS_2048);
    let progress: Progress2048 | undefined;
    try {
      await moveLegacyBest(opened);
      stats = await opened.stats();
      progress = await opened.progress();
    } catch (error) {
      warn(error);
    }
    book = opened;
    if (progress) resume(progress);
    else newGame();
  })();

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __game2048: {
        board,
        move,
        get stats() {
          return stats;
        },
        book: () => book,
        /** 개발 확인용: 판을 칸 값으로 채운다. */
        load: (grid: number[][]) => {
          board.load(grid);
          tileLayer.replaceChildren();
          nodes.clear();
          for (const tile of board.all) makeTile(tile, 'none');
        },
      },
    });
  }
}

/** 2048: 판을 밀어 같은 숫자 타일을 합쳐 2048을 만든다. */
export const game2048: GameDefinition = {
  id: '2048',
  start(root) {
    start2048(root);
  },
};
