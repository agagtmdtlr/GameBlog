import { isFiniteNumber, isRecord, type RecordSpec } from '../../lib/save';
import { TOWER_TYPES, type TowerType } from './towers';

/** 타워 종류마다의 수 */
export type TowerCounts = Readonly<Record<TowerType, number>>;

/** 타워 뱀 누적 수치 (계획서 3.7) */
export interface TowerSnakeStats {
  /** 끝낸 판 수 (끝났거나 도중에 새로 시작한 판) */
  readonly plays: number;
  /** 가장 오래 버틴 시간 (초). 왕관이 보인다. */
  readonly bestSeconds: number;
  /** 한 판에서 가장 많이 처치한 수 */
  readonly bestKills: number;
  /** 가장 길었던 타워 마디 수 */
  readonly longest: number;
  /** 모든 판의 처치 수 합 */
  readonly totalKills: number;
  /** 모든 판의 논 시간 합 (초, 멈춘 때 뺌) */
  readonly totalSeconds: number;
  /** 모든 판에서 먹은 타워 상자 수 합 (종류별) */
  readonly eaten: TowerCounts;
}

/** 끝난 판 하나 */
export interface TowerSnakePlay {
  /** 버틴 시간 (초, 멈춘 때 뺌) */
  readonly seconds: number;
  readonly kills: number;
  /** 이 판에서 가장 길었던 타워 마디 수 */
  readonly longest: number;
  /** 먹은 타워 상자 수 (종류별) */
  readonly eaten: TowerCounts;
  /** `down`: 머리만 남은 채 부딪혀 끝남, `restart`: 도중에 새로 시작함 */
  readonly end: 'down' | 'restart';
  /** 끝났을 때 몸의 타워 (머리 쪽부터) */
  readonly towers: readonly TowerType[];
}

/** 타워 뱀은 실시간 놀이라 하다 만 판을 남기지 않는다. */
export type TowerSnakeProgress = never;

export const emptyTowerCounts = (): Record<TowerType, number> => ({ arrow: 0, cannon: 0, ice: 0, lightning: 0 });

export const emptyTowerSnakeStats = (): TowerSnakeStats => ({
  plays: 0,
  bestSeconds: 0,
  bestKills: 0,
  longest: 0,
  totalKills: 0,
  totalSeconds: 0,
  eaten: emptyTowerCounts(),
});

const STAT_KEYS = ['plays', 'bestSeconds', 'bestKills', 'longest', 'totalKills', 'totalSeconds'] as const;
const ENDS: readonly TowerSnakePlay['end'][] = ['down', 'restart'];

const isCount = (value: unknown): value is number => isFiniteNumber(value) && value >= 0;

/** 종류별 수. 빠진 종류는 0, 이상한 값이 있으면 `undefined` */
function readCounts(data: unknown): TowerCounts | undefined {
  if (data === undefined) return emptyTowerCounts();
  if (!isRecord(data)) return undefined;
  const counts = emptyTowerCounts();
  for (const type of TOWER_TYPES) {
    const value = data[type];
    if (value === undefined) continue;
    if (!isCount(value)) return undefined;
    counts[type] = value;
  }
  return counts;
}

function readStats(data: unknown): TowerSnakeStats | undefined {
  if (!isRecord(data)) return undefined;
  const stats = emptyTowerSnakeStats() as Record<(typeof STAT_KEYS)[number], number> & { eaten: TowerCounts };
  for (const key of STAT_KEYS) {
    const value = data[key];
    if (value !== undefined && !isCount(value)) return undefined;
    stats[key] = (value as number | undefined) ?? 0;
  }
  const eaten = readCounts(data.eaten);
  if (!eaten) return undefined;
  stats.eaten = eaten;
  return stats;
}

function readPlay(data: unknown): TowerSnakePlay | undefined {
  if (!isRecord(data)) return undefined;
  const { seconds, kills, longest, eaten, end, towers } = data;
  if (![seconds, kills, longest].every(isCount)) return undefined;
  if (!ENDS.includes(end as TowerSnakePlay['end'])) return undefined;
  if (!isRecord(eaten) || !readCounts(eaten)) return undefined;
  if (!Array.isArray(towers) || !towers.every((t) => TOWER_TYPES.includes(t as TowerType))) return undefined;
  return data as unknown as TowerSnakePlay;
}

export const TOWER_SNAKE_RECORDS: RecordSpec<TowerSnakeStats, TowerSnakePlay> = {
  game: 'tower-snake',
  version: 1,
  emptyStats: emptyTowerSnakeStats,
  accumulate: (stats, play) => {
    const eaten = emptyTowerCounts();
    for (const type of TOWER_TYPES) eaten[type] = stats.eaten[type] + play.eaten[type];
    return {
      plays: stats.plays + 1,
      bestSeconds: Math.max(stats.bestSeconds, play.seconds),
      bestKills: Math.max(stats.bestKills, play.kills),
      longest: Math.max(stats.longest, play.longest),
      totalKills: stats.totalKills + play.kills,
      totalSeconds: Math.round((stats.totalSeconds + play.seconds) * 10) / 10,
      eaten,
    };
  },
  migrate(kind, version, data) {
    if (version !== 1) return undefined;
    if (kind === 'stats') return readStats(data);
    if (kind === 'play') return readPlay(data);
    return undefined;
  },
};
