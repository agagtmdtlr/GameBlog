import type { SpatialGrid } from './spatialGrid';

/** 적 종류: 젤리, 날쌘이, 바위, 큰 녀석(보스) */
export type EnemyType = 'jelly' | 'dart' | 'rock' | 'boss';

export const ENEMY_TYPES: readonly EnemyType[] = ['jelly', 'dart', 'rock', 'boss'];

export interface EnemySpec {
  readonly hp: number;
  /** 빠르기 (칸/초). 뱀(5)보다 늘 느리다. */
  readonly speed: number;
  /** 몸 반지름 (칸) */
  readonly radius: number;
}

/** 계획서 3.6의 표 */
export const ENEMY_SPECS: Readonly<Record<EnemyType, EnemySpec>> = {
  jelly: { hp: 20, speed: 2.0, radius: 0.3 },
  dart: { hp: 12, speed: 3.6, radius: 0.26 },
  rock: { hp: 90, speed: 1.3, radius: 0.38 },
  boss: { hp: 600, speed: 1.0, radius: 0.7 },
};

/** 몸 마디의 반지름 (칸). 적은 이 원을 벽처럼 돌아간다. */
export const SEGMENT_RADIUS = 0.45;
/** 머리의 반지름 (칸). 적이 이 안에 들어오면 부딪힌다. */
export const HEAD_RADIUS = 0.42;
/** 머리에 부딪힌 적이 튕겨 나가는 처음 빠르기 (칸/초) */
export const KNOCK_SPEED = 7;
/** 튕김이 줄어드는 빠르기 (클수록 빨리 멈춘다) */
const KNOCK_DECAY = 6;
/** 얼음에 맞아 느려졌을 때 빠르기 비율 (단계 4) */
export const SLOW_FACTOR = 0.5;
/** 시간에 따라 빨라져도 넘지 않는 빠르기 (칸/초). 뱀(5)보다 느려야 피할 수 있다. */
export const MAX_ENEMY_SPEED = 4.6;
/** 피해를 받고 하얗게 번쩍이는 시간 (초, 단계 5) */
export const FLASH_SECONDS = 0.12;
/** 마디에 막혔을 때 옆으로 미끄러지는 정도 (빠르기 비율) */
const SLIDE = 0.8;

/** 판 위의 적 하나. 좌표는 칸 단위 실수다 (칸 가운데가 정수). */
export interface Enemy {
  readonly id: number;
  readonly type: EnemyType;
  x: number;
  y: number;
  /** 지난 걸음에 스스로 움직인 빠르기 (그리기가 방향을 정한다) */
  vx: number;
  vy: number;
  /** 튕겨 나가는 빠르기 */
  kx: number;
  ky: number;
  hp: number;
  readonly maxHp: number;
  /** 남은 느려짐 시간 (초, 단계 4) */
  slow: number;
  /** 남은 번쩍임 시간 (초, 단계 5). 피해를 받으면 `FLASH_SECONDS`가 된다. */
  flash: number;
  /** 빠르기 배수 (생길 때 정해진다, 시간에 따라 커진다) */
  readonly pace: number;
}

/** 적 하나를 만든다. `hp`·`pace`는 체력·빠르기 배수다 (시간이 지나면 강해진다, `waves.ts`의 `enemyGrowth`). */
export function createEnemy(id: number, type: EnemyType, x: number, y: number, hp = 1, pace = 1): Enemy {
  const life = Math.round(ENEMY_SPECS[type].hp * hp);
  return { id, type, x, y, vx: 0, vy: 0, kx: 0, ky: 0, hp: life, maxHp: life, slow: 0, flash: 0, pace };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * 적을 `h`초 움직인다: 머리 쪽으로 다가가고, 서로 밀어내고, 몸 마디를 벽처럼 돌아가고, 판 안에 머문다.
 * `segments`는 머리를 뺀 마디 자리, `size`는 판 한 변이다. 머리와 부딪히는 것은 부르는 쪽이 정한다.
 */
export function moveEnemies(
  enemies: readonly Enemy[],
  h: number,
  head: Point,
  segments: readonly Point[],
  grid: SpatialGrid<Enemy>,
  size: number,
): void {
  const decay = Math.exp(-KNOCK_DECAY * h);
  for (const e of enemies) {
    const speed = Math.min(MAX_ENEMY_SPEED, ENEMY_SPECS[e.type].speed * e.pace) * (e.slow > 0 ? SLOW_FACTOR : 1);
    const dx = head.x - e.x;
    const dy = head.y - e.y;
    const d = Math.hypot(dx, dy);
    e.vx = d > 1e-6 ? (dx / d) * speed : 0;
    e.vy = d > 1e-6 ? (dy / d) * speed : 0;
    e.x += (e.vx + e.kx) * h;
    e.y += (e.vy + e.ky) * h;
    e.kx *= decay;
    e.ky *= decay;
    e.slow = Math.max(0, e.slow - h);
    e.flash = Math.max(0, e.flash - h);
  }

  // 서로 밀어내기: 겹친 만큼의 절반씩 (짝마다 한 번)
  grid.clear();
  for (const e of enemies) grid.insert(e, e.x, e.y);
  for (const e of enemies) {
    const reach = ENEMY_SPECS[e.type].radius + ENEMY_SPECS.boss.radius;
    grid.forEachNear(e.x, e.y, Math.ceil(reach), (o) => {
      if (o.id <= e.id) return;
      const min = ENEMY_SPECS[e.type].radius + ENEMY_SPECS[o.type].radius;
      let dx = o.x - e.x;
      let dy = o.y - e.y;
      let d = Math.hypot(dx, dy);
      if (d >= min) return;
      if (d < 1e-6) {
        // 한 점에 겹치면 id로 정한 쪽으로 가른다.
        const angle = (e.id * 2.399 + o.id) % (Math.PI * 2);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        d = 1;
      }
      const push = (min - d) / 2;
      e.x -= (dx / d) * push;
      e.y -= (dy / d) * push;
      o.x += (dx / d) * push;
      o.y += (dy / d) * push;
    });
  }

  // 몸 마디: 원 밖으로 밀어내고 옆으로 미끄러지게 한다 (D2-2, 마디는 피해를 받지 않는다).
  for (const e of enemies) {
    const radius = ENEMY_SPECS[e.type].radius;
    const side = e.id % 2 === 0 ? 1 : -1;
    for (const s of segments) {
      const min = radius + SEGMENT_RADIUS;
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const ny = d > 1e-6 ? dy / d : 0;
      const slide = ENEMY_SPECS[e.type].speed * SLIDE * h * side;
      e.x = s.x + nx * min - ny * slide;
      e.y = s.y + ny * min + nx * slide;
    }
    e.x = Math.min(size - 0.5 - radius, Math.max(radius - 0.5, e.x));
    e.y = Math.min(size - 0.5 - radius, Math.max(radius - 0.5, e.y));
  }
}
