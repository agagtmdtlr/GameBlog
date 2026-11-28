/**
 * 컴퓨터 상대: 알파-베타 탐색(반복 깊이 늘리기, 잡기만 보는 정지 탐색)과 기물 값·자리 표로 수를 고른다.
 * DOM에 의존하지 않는다. 화면은 `aiWorker.ts`에서 돌려 멈추지 않게 한다.
 */
import { BISHOP, KING, KNIGHT, PAWN, Position, QUEEN, ROOK, typeOf, type Move } from './rules';

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

/** 잡는 수를 먼저(값싼 기물로 비싼 기물을 잡는 수부터), 승진을 그다음으로 본다. */
function orderScore(position: Position, move: Move): number {
  const victim = typeOf(position.board[move.to]);
  const attacker = typeOf(position.board[move.from]);
  let score = 0;
  if (victim) score += 10 * VALUE[victim] - VALUE[attacker];
  if (move.promotion) score += VALUE[move.promotion];
  return score;
}

const ordered = (position: Position, moves: Move[], first?: Move) =>
  moves
    .map((move) => ({
      move,
      score: first && move.from === first.from && move.to === first.to && move.promotion === first.promotion ? 1e9 : orderScore(position, move),
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move);

class TimeUp extends Error {}

export interface SearchOptions {
  /** 이 깊이까지 본다 (반수). */
  readonly maxDepth?: number;
  /** 이 시간(ms)이 지나면 끝낸 깊이의 결과를 쓴다. */
  readonly timeMs?: number;
  /** 최선과 이만큼(센티폰) 차이 안의 수에서 무작위로 고른다. 0이면 늘 최선 */
  readonly spread?: number;
  /** 0 이상 1 미만의 난수 */
  readonly random?: () => number;
  readonly now?: () => number;
}

export interface SearchResult {
  readonly move: Move | null;
  /** 차례인 편 기준 점수 */
  readonly score: number;
  /** 끝까지 본 깊이 */
  readonly depth: number;
  readonly nodes: number;
}

/** 지금 차례인 편의 수를 고른다. 판(`position`)은 끝나면 처음 모습으로 돌아온다. */
export function chooseMove(position: Position, options: SearchOptions = {}): SearchResult {
  const { maxDepth = 4, timeMs = 800, spread = 0, random = Math.random, now = () => performance.now() } = options;
  const deadline = now() + timeMs;
  const rootMoves = position.legalMoves();
  if (rootMoves.length === 0) return { move: null, score: position.inCheck() ? -MATE : 0, depth: 0, nodes: 0 };
  let nodes = 0;
  const ply0 = position.ply;

  const checkTime = () => {
    if ((++nodes & 1023) === 0 && now() > deadline) throw new TimeUp();
  };

  const quiesce = (alpha: number, beta: number): number => {
    checkTime();
    const stand = evaluate(position);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const us = position.turn;
    for (const move of ordered(position, position.pseudoMoves(true))) {
      position.make(move, false);
      if (position.inCheck(us)) {
        position.unmake();
        continue;
      }
      const score = -quiesce(-beta, -alpha);
      position.unmake();
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  const search = (depth: number, alpha: number, beta: number): number => {
    if (depth <= 0) return quiesce(alpha, beta);
    checkTime();
    // 탐색 중 같은 형태가 되풀이되면 무승부로 본다.
    if (position.halfmove >= 100) return 0;
    const us = position.turn;
    let legal = 0;
    let best = -MATE * 2;
    for (const move of ordered(position, position.pseudoMoves())) {
      position.make(move, false);
      if (position.inCheck(us)) {
        position.unmake();
        continue;
      }
      legal++;
      const score = -search(depth - 1, -beta, -alpha);
      position.unmake();
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    if (legal === 0) return position.inCheck() ? -MATE + (position.ply - ply0) : 0;
    return best;
  };

  let result: { move: Move; score: number; depth: number } = { move: rootMoves[0], score: 0, depth: 0 };
  let previousBest: Move | undefined;
  try {
    for (let depth = 1; depth <= maxDepth; depth++) {
      const scored: { move: Move; score: number }[] = [];
      let best = -MATE * 2;
      for (const move of ordered(position, rootMoves, previousBest)) {
        position.make(move, false);
        // 최선과 spread 안에 드는지 알 수 있을 만큼만 좁혀 본다.
        const alpha = Math.max(-MATE * 2, best - spread - 1);
        const score = -search(depth - 1, -MATE * 2, -alpha);
        position.unmake();
        scored.push({ move, score });
        if (score > best) best = score;
      }
      const near = scored.filter((entry) => entry.score >= best - spread);
      const pick = near.find((entry) => entry.score === best)!;
      const chosen = spread > 0 ? near[Math.floor(random() * near.length)] : pick;
      result = { move: chosen.move, score: chosen.score, depth };
      previousBest = pick.move;
      // 체크메이트를 찾았으면 더 볼 것이 없다.
      if (best > MATE / 2) break;
    }
  } catch (error) {
    if (!(error instanceof TimeUp)) throw error;
    while (position.ply > ply0) position.unmake();
  }
  return { ...result, nodes };
}
