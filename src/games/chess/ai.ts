/**
 * 룰렛 체스의 컴퓨터 상대: 기댓값 탐색(expectimax)으로 수를 고른다.
 * 수를 둔 뒤에는 룰렛이 반반으로 차례를 정하므로, 수의 값은 "내가 또 둘 때의 값"과 "상대가 둘 때의 값"의 평균이다.
 * 끝 깊이에서는 잡기만 보는 정지 탐색과 기물 값·자리 표로 판을 잰다.
 * DOM에 의존하지 않는다. 화면은 `aiWorker.ts`에서 돌려 멈추지 않게 한다.
 */
import { BISHOP, KING, KNIGHT, PAWN, Position, QUEEN, ROOK, typeOf, type Color, type Move } from './rules';

/** 기물 값 (센티폰) */
const VALUE = [0, 100, 320, 330, 500, 900, 0];
const MATE = 100_000;

// 자리 표: 백 기준, a8부터 h1 순서로 적는다 (보기 쉬운 순서). 흑은 위아래를 뒤집어 쓴다.
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const PST_KING_MIDDLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const PST_KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];
const PST: Record<number, number[]> = {
  [PAWN]: PST_PAWN,
  [KNIGHT]: PST_KNIGHT,
  [BISHOP]: PST_BISHOP,
  [ROOK]: PST_ROOK,
  [QUEEN]: PST_QUEEN,
};

/** 백 기준 표의 칸 번호: 백은 위아래를 뒤집고(표가 8번째 줄부터라서), 흑은 그대로 쓴다. */
const tableIndex = (square: number, white: boolean) => (white ? square ^ 56 : square);

/** 차례인 편 기준 점수 (센티폰) */
export function evaluate(position: Position): number {
  const b = position.board;
  let score = 0;
  let material = 0;
  for (let sq = 0; sq < 64; sq++) {
    const type = typeOf(b[sq]);
    if (type !== KING && type !== PAWN) material += VALUE[type];
  }
  // 퀸 둘과 나이트 하나쯤 남으면 끝판으로 본다.
  const endgame = material <= 2 * VALUE[QUEEN] + 2 * VALUE[KNIGHT];
  for (let sq = 0; sq < 64; sq++) {
    const piece = b[sq];
    if (piece === 0) continue;
    const type = typeOf(piece);
    const white = piece > 0;
    const table = type === KING ? (endgame ? PST_KING_END : PST_KING_MIDDLE) : PST[type];
    const value = VALUE[type] + table[tableIndex(sq, white)];
    score += white ? value : -value;
  }
  return score * position.turn;
}

/** 잡는 수를 먼저(킹 잡기, 값싼 기물로 비싼 기물을 잡는 수 순서), 승진을 그다음으로 본다. */
function orderScore(position: Position, move: Move): number {
  const victim = typeOf(position.board[move.to]);
  const attacker = typeOf(position.board[move.from]);
  let score = 0;
  if (victim === KING) score += 1e6;
  else if (victim) score += 10 * VALUE[victim] - VALUE[attacker];
  if (move.promotion) score += VALUE[move.promotion];
  return score;
}

const ordered = (position: Position, moves: Move[]) =>
  moves
    .map((move) => ({ move, score: orderScore(position, move) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);

class TimeUp extends Error {}

/** 정지 탐색에서 잡기를 이어 보는 최대 수 */
const QUIESCE_DEPTH = 6;

export interface SearchOptions {
  /** 이 깊이까지 본다 (내 수와 룰렛을 한 단계로 센다). */
  readonly maxDepth?: number;
  /** 이 시간(ms)이 지나면 끝낸 깊이의 결과를 쓴다. 깊이 1은 시간과 상관없이 끝까지 본다. */
  readonly timeMs?: number;
  /** 최선과 이만큼(센티폰) 차이 안의 수에서 무작위로 고른다. 0이면 늘 최선 */
  readonly spread?: number;
  /** 0 이상 1 미만의 난수 */
  readonly random?: () => number;
  readonly now?: () => number;
}

export interface SearchResult {
  readonly move: Move | null;
  /** 차례인 편 기준 기댓값 */
  readonly score: number;
  /** 끝까지 본 깊이 */
  readonly depth: number;
  readonly nodes: number;
}

/** 지금 차례인 편의 룰렛 체스 수를 고른다. 판(`position`)은 끝나면 처음 모습으로 돌아온다. */
export function chooseMove(position: Position, options: SearchOptions = {}): SearchResult {
  const { maxDepth = 3, timeMs = 800, spread = 0, random = Math.random, now = () => performance.now() } = options;
  const deadline = now() + timeMs;
  const rootMoves = position.allowedMoves();
  if (rootMoves.length === 0) return { move: null, score: 0, depth: 0, nodes: 0 };
  let nodes = 0;
  let timed = false;
  const ply0 = position.ply;
  const ply = () => position.ply - ply0;

  const checkTime = () => {
    if (timed && (++nodes & 1023) === 0 && now() > deadline) throw new TimeUp();
  };

  /** 잡기만 이어 보는 정지 탐색 (차례인 편 기준). 킹을 잡을 수 있으면 이긴 것으로 본다. */
  const quiesce = (alpha: number, beta: number, depth: number): number => {
    checkTime();
    const captures = position.allowedMoves(true);
    if (position.kingCapture(captures)) return MATE - ply();
    const stand = evaluate(position);
    if (stand >= beta || depth <= 0) return stand;
    if (stand > alpha) alpha = stand;
    for (const move of ordered(position, captures)) {
      position.make(move, false);
      const score = -quiesce(-beta, -alpha, depth - 1);
      position.unmake();
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  /** 차례인 편(`position.turn`)이 두는 판의 값 */
  const value = (depth: number): number => {
    checkTime();
    const us = position.turn;
    const moves = position.allowedMoves();
    if (position.kingCapture(moves)) return MATE - ply();
    if (position.inCheck(us) && position.safeMoves(moves).length === 0) return -MATE + ply();
    if (moves.length === 0 || position.halfmove >= 100) return 0;
    if (depth <= 0) return quiesce(-MATE * 2, MATE * 2, QUIESCE_DEPTH);
    let best = -MATE * 2;
    for (const move of ordered(position, moves)) best = Math.max(best, chance(move, depth));
    return best;
  };

  /** 수를 둔 뒤 룰렛을 돌린 기댓값 (둔 편 기준) */
  const chance = (move: Move, depth: number): number => {
    const us = position.turn;
    const them = -us as Color;
    position.make(move, false);
    let score: number;
    // 킹을 잡은 수는 둔 단계에서 이긴 것으로 센다 (`value`가 잡을 수 있는 판을 매기는 값과 같다).
    // 그래서 지금 잡는 수가 "다음에 누가 두든 이기는 수"보다 높다.
    if (position.kingSquare(them) < 0) score = MATE - ply() + 1;
    else {
      position.turn = us;
      const again = value(depth - 1);
      position.turn = them;
      const other = -value(depth - 1);
      score = (again + other) / 2;
    }
    position.unmake();
    return score;
  };

  let result: { move: Move; score: number; depth: number } = { move: rootMoves[0], score: 0, depth: 0 };
  try {
    for (let depth = 1; depth <= maxDepth; depth++) {
      timed = depth > 1;
      const scored = ordered(position, rootMoves).map((move) => ({ move, score: chance(move, depth) }));
      const best = Math.max(...scored.map((entry) => entry.score));
      // 이기는 길이 보이면 무작위로 고르지 않고 가장 빠른 길을 둔다.
      const loose = best < MATE / 2 ? spread : 0;
      const near = scored.filter((entry) => entry.score >= best - loose);
      const chosen = loose > 0 ? near[Math.floor(random() * near.length)] : near.find((entry) => entry.score === best)!;
      result = { move: chosen.move, score: chosen.score, depth };
      // 킹을 잡는 수가 있으면 더 볼 것이 없다.
      if (best > MATE / 2) break;
    }
  } catch (error) {
    if (!(error instanceof TimeUp)) throw error;
    while (position.ply > ply0) position.unmake();
  }
  return { ...result, nodes };
}
