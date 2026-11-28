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
  replay,
  ROOK,
  typeOf,
  WHITE,
  type Move,
  type PromotionType,
  type Status,
} from './rules';

/** 컴퓨터가 수를 고르는 데 걸리는 시간이 이보다 짧으면 이만큼은 기다린다 (ms). 너무 빨리 두면 정신없다. */
const MIN_THINK_MS = 450;
/** 판이 끝나고 표시가 뜰 때까지 (ms) */
const BANNER_DELAY_MS = 900;

const ICON_HOME =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5"/></svg>';
const ICON_AGAIN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>';
const ICON_UNDO =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
const ICON_PAWN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3"/><path d="M9.5 11h5L16 18H8ZM6 21h12"/></svg>';

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

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

type ChessBook = RecordBook<ChessStats, ChessPlay, ChessProgress>;

/** 저장에 실패해도 게임은 계속한다. */
const warn = (error: unknown) => console.warn('체스 기록을 저장하지 못했습니다.', error);

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
  return (moves: readonly string[]): Promise<string | null> => {
    const id = nextId++;
    if (!worker) return new Promise((resolve) => setTimeout(() => resolve(chooseHere(moves)), 0));
    return new Promise((resolve) => {
      // 워커가 도중에 죽으면 화면에서 다시 고른다.
      waiting.set(id, (move) => resolve(move ?? chooseHere(moves)));
      const request: AiRequest = { id, moves: [...moves] };
      worker!.postMessage(request);
    });
  };
}

function resultOf(status: Status, position: Position): ChessResult {
  if (status !== 'checkmate') return 'draw';
  // 체크메이트당한 쪽이 지금 차례다. 사람은 백이다.
  return position.turn === BLACK ? 'win' : 'loss';
}

function startChess(root: HTMLElement): void {
  const shell = element('div', 'chess', root);
  const canvas = element('canvas', 'chess-canvas', shell);
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', '체스 판. 백 기물을 누르고 갈 칸을 누른다');

  const home = element('a', 'chess-button chess-home', shell);
  home.href = './';
  home.setAttribute('aria-label', '메인으로');
  home.innerHTML = ICON_HOME;
  const again = element('button', 'chess-button chess-again', shell);
  again.type = 'button';
  again.setAttribute('aria-label', '처음부터');
  again.innerHTML = ICON_AGAIN;
  const undo = element('button', 'chess-button chess-undo', shell);
  undo.type = 'button';
  undo.setAttribute('aria-label', '한 수 무르기');
  undo.innerHTML = ICON_UNDO;

  // 차례 표시: 백 폰, 흑 폰 그림. 차례인 쪽이 튀어나오고, 컴퓨터가 생각하면 흔들린다.
  const turns = element('div', 'chess-turns', shell);
  const whiteTurn = element('div', 'chess-turn is-white', turns);
  whiteTurn.innerHTML = ICON_PAWN;
  whiteTurn.setAttribute('aria-label', '내 차례');
  const blackTurn = element('div', 'chess-turn is-black', turns);
  blackTurn.innerHTML = ICON_PAWN;
  blackTurn.setAttribute('aria-label', '컴퓨터 차례');

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

  const banners: Record<ChessResult, HTMLElement | null> = { win: null, loss: null, draw: null, restart: null };
  for (const [result, text] of [
    ['win', 'YOU WIN!'],
    ['loss', 'CHECKMATE'],
    ['draw', 'DRAW'],
  ] as const) {
    const banner = element('div', `chess-banner is-${result}`, shell);
    banner.append(createRansomCanvas(text, { letterSize: 72, seed: `chess-${result}` }));
    banner.hidden = true;
    banners[result] = banner;
  }

  const view = new ChessView(canvas);
  const ask = createOpponent();

  let position = new Position();
  let moves: string[] = [];
  let takebacks = 0;
  let startedAt = Date.now();
  let recorded = false;
  let over = false;
  let book: ChessBook | null = null;
  let stats = emptyChessStats();
  /** 기물이 움직이는 중 */
  let animating = false;
  /** 컴퓨터에게 묻는 번호. 무르거나 새로 시작하면 늘려서 늦게 온 답을 버린다. */
  let turnToken = 0;
  let thinking = false;
  let selected = -1;
  let legal: Move[] = [];

  const highlight = () => {
    const last = moves.length ? moves[moves.length - 1] : null;
    const lastMove = last ? [parseSquare(last.slice(0, 2)), parseSquare(last.slice(2, 4))] : [];
    const check = position.inCheck() ? position.kingSquare(position.turn) : -1;
    const targets = legal
      .filter((move) => move.from === selected && !(move.promotion && move.promotion !== QUEEN))
      .map((move) => ({ square: move.to, capture: position.board[move.to] !== 0 || (move.to === position.enPassant && typeOf(position.board[move.from]) === PAWN) }));
    view.setHighlights({ selected, targets, lastMove, check });
  };

  const showTurn = () => {
    whiteTurn.classList.toggle('is-active', !over && position.turn === WHITE);
    blackTurn.classList.toggle('is-active', !over && position.turn === BLACK);
    blackTurn.classList.toggle('is-thinking', thinking);
    undo.disabled = over || moves.length === 0;
    shell.classList.toggle('is-over', over);
  };

  const saveProgress = () => {
    if (!book || over) return;
    if (moves.length === 0) book.clearProgress().catch(warn);
    else book.saveProgress({ moves: [...moves], takebacks, startedAt }).catch(warn);
  };

  const finishPlay = (result: ChessResult, reason: Status) => {
    if (recorded || moves.length === 0 || !book) return;
    recorded = true;
    const play: ChessPlay = { result, reason, moves: [...moves], takebacks, fen: position.fen() };
    book
      .record(play, { startedAt, endedAt: Date.now() })
      .then((next) => (stats = next))
      .catch(warn);
    book.clearProgress().catch(warn);
  };

  const hideBanners = () => {
    for (const banner of Object.values(banners)) if (banner) banner.hidden = true;
  };

  /** 판이 끝났는지 보고, 끝났으면 기록을 남기고 표시를 띄운다. */
  const checkEnd = (): boolean => {
    const status = position.status();
    if (status === 'playing') return false;
    over = true;
    const result = resultOf(status, position);
    finishPlay(result, status);
    if (status === 'checkmate') view.topple(position.kingSquare(position.turn));
    window.setTimeout(() => {
      if (!over) return;
      const banner = banners[result];
      if (banner) banner.hidden = false;
    }, BANNER_DELAY_MS);
    showTurn();
    return true;
  };

  const computerTurn = async () => {
    const token = ++turnToken;
    thinking = true;
    view.setThinking(true);
    showTurn();
    const began = performance.now();
    const uci = await ask(moves);
    const wait = MIN_THINK_MS - (performance.now() - began);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (token !== turnToken) return;
    thinking = false;
    view.setThinking(false);
    const move = uci ? position.findMove(uci) : null;
    if (!move) {
      showTurn();
      return;
    }
    await playMove(move);
  };

  const playMove = async (move: Move) => {
    const token = turnToken;
    selected = -1;
    legal = [];
    const effect = position.make(move);
    moves.push(moveToUci(move));
    highlight();
    showTurn();
    animating = true;
    await view.play(effect);
    animating = false;
    if (token !== turnToken) return;
    if (checkEnd()) return;
    saveProgress();
    legal = position.turn === WHITE ? position.legalMoves() : [];
    highlight();
    showTurn();
    if (position.turn === BLACK) void computerTurn();
  };

  /** 판을 처음부터 `list`의 수까지 다시 두고 그대로 그린다. */
  const setMoves = (list: readonly string[]): boolean => {
    const next = replay(list);
    if (!next) return false;
    turnToken++;
    thinking = false;
    view.setThinking(false);
    position = next;
    moves = [...list];
    over = false;
    selected = -1;
    view.setBoard(position.board);
    legal = position.turn === WHITE ? position.legalMoves() : [];
    hideBanners();
    highlight();
    showTurn();
    if (position.turn === BLACK) void computerTurn();
    return true;
  };

  const newGame = () => {
    takebacks = 0;
    startedAt = Date.now();
    recorded = false;
    setMoves([]);
    saveProgress();
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
    if (!book || over || animating || thinking || position.turn !== WHITE || pickPromotion) return;
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
        await playMove(move);
        return;
      }
    }
    selected = piece !== 0 && colorOf(piece) === WHITE && square !== selected ? square : -1;
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

  // 끝난 판의 표시는 누르면 닫혀서 판을 볼 수 있다.
  for (const banner of Object.values(banners)) banner?.addEventListener('click', () => (banner.hidden = true));

  again.addEventListener('click', () => {
    if (!book || animating) return;
    if (!over) finishPlay('restart', 'playing');
    pickPromotion?.(null);
    newGame();
  });

  undo.addEventListener('click', () => {
    if (!book || animating || over || moves.length === 0) return;
    pickPromotion?.(null);
    // 내 차례로 돌아간다: 컴퓨터가 생각 중이면 내 수 하나, 아니면 컴퓨터 수와 내 수 둘을 무른다.
    const back = position.turn === BLACK ? 1 : Math.min(2, moves.length);
    takebacks++;
    setMoves(moves.slice(0, moves.length - back));
    saveProgress();
  });

  const resize = () => view.resize(shell.clientWidth, shell.clientHeight);
  new ResizeObserver(resize).observe(shell);
  resize();
  view.setBoard(position.board);
  highlight();
  showTurn();

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
    if (progress && setMoves(progress.moves)) {
      takebacks = progress.takebacks;
      startedAt = progress.startedAt;
    } else newGame();
  })();

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __chess: {
        view,
        get position() {
          return position;
        },
        get moves() {
          return moves;
        },
        get stats() {
          return stats;
        },
        book: () => book,
        press,
        /** 개발 확인용: 처음부터 UCI 수들을 둔 판으로 바꾼다. */
        setMoves,
      },
    });
  }
}

/** 체스: 3D 판에서 백을 잡고 컴퓨터(흑)와 둔다. */
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
