import type { EnemyType } from './enemies';

/** 무리가 나오는 간격 (초) */
export const WAVE_SECONDS = 2;
/** 판에 함께 있을 수 있는 적 수 */
export const MAX_ENEMIES = 250;
/** 큰 녀석(보스)이 나오는 간격 (초) */
export const BOSS_SECONDS = 180;
/** 무리는 머리에서 이 거리(칸) 사이, 화면 바로 밖에 생긴다. */
export const SPAWN_MIN = 10;
export const SPAWN_MAX = 12;
/** 무리 가운데에서 흩어지는 거리 (칸) */
export const GROUP_SPREAD = 1.3;
/** 큰 녀석이 처치되면 갈라지는 젤리 수 */
export const BOSS_SPLIT = 4;

/** 보통 무리에 나오는 적: 나오기 시작하는 때(초)와 비율 */
const WAVE_ENEMIES: readonly { readonly type: EnemyType; readonly from: number; readonly weight: number }[] = [
  { type: 'jelly', from: 0, weight: 1 },
  { type: 'dart', from: 60, weight: 0.6 },
  { type: 'rock', from: 120, weight: 0.4 },
];

/** 한 무리의 수 = 2 + 지난 분 × 2 (단계 7에서 3 → 2) */
export function waveSize(time: number): number {
  return 2 + Math.floor(time / 60) * 2;
}

/** 지금 나올 수 있는 종류 가운데 비율에 맞게 하나를 고른다. `roll`은 0~1 난수다. */
export function pickEnemy(time: number, roll: number): EnemyType {
  const open = WAVE_ENEMIES.filter((e) => time >= e.from);
  const total = open.reduce((sum, e) => sum + e.weight, 0);
  let sum = 0;
  for (const e of open) {
    sum += e.weight / total;
    if (roll < sum) return e.type;
  }
  return open[open.length - 1].type;
}
