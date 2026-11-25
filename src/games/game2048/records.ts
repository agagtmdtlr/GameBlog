import { isFiniteNumber, isIntegerArray, isRecord, type RecordSpec } from '../../lib/save';
import { SIZE } from './board';

/** 2048 누적 수치 */
export interface Stats2048 {
  /** 끝낸 판 수 (끝까지 했거나 도중에 새로 시작한 판) */
  readonly plays: number;
  /** 더 밀 수 없을 때까지 한 판 수 */
  readonly finished: number;
  /** 2048을 만든 판 수 */
  readonly wins: number;
  /** 가장 높은 점수 */
  readonly best: number;
  /** 가장 큰 타일 */
  readonly bestTile: number;
  /** 모든 판의 점수 합 */
  readonly totalScore: number;
  /** 모든 판의 민 횟수 합 */
  readonly totalMoves: number;
}

/** 끝난 판 하나 */
export interface Play2048 {
  readonly score: number;
  readonly highest: number;
  /** 움직임이 있었던 밀기 횟수 */
  readonly moves: number;
  readonly won: boolean;
  /** `over`: 더 밀 수 없음, `restart`: 도중에 새로 시작함 */
  readonly end: 'over' | 'restart';
  /** 끝났을 때의 판 (0은 빈 칸) */
  readonly grid: number[][];
}

/** 하다 만 판. 다시 오면 이어서 한다. */
export interface Progress2048 {
  readonly grid: number[][];
  readonly score: number;
  readonly won: boolean;
  readonly moves: number;
  /** 판을 시작한 시각 (ms) */
  readonly startedAt: number;
}

export const emptyStats2048 = (): Stats2048 => ({
  plays: 0,
  finished: 0,
  wins: 0,
  best: 0,
  bestTile: 0,
  totalScore: 0,
  totalMoves: 0,
});

const isTileValue = (n: number) => n === 0 || (n >= 2 && (n & (n - 1)) === 0);

/** 4 × 4 판인지, 칸이 0이나 2의 거듭제곱인지 */
export const isGrid = (value: unknown): value is number[][] =>
  Array.isArray(value) && value.length === SIZE && value.every((row) => isIntegerArray(row, SIZE) && row.every(isTileValue));

const STAT_KEYS = ['plays', 'finished', 'wins', 'best', 'bestTile', 'totalScore', 'totalMoves'] as const;

function readStats(data: unknown): Stats2048 | undefined {
  if (!isRecord(data)) return undefined;
  const stats = emptyStats2048() as Record<(typeof STAT_KEYS)[number], number>;
  for (const key of STAT_KEYS) {
    const value = data[key];
    if (value !== undefined && !(isFiniteNumber(value) && value >= 0)) return undefined;
    stats[key] = (value as number | undefined) ?? 0;
  }
  return stats;
}

function readPlay(data: unknown): Play2048 | undefined {
  if (!isRecord(data) || !isGrid(data.grid)) return undefined;
  const { score, highest, moves, won, end } = data;
  if (![score, highest, moves].every(isFiniteNumber) || typeof won !== 'boolean') return undefined;
  if (end !== 'over' && end !== 'restart') return undefined;
  return data as unknown as Play2048;
}

function readProgress(data: unknown): Progress2048 | undefined {
  if (!isRecord(data) || !isGrid(data.grid)) return undefined;
  const { score, won, moves, startedAt } = data;
  if (![score, moves, startedAt].every(isFiniteNumber) || typeof won !== 'boolean') return undefined;
  // 빈 판이면 이어 할 것이 없다.
  if (data.grid.every((row) => row.every((n) => n === 0))) return undefined;
  return data as unknown as Progress2048;
}

export const RECORDS_2048: RecordSpec<Stats2048, Play2048> = {
  game: '2048',
  version: 1,
  emptyStats: emptyStats2048,
  accumulate: (stats, play) => ({
    plays: stats.plays + 1,
    finished: stats.finished + (play.end === 'over' ? 1 : 0),
    wins: stats.wins + (play.won ? 1 : 0),
    best: Math.max(stats.best, play.score),
    bestTile: Math.max(stats.bestTile, play.highest),
    totalScore: stats.totalScore + play.score,
    totalMoves: stats.totalMoves + play.moves,
  }),
  migrate(kind, version, data) {
    if (version !== 1) return undefined;
    if (kind === 'stats') return readStats(data);
    if (kind === 'play') return readPlay(data);
    return readProgress(data);
  },
};

/** 예전에 가장 높은 점수만 남기던 localStorage 열쇠. 처음 열 때 누적 수치로 옮기고 지운다. */
export const LEGACY_BEST_KEY = 'gameblog.2048.best';
