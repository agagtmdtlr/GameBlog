import { isFiniteNumber, isRecord, type RecordSpec } from '../../lib/save';
import { replay, type Status } from './rules';

/** 판이 끝난 방식. `restart`는 끝나기 전에 처음부터 다시 한 판 */
export type ChessResult = 'win' | 'loss' | 'draw' | 'restart';
/** 판이 끝난 까닭 (`restart`는 `playing`) */
export type ChessReason = Status;

/** 체스 누적 수치 */
export interface ChessStats {
  /** 끝낸 판 수 (끝까지 했거나 도중에 새로 시작한 판) */
  readonly plays: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  /** 가장 적은 수로 이긴 판의 내 수. 이긴 적이 없으면 0 */
  readonly fastestWin: number;
  /** 모든 판에서 내가 둔 수의 합 */
  readonly totalMoves: number;
  /** 무른 횟수의 합 */
  readonly takebacks: number;
}

/** 끝난 판 하나 */
export interface ChessPlay {
  readonly result: ChessResult;
  readonly reason: ChessReason;
  /** 처음부터 둔 수 (UCI, 백·흑 번갈아) */
  readonly moves: readonly string[];
  /** 무른 횟수 */
  readonly takebacks: number;
  /** 끝났을 때의 판 (FEN) */
  readonly fen: string;
}

/** 하다 만 판. 다시 오면 이어서 한다. */
export interface ChessProgress {
  readonly moves: readonly string[];
  readonly takebacks: number;
  /** 판을 시작한 시각 (ms) */
  readonly startedAt: number;
}

export const emptyChessStats = (): ChessStats => ({
  plays: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  fastestWin: 0,
  totalMoves: 0,
  takebacks: 0,
});

/** 백(나)이 둔 수 */
export const playerMoves = (moves: readonly string[]) => Math.ceil(moves.length / 2);

const isMoveList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((move) => typeof move === 'string' && /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move));

const STAT_KEYS = ['plays', 'wins', 'losses', 'draws', 'fastestWin', 'totalMoves', 'takebacks'] as const;
const RESULTS: readonly ChessResult[] = ['win', 'loss', 'draw', 'restart'];
const REASONS: readonly ChessReason[] = ['playing', 'checkmate', 'stalemate', 'fifty', 'repetition', 'material'];

function readStats(data: unknown): ChessStats | undefined {
  if (!isRecord(data)) return undefined;
  const stats = emptyChessStats() as Record<(typeof STAT_KEYS)[number], number>;
  for (const key of STAT_KEYS) {
    const value = data[key];
    if (value !== undefined && !(isFiniteNumber(value) && value >= 0)) return undefined;
    stats[key] = (value as number | undefined) ?? 0;
  }
  return stats;
}

function readPlay(data: unknown): ChessPlay | undefined {
  if (!isRecord(data) || !isMoveList(data.moves)) return undefined;
  const { result, reason, takebacks, fen } = data;
  if (!RESULTS.includes(result as ChessResult) || !REASONS.includes(reason as ChessReason)) return undefined;
  if (!isFiniteNumber(takebacks) || typeof fen !== 'string') return undefined;
  return data as unknown as ChessPlay;
}

function readProgress(data: unknown): ChessProgress | undefined {
  if (!isRecord(data) || !isMoveList(data.moves)) return undefined;
  const { takebacks, startedAt } = data;
  if (!isFiniteNumber(takebacks) || !isFiniteNumber(startedAt)) return undefined;
  // 한 수도 두지 않았거나, 다시 둘 수 없거나, 이미 끝난 판이면 이어 할 것이 없다.
  if (data.moves.length === 0) return undefined;
  const position = replay(data.moves);
  if (!position || position.status() !== 'playing') return undefined;
  return data as unknown as ChessProgress;
}

export const CHESS_RECORDS: RecordSpec<ChessStats, ChessPlay> = {
  game: 'chess',
  version: 1,
  emptyStats: emptyChessStats,
  accumulate: (stats, play) => {
    const mine = playerMoves(play.moves);
    return {
      plays: stats.plays + 1,
      wins: stats.wins + (play.result === 'win' ? 1 : 0),
      losses: stats.losses + (play.result === 'loss' ? 1 : 0),
      draws: stats.draws + (play.result === 'draw' ? 1 : 0),
      fastestWin: play.result === 'win' && (stats.fastestWin === 0 || mine < stats.fastestWin) ? mine : stats.fastestWin,
      totalMoves: stats.totalMoves + mine,
      takebacks: stats.takebacks + play.takebacks,
    };
  },
  migrate(kind, version, data) {
    if (version !== 1) return undefined;
    if (kind === 'stats') return readStats(data);
    if (kind === 'play') return readPlay(data);
    return readProgress(data);
  },
};
