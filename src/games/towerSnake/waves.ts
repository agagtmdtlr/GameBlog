import type { EnemyType } from './enemies';

/** 무리가 나오는 간격 (초) */
export const WAVE_SECONDS = 1.5;
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

/** 적이 강해지기 시작하는 때 (초) */
export const GROWTH_FROM = 120;
/** 그 뒤 체력이 한 배 더 느는 데 걸리는 시간 (초) */
export const HP_GROWTH_SECONDS = 90;
/** 그 뒤 빠르기가 한 배 더 느는 데 걸리는 시간 (초). 빠르기는 `MAX_ENEMY_SPEED`에서 멈춘다. */
export const SPEED_GROWTH_SECONDS = 240;

/** 새로 생기는 적의 체력·빠르기 배수 */
export interface EnemyGrowth {
  readonly hp: number;
  readonly speed: number;
}

export const NO_GROWTH: EnemyGrowth = { hp: 1, speed: 1 };

/**
 * 지금 생기는 적이 얼마나 강한지 (2026-11-28 사용자 결정: 시간에 따라 적이 강해진다, 체력과 빠르기 둘 다).
 * 처음 2분은 1배, 그 뒤 체력은 90초마다, 빠르기는 240초마다 1배씩 는다 (5분이면 체력 3배, 빠르기 1.75배).
 * 익숙한 사람도 끝없이 버티지 못하게 한다. 이미 판에 있는 적은 그대로다.
 */
export function enemyGrowth(time: number): EnemyGrowth {
  const after = Math.max(0, time - GROWTH_FROM);
  return { hp: 1 + after / HP_GROWTH_SECONDS, speed: 1 + after / SPEED_GROWTH_SECONDS };
}

/** 보통 무리에 나오는 적: 나오기 시작하는 때(초)와 비율 */
const WAVE_ENEMIES: readonly { readonly type: EnemyType; readonly from: number; readonly weight: number }[] = [
  { type: 'jelly', from: 0, weight: 1 },
  { type: 'dart', from: 60, weight: 0.6 },
  { type: 'rock', from: 120, weight: 0.4 },
];

/** 한 무리의 수 = 1 + 지난 분 × 2 (단계 7에서 3 → 2, 템포를 올리며 1.5초마다로 잦아져 2 → 1) */
export function waveSize(time: number): number {
  return 1 + Math.floor(time / 60) * 2;
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
