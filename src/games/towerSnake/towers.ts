/** 타워 종류. 마디 하나가 타워 하나다. */
export type TowerType = 'arrow' | 'cannon' | 'ice' | 'lightning';

export const TOWER_TYPES: readonly TowerType[] = ['arrow', 'cannon', 'ice', 'lightning'];

/** 타워 하나의 공격 값 (단계 4에서 쓴다. 계획서 3.3의 표) */
export interface TowerSpec {
  /** 사거리 (칸) */
  readonly range: number;
  /** 한 번 공격의 피해 */
  readonly damage: number;
  /** 공격 사이 시간 (초) */
  readonly cooldown: number;
  /** 타워 상자로 나오는 비율 (합이 1) */
  readonly weight: number;
}

export const TOWER_SPECS: Readonly<Record<TowerType, TowerSpec>> = {
  /** 한 적에게 빠른 화살. 시작 마디 */
  arrow: { range: 4, damage: 10, cooldown: 0.5, weight: 0.4 },
  /** 떨어진 자리 둘레 1칸에 폭발 */
  cannon: { range: 3.5, damage: 18, cooldown: 1.6, weight: 0.2 },
  /** 한 적을 2초 동안 50% 느리게 */
  ice: { range: 3.5, damage: 4, cooldown: 0.8, weight: 0.2 },
  /** 처음 적에서 가까운 적 3마리로 튐, 튈 때마다 70% */
  lightning: { range: 3, damage: 8, cooldown: 1.2, weight: 0.2 },
};

/** 처음 마디의 타워 */
export const START_TOWER: TowerType = 'arrow';

/** 0~1 난수 하나로 비율에 맞는 타워 종류를 고른다. */
export function pickTower(roll: number): TowerType {
  let sum = 0;
  for (const type of TOWER_TYPES) {
    sum += TOWER_SPECS[type].weight;
    if (roll < sum) return type;
  }
  return TOWER_TYPES[TOWER_TYPES.length - 1];
}
