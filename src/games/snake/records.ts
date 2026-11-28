import { isFiniteNumber, isRecord, type RecordSpec } from '../../lib/save';

/** 뱀 누적 수치 */
export interface SnakeStats {
  /** 끝낸 판 수 (부딪혔거나 도중에 새로 시작한 판) */
  readonly plays: number;
  /** 판을 모두 채운 판 수 */
  readonly fills: number;
  /** 가장 많이 먹은 수 */
  readonly best: number;
  /** 가장 길었던 몸 길이 */
  readonly longest: number;
  /** 모든 판에서 먹은 수의 합 */
  readonly totalFood: number;
  /** 모든 판에서 나아간 칸 수의 합 */
  readonly totalTicks: number;
  /** 모든 판의 논 시간 합 (초, 일시 정지 뺌) */
  readonly totalSeconds: number;
}

/** 끝난 판 하나 */
export interface SnakePlay {
  readonly score: number;
  readonly length: number;
  readonly ticks: number;
  /** 논 시간 (초, 일시 정지 뺌) */
  readonly seconds: number;
  /** `wall`·`self`: 부딪힘, `full`: 판을 모두 채움, `restart`: 도중에 새로 시작함 */
  readonly end: 'wall' | 'self' | 'full' | 'restart';
}

export const emptySnakeStats = (): SnakeStats => ({
  plays: 0,
  fills: 0,
  best: 0,
  longest: 0,
  totalFood: 0,
  totalTicks: 0,
  totalSeconds: 0,
});

const STAT_KEYS = ['plays', 'fills', 'best', 'longest', 'totalFood', 'totalTicks', 'totalSeconds'] as const;
const ENDS: readonly SnakePlay['end'][] = ['wall', 'self', 'full', 'restart'];

function readStats(data: unknown): SnakeStats | undefined {
  if (!isRecord(data)) return undefined;
  const stats = emptySnakeStats() as Record<(typeof STAT_KEYS)[number], number>;
  for (const key of STAT_KEYS) {
    const value = data[key];
    if (value !== undefined && !(isFiniteNumber(value) && value >= 0)) return undefined;
    stats[key] = (value as number | undefined) ?? 0;
  }
  return stats;
}

function readPlay(data: unknown): SnakePlay | undefined {
  if (!isRecord(data)) return undefined;
  const { score, length, ticks, seconds, end } = data;
  if (![score, length, ticks, seconds].every((n) => isFiniteNumber(n) && n >= 0)) return undefined;
  if (!ENDS.includes(end as SnakePlay['end'])) return undefined;
  return data as unknown as SnakePlay;
}

/** 뱀은 실시간 놀이라 하다 만 판을 남기지 않는다. */
export type SnakeProgress = never;

export const SNAKE_RECORDS: RecordSpec<SnakeStats, SnakePlay> = {
  game: 'snake',
  version: 1,
  emptyStats: emptySnakeStats,
  accumulate: (stats, play) => ({
    plays: stats.plays + 1,
    fills: stats.fills + (play.end === 'full' ? 1 : 0),
    best: Math.max(stats.best, play.score),
    longest: Math.max(stats.longest, play.length),
    totalFood: stats.totalFood + play.score,
    totalTicks: stats.totalTicks + play.ticks,
    totalSeconds: stats.totalSeconds + play.seconds,
  }),
  migrate(kind, version, data) {
    if (version !== 1) return undefined;
    if (kind === 'stats') return readStats(data);
    if (kind === 'play') return readPlay(data);
    return undefined;
  },
};
