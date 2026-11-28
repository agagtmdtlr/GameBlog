import { createRansomCanvas } from '../../lib/ransomText';
import { openRecordBook, type RecordBook } from '../../lib/save';
import type { GameDefinition } from '../game';
import { chooseHere, type AiReply, type AiRequest } from './aiOptions';
import { ChessView } from './graphics/chessView';
import { CHESS_RECORDS, emptyChessStats, type ChessPlay, type ChessProgress, type ChessResult, type ChessStats } from './records';
import {
  BISHOP,
  BLACK,
  colorOf,
  isPromotionChoice,
  KNIGHT,
  moveToUci,
  parseSquare,
  PAWN,
  Position,
  QUEEN,
  replayRoulette,
  ROOK,
  typeOf,
  WHITE,
  type Move,
  type Player,
  type PromotionType,
  type RouletteLog,
  type Status,
} from './rules';

/** 컴퓨터가 수를 고르는 데 걸리는 시간이 이보다 짧으면 이만큼은 기다린다 (ms). 너무 빨리 두면 정신없다. */
const MIN_THINK_MS = 400;
/** 판이 끝나고 표시가 뜰 때까지 (ms) */
const BANNER_DELAY_MS = 900;
/** 룰렛이 도는 시간 (ms). style.css의 `.chess-wheel-disk` transition과 같게 둔다. */
const SPIN_MS = 1100;
/** 룰렛이 멈춘 뒤 결과를 보여 주는 시간 (ms) */
const SPIN_HOLD_MS = 250;

const ICON_HOME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5"/></svg>';
const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>';
/** 차례 칩의 폰 그림 (가운데 기준) */
const PAWN_PATH = 'M0 -9.6a3.2 3.2 0 1 0 0.01 0ZM-2.8 -4.5h5.6L4.4 3.5h-8.8ZM-6 7h12';

const PROMOTION_ICONS: Record<PromotionType, string> = {
  [QUEEN]:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 3 9h10l3-9-5 4-3-7-3 7Z"/><path d="M6 20.5h12"/></svg>',
  [ROOK]:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h3v2h2V4h2v2h2V4h3v5l-2 2v6l2 2v2H6v-2l2-2v-6L6 9Z"/></svg>',
  [BISHOP]:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.5 3 5 5.5 5 8a5 5 0 0 1-10 0c0-2.5 1.5-5 5-8ZM12 7l2.5 3"/><path d="M9 17h6l1.5 4h-9Z"/></svg>',
  [KNIGHT]:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21h11c0-5-1-9-3-11l1.5-3-3.5 1.5C9.5 8 6 11 5.5 14l2.5.5 3-2-1 3.5Z"/></svg>',
};
const PROMOTION_LABELS: Record<PromotionType, string> = {
  [QUEEN]: '퀸',
  [ROOK]: '룩',
  [BISHOP]: '비숍',
  [KNIGHT]: '나이트',
};

/** 룰렛 판: 위 반쪽이 나(사람), 아래 반쪽이 컴퓨터. 바늘은 위에 고정되고 판이 돈다. */
const WHEEL_SVG = `<svg class="chess-wheel-face" viewBox="-30 -30 60 60" aria-hidden="true">
  <g class="chess-wheel-disk">
    <path d="M-27 0A27 27 0 0 1 27 0Z" fill="#ffd34d"/>
    <path d="M27 0A27 27 0 0 1 -27 0Z" fill="#8fc7ff"/>
    <g transform="translate(0 -12)" fill="none" stroke="#2a221e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cy="-3.4" r="3.2"/><path d="M-6 6.5c0-4 2.7-6 6-6s6 2 6 6Z"/>
    </g>
    <g transform="translate(0 12) rotate(180)" fill="none" stroke="#2a221e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="-7" y="-6" width="14" height="9.5" rx="1.5"/><path d="M-3.5 7h7M0 3.5V7"/>
    </g>
    <path d="M-27 0H27" stroke="#2a221e" stroke-width="2.4"/>
  </g>
  <circle r="27" fill="none" stroke="#2a221e" stroke-width="3"/>
  <circle r="3.6" fill="#2a221e"/>
</svg>
<svg class="chess-wheel-pointer" viewBox="0 0 20 16" aria-hidden="true"><path d="M2 2h16L10 14Z"/></svg>`;

/** 차례 칩: 지금 둘 색. 룰렛이 고른 사람이 이 색을 둔다. */
const SIDE_SVG = `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${PAWN_PATH}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

type ChessBook = RecordBook<ChessStats, ChessPlay, ChessProgress>;

/** 저장에 실패해도 게임은 계속한다. */
const warn = (error: unknown) => console.warn('체스 기록을 저장하지 못했습니다.', error);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 컴퓨터 상대: 워커에서 고르고, 워커를 쓸 수 없으면 화면 스레드에서 고른다. */
function createOpponent() {
  let worker: Worker | null = null;
  const waiting = new Map<number, (move: string | null) => void>();
  try {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<AiReply>) => {
      waiting.get(event.data.id)?.(event.data.move);
      waiting.delete(event.data.id);
    };
    worker.onerror = (event) => {
      console.warn('체스 워커를 쓰지 못해 화면에서 수를 고릅니다.', event.message);
      worker = null;
      for (const [id, resolve] of waiting) resolve(null), waiting.delete(id);
    };
  } catch {
    worker = null;
  }
  let nextId = 1;
  return (log: RouletteLog): Promise<string | null> => {
    const id = nextId++;
    if (!worker) return new Promise((resolve) => setTimeout(() => resolve(chooseHere(log)), 0));
    return new Promise((resolve) => {
      // 워커가 도중에 죽으면 화면에서 다시 고른다.
      waiting.set(id, (move) => resolve(move ?? chooseHere(log)));
      const request: AiRequest = { id, log: { ...log, moves: [...log.moves] } };
      worker!.postMessage(request);
    });
  };
}

/** 끝 표시: 내가 체크메이트해 이김, 컴퓨터가 체크메이트해 짐, 비김 */
type Ending = 'win' | 'checkmate' | 'draw';

/** 룰렛: 반반으로 다음 수를 둘 사람을 고른다. */
const spinPlayer = (): Player => (Math.random() < 0.5 ? 'u' : 'c');

function startChess(root: HTMLElement): void {
  const shell = element('div', 'chess', root);
  const canvas = element('canvas', 'chess-canvas', shell);
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    '룰렛 체스 판. 백과 흑이 번갈아 두고, 수마다 룰렛이 다음 수를 둘 사람을 정한다. 내 차례면 지금 둘 색의 기물을 누르고 갈 칸을 누른다',
  );

  const home = element('a', 'chess-button chess-home', shell);
  home.href = './';
  home.setAttribute('aria-label', '메인으로');
  home.innerHTML = ICON_HOME;
  const again = element('button', 'chess-button chess-again', shell);
  again.type = 'button';
  again.setAttribute('aria-label', '처음부터');
  again.innerHTML = ICON_AGAIN;

  // 사람 룰렛: 수를 둘 때마다 돌아 다음 수를 둘 사람(나·컴퓨터)을 바늘로 가리킨다.
  const wheel = element('div', 'chess-wheel', shell);
  wheel.innerHTML = WHEEL_SVG;
  wheel.setAttribute('role', 'img');
  const disk = wheel.querySelector<SVGGElement>('.chess-wheel-disk')!;
  let wheelAngle = 0;
  // 차례 칩: 지금 둘 색(백·흑)
  const side = element('div', 'chess-side', shell);
  side.innerHTML = SIDE_SVG;
  side.setAttribute('role', 'img');

  const picker = element('div', 'chess-picker', shell);
  picker.hidden = true;
  const pickerRow = element('div', 'chess-picker-row', picker);
  let pickPromotion: ((type: PromotionType | null) => void) | null = null;
  for (const type of [QUEEN, ROOK, BISHOP, KNIGHT] as PromotionType[]) {
    const button = element('button', 'chess-button chess-piece-button', pickerRow);
    button.type = 'button';
    button.innerHTML = PROMOTION_ICONS[type];
    button.setAttribute('aria-label', PROMOTION_LABELS[type]);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      pickPromotion?.(type);
    });
  }
  picker.addEventListener('click', () => pickPromotion?.(null));

  const banners = new Map<Ending, HTMLElement>();
  for (const [ending, text] of [
    ['win', 'YOU WIN!'],
    ['checkmate', 'CHECKMATE'],
    ['draw', 'DRAW'],
  ] as const) {
    const banner = element('div', `chess-banner is-${ending}`, shell);
    banner.append(createRansomCanvas(text, { letterSize: 72, seed: `chess-${ending}` }));
    banner.hidden = true;
    banner.addEventListener('click', () => (banner.hidden = true));
    banners.set(ending, banner);
  }

  const view = new ChessView(canvas);
  const ask = createOpponent();

  let position = new Position();
  let moves: string[] = [];
  /** 수마다 둔 사람 (`u` 나, `c` 컴퓨터) */
  let players = '';
  /** 룰렛이 고른, 다음 수를 둘 사람 */
  let next: Player = 'u';
  let startedAt = Date.now();
  let recorded = false;
  let over = false;
  let book: ChessBook | null = null;
  let stats = emptyChessStats();
  /** 기물이 움직이거나 룰렛이 도는 중 */
  let busy = false;
  /** 판 번호. 새로 시작하면 늘려서 늦게 끝난 움직임·컴퓨터 답을 버린다. */
  let gameToken = 0;
  let thinking = false;
  let selected = -1;
  let legal: Move[] = [];

  const log = (): RouletteLog => ({ moves, players, next });

  const highlight = () => {
    const last = moves.length ? moves[moves.length - 1] : null;
    const lastMove = last ? [parseSquare(last.slice(0, 2)), parseSquare(last.slice(2, 4))] : [];
    const targets = legal
      .filter((move) => move.from === selected && !(move.promotion && move.promotion !== QUEEN))
      .map((move) => ({
        square: move.to,
        capture: position.board[move.to] !== 0 || (move.to === position.enPassant && typeOf(position.board[move.from]) === PAWN),
      }));
    const checks = position.inCheck() ? [position.kingSquare(position.turn)] : [];
    view.setHighlights({ selected, targets, lastMove, checks });
  };

  /** 룰렛을 `player` 쪽에 멈추게 돌린다. `spin`이 거짓이면 돌지 않고 바로 가리킨다. */
  const pointWheel = async (player: Player, spin: boolean): Promise<void> => {
    // 판을 r도 돌리면 판의 -r도 자리가 바늘(위) 아래에 온다. 내 반쪽은 -70~70도, 컴퓨터 반쪽은 110~250도에서 멈춘다.
    const target = (player === 'u' ? 0 : 180) + (Math.random() * 140 - 70);
    const current = ((wheelAngle % 360) + 360) % 360;
    const turn = (((-target - current) % 360) + 360) % 360;
    wheelAngle += turn + (spin ? 720 : 0);
    disk.style.transition = spin ? '' : 'none';
    disk.style.transform = `rotate(${wheelAngle}deg)`;
    wheel.setAttribute('aria-label', player === 'u' ? '내 차례' : '컴퓨터 차례');
    if (!spin) return;
    wheel.classList.add('is-spinning');
    await wait(SPIN_MS);
    wheel.classList.remove('is-spinning');
    wheel.classList.add('is-landed');
    await wait(SPIN_HOLD_MS);
    wheel.classList.remove('is-landed');
  };

  const showState = () => {
    wheel.classList.toggle('is-thinking', thinking);
    side.classList.toggle('is-black', position.turn === BLACK);
    side.setAttribute('aria-label', position.turn === WHITE ? '백 차례' : '흑 차례');
    shell.classList.toggle('is-over', over);
  };

  const saveProgress = () => {
    if (!book || over) return;
    if (moves.length === 0) book.clearProgress().catch(warn);
    else book.saveProgress({ moves: [...moves], players, next, startedAt }).catch(warn);
  };

  const finishPlay = (result: ChessResult, reason: Status) => {
    if (recorded || moves.length === 0 || !book) return;
    recorded = true;
    const play: ChessPlay = { result, reason, moves: [...moves], players, fen: position.fen() };
    book
      .record(play, { startedAt, endedAt: Date.now() })
      .then((updated) => (stats = updated))
      .catch(warn);
    book.clearProgress().catch(warn);
  };

  const hideBanners = () => {
    for (const banner of banners.values()) banner.hidden = true;
  };

  /** 판을 끝낸다. 체크메이트면 마지막 수를 둔 사람이 이긴다. */
  const endGame = (reason: Status) => {
    over = true;
    thinking = false;
    view.setThinking(0);
    const winner = reason === 'checkmate' ? players[players.length - 1] : null;
    const result: ChessResult = winner === 'u' ? 'win' : winner === 'c' ? 'loss' : 'draw';
    finishPlay(result, reason);
    if (reason === 'checkmate') view.topple(position.kingSquare(position.turn));
    const ending: Ending = result === 'win' ? 'win' : result === 'loss' ? 'checkmate' : 'draw';
    const token = gameToken;
    window.setTimeout(() => {
      if (token === gameToken) banners.get(ending)!.hidden = false;
    }, BANNER_DELAY_MS);
    legal = [];
    selected = -1;
    highlight();
    showState();
  };

  /** 룰렛이 고른 사람의 차례를 시작한다. 판이 끝났는지 먼저 본다. */
  const beginTurn = () => {
    const status = position.rouletteStatus();
    if (status !== 'playing') return endGame(status);
    legal = next === 'u' ? position.allowedMoves() : [];
    selected = -1;
    highlight();
    showState();
    saveProgress();
    if (next === 'c') void computerTurn();
  };

  const computerTurn = async () => {
    const token = gameToken;
    thinking = true;
    view.setThinking(position.turn);
    showState();
    const began = performance.now();
    const uci = await ask(log());
    const rest = MIN_THINK_MS - (performance.now() - began);
    if (rest > 0) await wait(rest);
    if (token !== gameToken) return;
    thinking = false;
    view.setThinking(0);
    showState();
    const move = uci ? position.findAllowed(uci) : null;
    if (move) await playMove(move, 'c');
  };

  /** 룰렛을 돌려 다음 사람을 정하고 그 차례를 시작한다. */
  const spinAndBegin = async () => {
    const token = gameToken;
    next = spinPlayer();
    busy = true;
    saveProgress();
    await pointWheel(next, true);
    if (token !== gameToken) return;
    busy = false;
    beginTurn();
  };

  const playMove = async (move: Move, player: Player) => {
    const token = gameToken;
    selected = -1;
    legal = [];
    const effect = position.make(move);
    moves.push(moveToUci(move));
    players += player;
    highlight();
    showState();
    busy = true;
    await view.play(effect);
    if (token !== gameToken) return;
    busy = false;
    const status = position.rouletteStatus();
    if (status !== 'playing') return endGame(status);
    await spinAndBegin();
  };

  /** 판을 `progress`(없으면 처음 판)로 놓는다. */
  const setGame = (progress?: RouletteLog): boolean => {
    const replayed = progress ? replayRoulette(progress) : new Position();
    if (!replayed) return false;
    gameToken++;
    thinking = false;
    busy = false;
    view.setThinking(0);
    position = replayed;
    moves = progress ? [...progress.moves] : [];
    players = progress?.players ?? '';
    over = false;
    recorded = false;
    hideBanners();
    view.setBoard(position.board);
    if (progress) {
      next = progress.next;
      void pointWheel(next, false);
      beginTurn();
    } else {
      // 첫 수도 룰렛이 정한다.
      legal = [];
      selected = -1;
      highlight();
      showState();
      void spinAndBegin();
    }
    return true;
  };

  const newGame = () => {
    startedAt = Date.now();
    setGame();
  };

  const choosePromotion = () =>
    new Promise<PromotionType | null>((resolve) => {
      picker.hidden = false;
      pickPromotion = (type) => {
        picker.hidden = true;
        pickPromotion = null;
        resolve(type);
      };
    });

  const press = async (square: number) => {
    if (!book || over || busy || thinking || next !== 'u' || pickPromotion) return;
    const piece = square >= 0 ? position.board[square] : 0;
    if (selected >= 0 && square !== selected) {
      const candidates = legal.filter((move) => move.from === selected && move.to === square);
      if (candidates.length > 0) {
        let move = candidates[0];
        if (isPromotionChoice(legal, selected, square)) {
          const type = await choosePromotion();
          if (!type) return;
          move = candidates.find((m) => m.promotion === type) ?? move;
        }
        await playMove(move, 'u');
        return;
      }
    }
    selected = piece !== 0 && colorOf(piece) === position.turn && square !== selected ? square : -1;
    highlight();
  };

  // 눌렀다 뗀 자리가 가까우면 누른 것으로 본다.
  let down: { id: number; x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    down = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!down || down.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > 12) return;
    const rect = canvas.getBoundingClientRect();
    void press(view.pick(event.clientX - rect.left, event.clientY - rect.top));
  });
  canvas.addEventListener('pointercancel', () => (down = null));

  again.addEventListener('click', () => {
    if (!book) return;
    if (!over) finishPlay('restart', 'playing');
    pickPromotion?.(null);
    newGame();
  });

  const resize = () => view.resize(shell.clientWidth, shell.clientHeight);
  new ResizeObserver(resize).observe(shell);
  resize();
  view.setBoard(position.board);
  void pointWheel('u', false);
  highlight();
  showState();

  let last = performance.now();
  const frame = (now: number) => {
    const seconds = Math.min((now - last) / 1000, 0.1);
    last = now;
    view.render(seconds);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // 기록장을 열고, 하다 만 판이 있으면 이어 한다.
  void (async () => {
    const opened = await openRecordBook<ChessStats, ChessPlay, ChessProgress>(CHESS_RECORDS);
    let progress: ChessProgress | undefined;
    try {
      stats = await opened.stats();
      progress = await opened.progress();
    } catch (error) {
      warn(error);
    }
    book = opened;
    if (progress && setGame(progress)) startedAt = progress.startedAt;
    else newGame();
  })();

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __chess: {
        view,
        get position() {
          return position;
        },
        get log() {
          return log();
        },
        get stats() {
          return stats;
        },
        book: () => book,
        press,
        /** 개발 확인용: 판 기록으로 판을 바꾼다. */
        setGame,
      },
    });
  }
}

/** 룰렛 체스: 3D 판에서 컴퓨터와 둔다. 백·흑은 번갈아 두고, 수마다 룰렛이 다음 수를 둘 사람을 정한다. */
export const chessGame: GameDefinition = {
  id: 'chess',
  start(root) {
    try {
      startChess(root);
    } catch (error) {
      console.error(error);
      root.textContent = '3D 그래픽을 시작하지 못했습니다. 새로 고쳐 주세요.';
    }
  },
};
