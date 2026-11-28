/**
 * 체스 규칙: 판 상태, 수 만들기(캐슬링·앙파상·승진 포함), 체크·체크메이트·무승부 판정, 수 기록(UCI)과 FEN.
 * 표준 체스 규칙(`legalMoves`, `status`) 위에 룰렛 체스 규칙(`allowedMoves`, `rouletteStatus`, `replayRoulette`)을 둔다.
 * DOM과 three.js에 의존하지 않는다.
 *
 * 룰렛 체스 (2026-11-28 사용자 요청):
 * - 수를 둘 때마다 룰렛이 반반으로 다음 차례를 정한다. 같은 편이 잇달아 둘 수 있다.
 * - 자기 킹을 공격받는 칸에 두는 수도 둘 수 있다 (도박). 상대 킹을 잡으면 이긴다.
 * - 룰렛이 고른 편이 체크인데 피할 수가 없으면 체크메이트로 진다.
 * - 기물은 자기가 마지막으로 떠나온 칸으로 바로 돌아갈 수 없다 (되돌리기 금지).
 *
 * 칸 번호는 `rank * 8 + file`이다 (a1 = 0, h1 = 7, a8 = 56). 기물은 부호 있는 수로 적는다:
 * 백은 양수, 흑은 음수, 0은 빈 칸.
 */

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/** 1: 백, -1: 흑 */
export type Color = 1 | -1;
export const WHITE: Color = 1;
export const BLACK: Color = -1;

/** 승진할 수 있는 기물 */
export type PromotionType = typeof KNIGHT | typeof BISHOP | typeof ROOK | typeof QUEEN;
export const PROMOTION_TYPES: readonly PromotionType[] = [QUEEN, ROOK, BISHOP, KNIGHT];

export interface Move {
  readonly from: number;
  readonly to: number;
  /** 승진하면 그 기물 (절댓값) */
  readonly promotion?: PromotionType;
}

/** 수를 둔 뒤 화면이 따라 그릴 일 */
export interface MoveEffect {
  readonly move: Move;
  /** 움직인 기물 (부호 있음, 승진 전) */
  readonly piece: number;
  /** 잡힌 기물이 있던 칸. 앙파상이면 `to`와 다르다 */
  readonly capturedAt: number | null;
  readonly captured: number;
  /** 캐슬링이면 함께 움직인 룩 */
  readonly rook: { readonly from: number; readonly to: number } | null;
}

/**
 * 판 상태: `playing` 말고는 판이 끝났다. `captured`는 룰렛 체스에서 킹이 잡힌 판이다.
 * `material`은 표준 체스에만 있다 (룰렛 체스에서는 킹끼리도 서로 잡을 수 있다).
 */
export type Status = 'playing' | 'checkmate' | 'captured' | 'stalemate' | 'fifty' | 'repetition' | 'material';

/** 룰렛 체스의 판 기록: 둔 수, 수마다 둔 편, 다음 차례 */
export interface RouletteLog {
  /** 처음부터 둔 수 (UCI) */
  readonly moves: readonly string[];
  /** 수마다 둔 편 (`w`, `b`). `moves`와 길이가 같다 */
  readonly movers: string;
  /** 룰렛이 고른 다음 차례 */
  readonly next: 'w' | 'b';
}

export const colorLetter = (color: Color) => (color === WHITE ? 'w' : 'b');

const CASTLE_WK = 1;
const CASTLE_WQ = 2;
const CASTLE_BK = 4;
const CASTLE_BQ = 8;

export const fileOf = (square: number) => square & 7;
export const rankOf = (square: number) => square >> 3;
export const squareAt = (file: number, rank: number) => rank * 8 + file;
export const colorOf = (piece: number): Color => (piece > 0 ? WHITE : BLACK);
export const typeOf = (piece: number) => Math.abs(piece);

export const squareName = (square: number) => 'abcdefgh'[fileOf(square)] + String(rankOf(square) + 1);
export function parseSquare(name: string): number {
  const file = name.charCodeAt(0) - 97;
  const rank = name.charCodeAt(1) - 49;
  if (name.length !== 2 || file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
  return squareAt(file, rank);
}

const PROMOTION_LETTER: Record<PromotionType, string> = { [KNIGHT]: 'n', [BISHOP]: 'b', [ROOK]: 'r', [QUEEN]: 'q' };
export const moveToUci = (move: Move) =>
  squareName(move.from) + squareName(move.to) + (move.promotion ? PROMOTION_LETTER[move.promotion] : '');

const KNIGHT_STEPS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING_STEPS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** 칸마다 뛸 수 있는 칸 목록 (미리 계산) */
const jumpTable = (steps: number[][]) =>
  Array.from({ length: 64 }, (_, sq) =>
    steps
      .map(([df, dr]) => [fileOf(sq) + df, rankOf(sq) + dr])
      .filter(([f, r]) => f >= 0 && f < 8 && r >= 0 && r < 8)
      .map(([f, r]) => squareAt(f, r)),
  );
const KNIGHT_JUMPS = jumpTable(KNIGHT_STEPS);
const KING_JUMPS = jumpTable(KING_STEPS);
/** 칸마다 방향별로 미끄러져 닿는 칸 목록 */
const rayTable = (dirs: number[][]) =>
  Array.from({ length: 64 }, (_, sq) =>
    dirs.map(([df, dr]) => {
      const ray: number[] = [];
      for (let f = fileOf(sq) + df, r = rankOf(sq) + dr; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) {
        ray.push(squareAt(f, r));
      }
      return ray;
    }),
  );
const ROOK_RAYS = rayTable(ROOK_DIRS);
const BISHOP_RAYS = rayTable(BISHOP_DIRS);

/** 칸이 움직이거나 잡히면 잃는 캐슬링 권리 */
const CASTLE_MASK = new Uint8Array(64).fill(15);
CASTLE_MASK[0] = 15 & ~CASTLE_WQ;
CASTLE_MASK[7] = 15 & ~CASTLE_WK;
CASTLE_MASK[4] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[56] = 15 & ~CASTLE_BQ;
CASTLE_MASK[63] = 15 & ~CASTLE_BK;
CASTLE_MASK[60] = 15 & ~(CASTLE_BK | CASTLE_BQ);

const PIECE_LETTERS = ' pnbrqk';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface Undo {
  readonly move: Move;
  readonly piece: number;
  readonly captured: number;
  readonly capturedAt: number;
  readonly castling: number;
  readonly enPassant: number;
  readonly halfmove: number;
  readonly rook: { from: number; to: number } | null;
  readonly cameFrom: Int8Array;
}

export class Position {
  readonly board = new Int8Array(64);
  turn: Color = WHITE;
  /** 남은 캐슬링 권리 (비트) */
  castling = 0;
  /** 앙파상으로 잡을 수 있는 칸. 없으면 -1 */
  enPassant = -1;
  /** 50수 규칙: 폰을 움직이거나 잡은 뒤 지난 반수 */
  halfmove = 0;
  fullmove = 1;
  /** 칸마다 그 칸의 기물이 마지막으로 떠나온 칸. 없으면 -1 (룰렛 체스의 되돌리기 금지) */
  readonly cameFrom = new Int8Array(64).fill(-1);
  private readonly undos: Undo[] = [];
  /** 같은 형태가 나온 횟수를 세려고 쌓는 형태 열쇠 */
  private readonly keys: string[] = [];

  constructor(fen = START_FEN) {
    this.load(fen);
  }

  load(fen: string): void {
    const [placement, turn, castling, enPassant, halfmove, fullmove] = fen.trim().split(/\s+/);
    const rows = placement?.split('/') ?? [];
    if (rows.length !== 8) throw new Error(`FEN이 아닙니다: ${fen}`);
    this.board.fill(0);
    rows.forEach((row, i) => {
      const rank = 7 - i;
      let file = 0;
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') file += Number(ch);
        else {
          const type = PIECE_LETTERS.indexOf(ch.toLowerCase());
          if (type <= 0 || file > 7) throw new Error(`FEN이 아닙니다: ${fen}`);
          this.board[squareAt(file, rank)] = ch === ch.toUpperCase() ? type : -type;
          file++;
        }
      }
      if (file !== 8) throw new Error(`FEN이 아닙니다: ${fen}`);
    });
    this.turn = turn === 'b' ? BLACK : WHITE;
    this.castling =
      (castling?.includes('K') ? CASTLE_WK : 0) |
      (castling?.includes('Q') ? CASTLE_WQ : 0) |
      (castling?.includes('k') ? CASTLE_BK : 0) |
      (castling?.includes('q') ? CASTLE_BQ : 0);
    this.enPassant = enPassant && enPassant !== '-' ? parseSquare(enPassant) : -1;
    this.halfmove = Number(halfmove) || 0;
    this.fullmove = Number(fullmove) || 1;
    this.cameFrom.fill(-1);
    this.undos.length = 0;
    this.keys.length = 0;
    this.keys.push(this.key());
  }

  fen(): string {
    const rows: string[] = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '';
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[squareAt(file, rank)];
        if (piece === 0) {
          empty++;
          continue;
        }
        if (empty) row += String(empty);
        empty = 0;
        const letter = PIECE_LETTERS[typeOf(piece)];
        row += piece > 0 ? letter.toUpperCase() : letter;
      }
      rows.push(row + (empty ? String(empty) : ''));
    }
    const castling =
      (this.castling & CASTLE_WK ? 'K' : '') +
      (this.castling & CASTLE_WQ ? 'Q' : '') +
      (this.castling & CASTLE_BK ? 'k' : '') +
      (this.castling & CASTLE_BQ ? 'q' : '');
    return [
      rows.join('/'),
      this.turn === WHITE ? 'w' : 'b',
      castling || '-',
      this.enPassant >= 0 ? squareName(this.enPassant) : '-',
      this.halfmove,
      this.fullmove,
    ].join(' ');
  }

  /** 같은 형태인지 비교하는 열쇠: 기물 자리, 캐슬링, 앙파상. 룰렛 체스는 차례가 무작위라 차례는 넣지 않는다. */
  private key(): string {
    return `${this.board.join(',')}|${this.castling}|${this.enPassant}`;
  }

  /** 지금까지 둔 반수 */
  get ply(): number {
    return this.undos.length;
  }

  kingSquare(color: Color): number {
    return this.board.indexOf(KING * color);
  }

  /** `square`를 `by` 편이 공격하는지 */
  isAttacked(square: number, by: Color): boolean {
    const b = this.board;
    // 폰: 공격하는 폰은 by 편 기준으로 한 줄 뒤에 있다.
    const pawnRank = rankOf(square) - by;
    if (pawnRank >= 0 && pawnRank < 8) {
      const file = fileOf(square);
      if (file > 0 && b[squareAt(file - 1, pawnRank)] === PAWN * by) return true;
      if (file < 7 && b[squareAt(file + 1, pawnRank)] === PAWN * by) return true;
    }
    for (const sq of KNIGHT_JUMPS[square]) if (b[sq] === KNIGHT * by) return true;
    for (const sq of KING_JUMPS[square]) if (b[sq] === KING * by) return true;
    for (const ray of ROOK_RAYS[square]) {
      for (const sq of ray) {
        const piece = b[sq];
        if (piece === 0) continue;
        if (piece === ROOK * by || piece === QUEEN * by) return true;
        break;
      }
    }
    for (const ray of BISHOP_RAYS[square]) {
      for (const sq of ray) {
        const piece = b[sq];
        if (piece === 0) continue;
        if (piece === BISHOP * by || piece === QUEEN * by) return true;
        break;
      }
    }
    return false;
  }

  inCheck(color: Color = this.turn): boolean {
    const king = this.kingSquare(color);
    return king >= 0 && this.isAttacked(king, -color as Color);
  }

  /** 자기 킹이 체크에 남는지 따지지 않은 수. `capturesOnly`면 잡기와 승진만 */
  pseudoMoves(capturesOnly = false): Move[] {
    const moves: Move[] = [];
    const b = this.board;
    const us = this.turn;
    const pawnPush = (from: number, to: number) => {
      if (rankOf(to) === 0 || rankOf(to) === 7) {
        for (const promotion of PROMOTION_TYPES) moves.push({ from, to, promotion });
      } else moves.push({ from, to });
    };
    for (let from = 0; from < 64; from++) {
      const piece = b[from];
      if (piece === 0 || colorOf(piece) !== us) continue;
      const type = typeOf(piece);
      if (type === PAWN) {
        const file = fileOf(from);
        const forward = from + 8 * us;
        const lastRank = us === WHITE ? 7 : 0;
        if (b[forward] === 0 && (!capturesOnly || rankOf(forward) === lastRank)) {
          pawnPush(from, forward);
          const startRank = us === WHITE ? 1 : 6;
          if (!capturesOnly && rankOf(from) === startRank && b[forward + 8 * us] === 0) moves.push({ from, to: forward + 8 * us });
        }
        for (const df of [-1, 1]) {
          if (file + df < 0 || file + df > 7) continue;
          const to = forward + df;
          // 앙파상은 방금 두 칸 나온 상대 폰 옆에서만 (룰렛 체스에서는 두 칸 나온 편이 또 둘 수 있다).
          const enPassant = to === this.enPassant && b[to - 8 * us] === -PAWN * us;
          if ((b[to] !== 0 && colorOf(b[to]) !== us) || enPassant) pawnPush(from, to);
        }
        continue;
      }
      const target = (to: number) => {
        const there = b[to];
        if (there === 0) {
          if (!capturesOnly) moves.push({ from, to });
          return true;
        }
        if (colorOf(there) !== us) moves.push({ from, to });
        return false;
      };
      if (type === KNIGHT) for (const to of KNIGHT_JUMPS[from]) target(to);
      else if (type === KING) for (const to of KING_JUMPS[from]) target(to);
      if (type === ROOK || type === QUEEN) for (const ray of ROOK_RAYS[from]) for (const to of ray) if (!target(to)) break;
      if (type === BISHOP || type === QUEEN) for (const ray of BISHOP_RAYS[from]) for (const to of ray) if (!target(to)) break;
    }
    if (!capturesOnly) this.castlingMoves(moves);
    return moves;
  }

  private castlingMoves(moves: Move[]): void {
    const us = this.turn;
    const them = -us as Color;
    const base = us === WHITE ? 0 : 56;
    const kingSide = us === WHITE ? CASTLE_WK : CASTLE_BK;
    const queenSide = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
    if (!(this.castling & (kingSide | queenSide)) || this.board[base + 4] !== KING * us) return;
    if (this.isAttacked(base + 4, them)) return;
    const b = this.board;
    if (
      this.castling & kingSide &&
      b[base + 7] === ROOK * us &&
      b[base + 5] === 0 &&
      b[base + 6] === 0 &&
      !this.isAttacked(base + 5, them) &&
      !this.isAttacked(base + 6, them)
    ) {
      moves.push({ from: base + 4, to: base + 6 });
    }
    if (
      this.castling & queenSide &&
      b[base] === ROOK * us &&
      b[base + 1] === 0 &&
      b[base + 2] === 0 &&
      b[base + 3] === 0 &&
      !this.isAttacked(base + 3, them) &&
      !this.isAttacked(base + 2, them)
    ) {
      moves.push({ from: base + 4, to: base + 2 });
    }
  }

  /** 둘 수 있는 수 */
  legalMoves(capturesOnly = false): Move[] {
    const us = this.turn;
    return this.pseudoMoves(capturesOnly).filter((move) => {
      this.make(move, false);
      const legal = !this.inCheck(us);
      this.unmake();
      return legal;
    });
  }

  /**
   * 수를 둔다. 둘 수 있는 수인지는 검사하지 않는다 (`legalMoves`의 수를 쓴다).
   * `track`이 거짓이면 같은 형태 세기를 건너뛴다 (탐색용).
   */
  make(move: Move, track = true): MoveEffect {
    const b = this.board;
    const piece = b[move.from];
    const us = colorOf(piece);
    const type = typeOf(piece);
    let capturedAt = move.to;
    if (type === PAWN && move.to === this.enPassant && b[move.to] === 0) capturedAt = move.to - 8 * us;
    const captured = b[capturedAt];
    let rook: { from: number; to: number } | null = null;
    if (type === KING && Math.abs(move.to - move.from) === 2) {
      rook = move.to > move.from ? { from: move.from + 3, to: move.from + 1 } : { from: move.from - 4, to: move.from - 1 };
    }
    this.undos.push({
      move,
      piece,
      captured,
      capturedAt,
      castling: this.castling,
      enPassant: this.enPassant,
      halfmove: this.halfmove,
      rook,
      cameFrom: this.cameFrom.slice(),
    });
    const from = this.cameFrom;
    from[capturedAt] = -1;
    from[move.to] = move.from;
    from[move.from] = -1;
    b[capturedAt] = 0;
    b[move.from] = 0;
    b[move.to] = move.promotion ? move.promotion * us : piece;
    if (rook) {
      b[rook.to] = b[rook.from];
      b[rook.from] = 0;
      from[rook.to] = rook.from;
      from[rook.from] = -1;
    }
    this.castling &= CASTLE_MASK[move.from] & CASTLE_MASK[move.to];
    this.enPassant = type === PAWN && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : -1;
    this.halfmove = type === PAWN || captured !== 0 ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = -us as Color;
    if (track) this.keys.push(this.key());
    return { move, piece, captured, capturedAt: captured !== 0 ? capturedAt : null, rook };
  }

  /** 마지막 수를 무른다. `make(…, false)`로 둔 수는 같은 형태 세기에 넣지 않았으므로 맞춰 뺀다. */
  unmake(): void {
    const undo = this.undos.pop();
    if (!undo) return;
    const b = this.board;
    if (this.keys.length > this.undos.length + 1) this.keys.pop();
    const { move } = undo;
    b[move.from] = undo.piece;
    b[move.to] = 0;
    b[undo.capturedAt] = undo.captured;
    if (undo.rook) {
      b[undo.rook.from] = b[undo.rook.to];
      b[undo.rook.to] = 0;
    }
    this.cameFrom.set(undo.cameFrom);
    this.castling = undo.castling;
    this.enPassant = undo.enPassant;
    this.halfmove = undo.halfmove;
    this.turn = colorOf(undo.piece);
    if (this.turn === BLACK) this.fullmove--;
  }

  /** 지금 형태가 이 판에서 몇 번째로 나왔는지 */
  repetitions(): number {
    const now = this.keys[this.keys.length - 1];
    return this.keys.filter((key) => key === now).length;
  }

  /** 어느 쪽도 체크메이트할 수 없는 기물만 남았는지 (킹끼리, 킹과 비숍·나이트 하나, 같은 색 칸의 비숍끼리) */
  insufficientMaterial(): boolean {
    const minors: { type: number; squareColor: number }[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const type = typeOf(this.board[sq]);
      if (type === 0 || type === KING) continue;
      if (type !== KNIGHT && type !== BISHOP) return false;
      minors.push({ type, squareColor: (fileOf(sq) + rankOf(sq)) & 1 });
    }
    if (minors.length <= 1) return true;
    return minors.every((m) => m.type === BISHOP && m.squareColor === minors[0].squareColor);
  }

  status(): Status {
    if (this.legalMoves().length === 0) return this.inCheck() ? 'checkmate' : 'stalemate';
    if (this.insufficientMaterial()) return 'material';
    if (this.halfmove >= 100) return 'fifty';
    if (this.repetitions() >= 3) return 'repetition';
    return 'playing';
  }

  // ─── 룰렛 체스 ───────────────────────────────────────────

  /** 룰렛 체스에서 둘 수 있는 수: 킹을 위험에 두는 수도 되고, 기물이 방금 떠나온 칸으로는 못 간다. */
  allowedMoves(capturesOnly = false): Move[] {
    return this.pseudoMoves(capturesOnly).filter((move) => this.cameFrom[move.from] !== move.to);
  }

  /** 둔 뒤 자기 킹이 공격받지 않는 수 */
  safeMoves(moves: readonly Move[] = this.allowedMoves()): Move[] {
    const us = this.turn;
    return moves.filter((move) => {
      this.make(move, false);
      const safe = !this.inCheck(us);
      this.unmake();
      return safe;
    });
  }

  /** 차례인 편이 상대 킹을 바로 잡을 수 있는 수. 없으면 `null` */
  kingCapture(moves: readonly Move[] = this.allowedMoves()): Move | null {
    const king = this.kingSquare(-this.turn as Color);
    return moves.find((move) => move.to === king) ?? null;
  }

  /**
   * 룰렛 체스의 판 상태 (지금 차례인 편 기준). `captured`·`checkmate`면 차례인 편이 졌다.
   * 차례인 편이 둘 수가 하나도 없는 것은 판이 끝난 것이 아니라 차례를 넘긴다 (화면이 처리한다).
   */
  rouletteStatus(): Status {
    if (this.kingSquare(this.turn) < 0) return 'captured';
    if (this.inCheck() && this.safeMoves().length === 0) return 'checkmate';
    if (this.halfmove >= 100) return 'fifty';
    if (this.repetitions() >= 3) return 'repetition';
    return 'playing';
  }

  /** UCI 글에 맞는 룰렛 체스의 수. 없으면 `null` */
  findAllowed(uci: string): Move | null {
    return this.allowedMoves().find((move) => moveToUci(move) === uci) ?? null;
  }

  /** UCI 글(`e2e4`, `e7e8q`)에 맞는 둘 수 있는 수. 없으면 `null` */
  findMove(uci: string): Move | null {
    return this.legalMoves().find((move) => moveToUci(move) === uci) ?? null;
  }
}

/** 처음부터 UCI 수들을 둔 판. 둘 수 없는 수가 있으면 `null` */
export function replay(moves: readonly string[]): Position | null {
  const position = new Position();
  for (const uci of moves) {
    const move = position.findMove(uci);
    if (!move) return null;
    position.make(move);
  }
  return position;
}

/** 룰렛 체스 판 기록을 처음부터 다시 둔 판. 둘 수 없는 수가 있거나 모양이 틀리면 `null` */
export function replayRoulette(log: RouletteLog): Position | null {
  if (log.movers.length !== log.moves.length || !/^[wb]*$/.test(log.movers)) return null;
  const position = new Position();
  for (let i = 0; i < log.moves.length; i++) {
    if (position.kingSquare(WHITE) < 0 || position.kingSquare(BLACK) < 0) return null;
    position.turn = log.movers[i] === 'w' ? WHITE : BLACK;
    const move = position.findAllowed(log.moves[i]);
    if (!move) return null;
    position.make(move);
  }
  position.turn = log.next === 'w' ? WHITE : BLACK;
  return position;
}

/** 이 칸에서 그 수로 갈 수 있는 수가 여럿이면 승진이다. */
export const isPromotionChoice = (moves: readonly Move[], from: number, to: number) =>
  moves.filter((move) => move.from === from && move.to === to).length > 1;
