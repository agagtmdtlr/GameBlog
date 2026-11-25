import { isFiniteNumber, isIntegerArray, isRecord, type RecordSpec } from '../../lib/save';
import type { Rgb } from './palette';

/** 색칠 놀이 누적 수치 */
export interface ColoringStats {
  /** 끝낸 판 수 (다 칠했거나 도중에 새로 시작한 판) */
  readonly plays: number;
  /** 다 칠한 판 수 */
  readonly clears: number;
  /** 모든 판에서 누른 횟수 합 (다시 칠하기 포함) */
  readonly paints: number;
  /** 가장 빨리 다 칠한 시간 (초). 아직 없으면 `null` */
  readonly fastestClear: number | null;
  /** 모든 판에서 놀았던 시간 합 (초, 화면이 보일 때만 센다) */
  readonly totalSeconds: number;
}

/** 끝난 판 하나 */
export interface ColoringPlay {
  readonly cleared: boolean;
  readonly paints: number;
  /** 논 시간 (초) */
  readonly seconds: number;
  /** 그 판의 색 묶음 (sRGB 0~1) */
  readonly palette: Rgb[];
  /** 조각 n의 색 번호 (`colors[n - 1]`, 칠하지 않았으면 -1). 끝났을 때의 그림 */
  readonly colors: number[];
}

/** 하다 만 판. 다시 오면 칠하던 그림으로 이어 한다. */
export interface ColoringProgress {
  readonly palette: Rgb[];
  readonly colors: number[];
  readonly paints: number;
  readonly seconds: number;
  /** 판을 시작한 시각 (ms) */
  readonly startedAt: number;
}

export const emptyColoringStats = (): ColoringStats => ({ plays: 0, clears: 0, paints: 0, fastestClear: null, totalSeconds: 0 });

const isPalette = (value: unknown): value is Rgb[] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  value.every((color) => Array.isArray(color) && color.length === 3 && color.every((c) => isFiniteNumber(c) && c >= 0 && c <= 1));

/** 색 번호가 색 묶음 안에 있는지 (-1은 칠하지 않음) */
const isColors = (value: unknown, paletteSize: number): value is number[] =>
  isIntegerArray(value) && value.length > 0 && value.every((n) => n >= -1 && n < paletteSize);

const isCount = (value: unknown) => isFiniteNumber(value) && value >= 0;

function readStats(data: unknown): ColoringStats | undefined {
  if (!isRecord(data)) return undefined;
  const { plays, clears, paints, fastestClear, totalSeconds } = data;
  if (![plays, clears, paints, totalSeconds].every(isCount)) return undefined;
  if (fastestClear !== null && !isCount(fastestClear)) return undefined;
  return data as unknown as ColoringStats;
}

function readPlay(data: unknown): ColoringPlay | undefined {
  if (!isRecord(data) || !isPalette(data.palette) || !isColors(data.colors, data.palette.length)) return undefined;
  if (typeof data.cleared !== 'boolean' || !isCount(data.paints) || !isCount(data.seconds)) return undefined;
  return data as unknown as ColoringPlay;
}

function readProgress(data: unknown): ColoringProgress | undefined {
  if (!isRecord(data) || !isPalette(data.palette) || !isColors(data.colors, data.palette.length)) return undefined;
  if (![data.paints, data.seconds, data.startedAt].every(isCount)) return undefined;
  return data as unknown as ColoringProgress;
}

export const COLORING_RECORDS: RecordSpec<ColoringStats, ColoringPlay> = {
  game: 'coloring',
  version: 1,
  emptyStats: emptyColoringStats,
  accumulate: (stats, play) => ({
    plays: stats.plays + 1,
    clears: stats.clears + (play.cleared ? 1 : 0),
    paints: stats.paints + play.paints,
    fastestClear: play.cleared ? Math.min(stats.fastestClear ?? Infinity, play.seconds) : stats.fastestClear,
    totalSeconds: stats.totalSeconds + play.seconds,
  }),
  migrate(kind, version, data) {
    if (version !== 1) return undefined;
    if (kind === 'stats') return readStats(data);
    if (kind === 'play') return readPlay(data);
    return readProgress(data);
  },
};
