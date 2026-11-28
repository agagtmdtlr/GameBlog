import { ENEMY_SPECS, type Enemy, type Point } from './enemies';
import type { SpatialGrid } from './spatialGrid';
import { TOWER_SPECS, type TowerType } from './towers';

/** 날아가는 투사체 종류 (번개는 바로 맞아서 투사체가 없다) */
export type ProjectileType = 'arrow' | 'cannon' | 'ice';

/** 투사체 빠르기 (칸/초) */
export const PROJECTILE_SPEED: Readonly<Record<ProjectileType, number>> = { arrow: 14, cannon: 8, ice: 11 };
/** 판에 함께 날 수 있는 투사체 수 (계획서 5.4) */
export const MAX_PROJECTILES = 200;
/** 대포알이 터지는 반지름 (칸). 적 몸이 이 원에 걸치면 맞는다. */
export const BLAST_RADIUS = 1;
/** 얼음에 맞은 적이 느려지는 시간 (초) */
export const SLOW_SECONDS = 2;
/** 번개가 처음 적에서 더 튀는 수 */
export const CHAIN_JUMPS = 3;
/** 번개가 다음 적으로 튈 수 있는 거리 (칸) */
export const CHAIN_RANGE = 2.5;
/** 번개가 튈 때마다 남는 피해 비율 */
export const CHAIN_FALLOFF = 0.7;

/** 날아가는 투사체. 표적이 살아 있으면 따라가고, 죽었으면 마지막 자리로 간다. */
export interface Projectile {
  readonly id: number;
  readonly type: ProjectileType;
  x: number;
  y: number;
  /** 쏜 자리 (대포알 포물선 높이에 쓴다) */
  readonly sx: number;
  readonly sy: number;
  /** 가는 곳 */
  tx: number;
  ty: number;
  target: Enemy | null;
}

/** 그리기에 알릴 공격 (단계 5에서 맞음·터짐 연출을 더한다) */
export type CombatEvent =
  | { readonly kind: 'blast'; readonly x: number; readonly y: number }
  | { readonly kind: 'bolt'; readonly points: readonly Point[] };

/** 싸움이 보는 판 */
export interface CombatWorld {
  /** 마디마다의 타워 (`towers[i]`가 `towerPoint(i)`에 있다) */
  readonly towers: readonly TowerType[];
  towerPoint(i: number): Point;
  readonly head: Point;
  /** 이번 걸음의 적 격자 (`moveEnemies`가 채운다) */
  readonly grid: SpatialGrid<Enemy>;
  /** 적에게 피해를 준다. 처치했으면 `true` */
  damage(enemy: Enemy, amount: number): boolean;
}

const alive = (e: Enemy) => e.hp > 0;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * `from`에서 `range`칸 안(적 가운데까지)의 적 가운데 머리에 가장 가까운 적 (계획서 3.3, 머리를 지키는 쪽).
 * 같으면 먼저 찾은 적이다. 없으면 `null`
 */
export function findTarget(grid: SpatialGrid<Enemy>, from: Point, range: number, head: Point): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = Infinity;
  // 격자는 걸음 처음의 자리로 나눠 두어서 한 칸 넉넉히 본다.
  grid.forEachNear(from.x, from.y, range + 1, (e) => {
    if (!alive(e) || dist(e, from) > range) return;
    const d = dist(e, head);
    if (d < bestDistance) {
      best = e;
      bestDistance = d;
    }
  });
  return best;
}

/** 타워의 자동 공격: 쿨다운, 표적 고르기, 투사체, 범위 피해, 느려짐, 번개 튀기 (계획서 3.3) */
export class Combat {
  projectiles: Projectile[] = [];
  /** 타워마다 다음 공격까지 남은 시간 (초). `towers`와 길이를 맞춘다. */
  private cooldowns: number[] = [];
  private nextId = 1;

  reset(): void {
    this.projectiles = [];
    this.cooldowns = [];
    this.nextId = 1;
  }

  /** `h`초 싸운다: 준비된 타워가 쏘고, 투사체가 날아가 맞는다. 그릴 공격을 `out`에 더한다. */
  step(h: number, world: CombatWorld, out: CombatEvent[]): void {
    // 마디를 잃으면 꼬리 끝 타워가 빠지고, 먹으면 꼬리 끝에 붙는다. 새 타워는 바로 쏠 수 있다.
    if (this.cooldowns.length > world.towers.length) this.cooldowns.length = world.towers.length;
    while (this.cooldowns.length < world.towers.length) this.cooldowns.push(0);

    for (let i = 0; i < world.towers.length; i++) {
      this.cooldowns[i] -= h;
      if (this.cooldowns[i] > 0) continue;
      this.cooldowns[i] = 0;
      const type = world.towers[i];
      const spec = TOWER_SPECS[type];
      const from = world.towerPoint(i);
      const target = findTarget(world.grid, from, spec.range, world.head);
      if (!target) continue;
      if (type === 'lightning') {
        this.chain(target, spec.damage, world, from, out);
      } else {
        if (this.projectiles.length >= MAX_PROJECTILES) continue;
        this.projectiles.push({ id: this.nextId++, type, x: from.x, y: from.y, sx: from.x, sy: from.y, tx: target.x, ty: target.y, target });
      }
      this.cooldowns[i] = spec.cooldown;
    }

    this.fly(h, world, out);
  }

  /** 투사체를 움직이고, 닿은 것을 터뜨린다. */
  private fly(h: number, world: CombatWorld, out: CombatEvent[]): void {
    const flying: Projectile[] = [];
    for (const p of this.projectiles) {
      if (p.target && alive(p.target)) {
        p.tx = p.target.x;
        p.ty = p.target.y;
      } else {
        p.target = null;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const move = PROJECTILE_SPEED[p.type] * h;
      if (d > move) {
        p.x += (dx / d) * move;
        p.y += (dy / d) * move;
        flying.push(p);
        continue;
      }
      p.x = p.tx;
      p.y = p.ty;
      this.land(p, world, out);
    }
    this.projectiles = flying;
  }

  /** 투사체가 닿았다. 화살·얼음은 표적이 죽었으면 헛맞고, 대포알은 그 자리에서 터진다. */
  private land(p: Projectile, world: CombatWorld, out: CombatEvent[]): void {
    const damage = TOWER_SPECS[p.type].damage;
    if (p.type === 'cannon') {
      out.push({ kind: 'blast', x: p.x, y: p.y });
      const hit: Enemy[] = [];
      world.grid.forEachNear(p.x, p.y, BLAST_RADIUS + ENEMY_SPECS.boss.radius + 1, (e) => {
        if (alive(e) && dist(e, p) <= BLAST_RADIUS + ENEMY_SPECS[e.type].radius) hit.push(e);
      });
      // 갈라진 젤리처럼 이번 걸음에 생겨 격자에 없는 표적도 맞힌다.
      if (p.target && alive(p.target) && !hit.includes(p.target)) hit.push(p.target);
      for (const e of hit) world.damage(e, damage);
      return;
    }
    if (!p.target || !alive(p.target)) return;
    if (p.type === 'ice') p.target.slow = SLOW_SECONDS;
    world.damage(p.target, damage);
  }

  /** 번개: 표적을 맞히고, 맞은 적에서 가장 가까운 새 적으로 `CHAIN_JUMPS`번 튄다. 튈 때마다 약해진다. */
  private chain(first: Enemy, damage: number, world: CombatWorld, from: Point, out: CombatEvent[]): void {
    const points: Point[] = [{ x: from.x, y: from.y }];
    const struck = new Set<Enemy>();
    let current: Enemy | null = first;
    let amount = damage;
    for (let jump = 0; current && jump <= CHAIN_JUMPS; jump++) {
      const at: Enemy = current;
      struck.add(at);
      points.push({ x: at.x, y: at.y });
      world.damage(at, amount);
      amount *= CHAIN_FALLOFF;
      let next: Enemy | null = null;
      let nextDistance = Infinity;
      world.grid.forEachNear(at.x, at.y, CHAIN_RANGE + 1, (e) => {
        if (!alive(e) || struck.has(e)) return;
        const d = dist(e, at);
        if (d <= CHAIN_RANGE && d < nextDistance) {
          next = e;
          nextDistance = d;
        }
      });
      current = next;
    }
    out.push({ kind: 'bolt', points });
  }
}
