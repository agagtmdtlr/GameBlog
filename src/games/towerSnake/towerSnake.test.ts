import { describe, expect, it } from 'vitest';
import {
  BLAST_RADIUS,
  CHAIN_FALLOFF,
  CHAIN_JUMPS,
  CHAIN_RANGE,
  Combat,
  findTarget,
  MAX_PROJECTILES,
  SLOW_SECONDS,
  type CombatEvent,
  type CombatWorld,
} from './combat';
import { createEnemy, type Enemy } from './enemies';
import { ENEMY_SPECS, FLASH_SECONDS, HEAD_RADIUS, SEGMENT_RADIUS, type Point } from './enemies';
import { seededRandom } from './random';
import { emptyTowerSnakeStats, TOWER_SNAKE_RECORDS, type TowerSnakePlay } from './records';
import { SpatialGrid } from './spatialGrid';
import { pickTower, TOWER_SPECS, TOWER_TYPES, type TowerType } from './towers';
import {
  BOARD,
  BOX_COUNT,
  BOX_MIN_DISTANCE,
  ENEMY_STEP,
  INVULNERABLE_SECONDS,
  MAX_SEGMENTS,
  SPEED,
  START_SEGMENTS,
  TowerSnakeWorld,
  type Cell,
  type KillEvent,
} from './world';
import { BOSS_SECONDS, GROUP_SPREAD, MAX_ENEMIES, pickEnemy, SPAWN_MAX, SPAWN_MIN, WAVE_SECONDS, waveSize } from './waves';

const row = (y: number, ...xs: number[]): Cell[] => xs.map((x) => ({ x, y }));
const STEP_SECONDS = 1 / SPEED;

describe('타워 뱀 판 (단계 1)', () => {
  it('큰 판 가운데에서 머리와 타워 마디 둘로 오른쪽을 보고 시작한다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    const mid = Math.floor(BOARD / 2);
    expect(BOARD).toBeGreaterThan(15);
    expect(world.head).toEqual({ x: mid, y: mid });
    expect(world.segments).toBe(START_SEGMENTS);
    expect(world.snake.direction).toBe('right');
    expect(world.alive).toBe(true);
  });

  it('SPEED마다 한 칸 나아가고, 남은 시간은 alpha가 된다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    const start = world.head.x;
    expect(world.update(STEP_SECONDS * 0.5)).toHaveLength(0);
    expect(world.alpha).toBeCloseTo(0.5);
    expect(world.update(STEP_SECONDS * 2)).toHaveLength(2);
    expect(world.head.x).toBe(start + 2);
    expect(world.ticks).toBe(2);
    expect(world.time).toBeCloseTo(STEP_SECONDS * 2.5);
  });

  it('울타리에 닿으면 꼬리 마디를 잃고 오른쪽으로 꺾어 판 안에 남는다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    world.load(row(5, BOARD - 1, BOARD - 2, BOARD - 3, BOARD - 4), 'right', undefined, []);
    const event = world.tick();
    expect(event.hit).toBe('wall');
    expect(event.turned).toBe(true);
    expect(event.hurt).toEqual({ applied: true, lost: { x: BOARD - 4, y: 5 }, lostTower: 'arrow', over: false });
    expect(world.snake.direction).toBe('down');
    expect(world.head).toEqual({ x: BOARD - 1, y: 6 });
    expect(world.segments).toBe(2);
    expect(world.invulnerable).toBe(INVULNERABLE_SECONDS);
  });

  it('모서리라 오른쪽도 울타리면 왼쪽으로 꺾는다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    world.load(row(BOARD - 1, BOARD - 1, BOARD - 2, BOARD - 3), 'right', undefined, []);
    world.tick();
    expect(world.snake.direction).toBe('up');
    expect(world.head).toEqual({ x: BOARD - 1, y: BOARD - 2 });
  });

  it('받아 둔 방향이 울타리 쪽이면 버리고 그대로 나아간다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    world.load(row(0, 10, 9, 8), 'right', undefined, []);
    world.turn('up');
    const event = world.tick();
    expect(event.hit).toBeNull();
    expect(world.head).toEqual({ x: 11, y: 0 });
    expect(world.segments).toBe(2);
  });

  it('제 몸에 들어가면 지나가며 꼬리 마디 하나를 잃는다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    // 머리 (5,5)에서 왼쪽은 (4,5). 몸이 (4,5)를 지나간다.
    world.load([{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 4, y: 4 }, { x: 4, y: 3 }], 'up', undefined, []);
    world.turn('left');
    const event = world.tick();
    expect(event.hit).toBe('self');
    expect(event.hurt?.lost).toEqual({ x: 4, y: 3 });
    expect(world.head).toEqual({ x: 4, y: 5 });
    expect(world.segments).toBe(4);
  });

  it('빠져나가는 꼬리 칸으로 들어가는 것은 부딪힘이 아니다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    world.load([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }], 'left', undefined, []);
    world.turn('down');
    expect(world.tick().hit).toBeNull();
  });

  it('무적 동안에는 마디를 잃지 않지만 울타리에서는 꺾는다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    world.load(row(5, BOARD - 2, BOARD - 3, BOARD - 4, BOARD - 5), 'right', undefined, []);
    world.invulnerable = 0.5;
    world.tick();
    const event = world.tick();
    expect(event.hit).toBe('wall');
    expect(event.hurt?.applied).toBe(false);
    expect(world.segments).toBe(3);
    expect(world.snake.direction).toBe('down');
  });

  it('무적 시간은 흐르는 시간만큼 줄어든다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    world.hurt('wall');
    world.update(0.4);
    expect(world.invulnerable).toBeCloseTo(INVULNERABLE_SECONDS - 0.4);
    world.update(1);
    expect(world.invulnerable).toBe(0);
  });

  it('머리만 남은 채로 피해를 받으면 끝나고 더 나아가지 않는다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    world.load([{ x: BOARD - 1, y: 5 }], 'right', undefined, []);
    const event = world.tick();
    expect(event.hurt?.over).toBe(true);
    expect(world.alive).toBe(false);
    expect(world.head).toEqual({ x: BOARD - 1, y: 5 });
    expect(world.update(1)).toEqual([]);
    expect(world.turn('up')).toBe(false);
  });

  it('처음부터 다시 하면 처음 상태로 돌아간다', () => {
    const world = new TowerSnakeWorld(seededRandom(7));
    world.update(2);
    world.hurt('enemy');
    world.reset();
    expect(world.segments).toBe(START_SEGMENTS);
    expect(world.time).toBe(0);
    expect(world.invulnerable).toBe(0);
    expect(world.alive).toBe(true);
  });
});

describe('타워 상자와 타워 (단계 2)', () => {
  const key = (c: Cell) => c.y * BOARD + c.x;

  it('판에 늘 상자 3개가 몸·서로와 겹치지 않고 머리에서 멀리 있다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const world = new TowerSnakeWorld(seededRandom(seed));
      expect(world.boxes).toHaveLength(BOX_COUNT);
      const cells = new Set(world.boxes.map((b) => key(b.cell)));
      expect(cells.size).toBe(BOX_COUNT);
      for (const box of world.boxes) {
        expect(world.snake.occupies(box.cell)).toBe(false);
        expect(Math.max(Math.abs(box.cell.x - world.head.x), Math.abs(box.cell.y - world.head.y))).toBeGreaterThan(BOX_MIN_DISTANCE);
      }
    }
  });

  it('처음 마디는 모두 화살 타워다', () => {
    const world = new TowerSnakeWorld(seededRandom(3));
    expect(world.towers).toEqual(Array.from({ length: START_SEGMENTS }, () => 'arrow'));
  });

  it('상자를 먹으면 꼬리 끝에 그 타워 마디가 붙고, 새 상자가 생겨 늘 같은 수다', () => {
    const world = new TowerSnakeWorld(seededRandom(5));
    // 먹을 상자 하나와 멀리 있는 나머지 (늘 `BOX_COUNT`개)
    const far = Array.from({ length: BOX_COUNT - 1 }, (_, i) => ({ cell: { x: 0, y: i }, type: 'arrow' as TowerType }));
    world.load(row(10, 10, 9, 8), 'right', ['arrow', 'ice'], [{ cell: { x: 11, y: 10 }, type: 'cannon' }, ...far]);
    const event = world.tick();
    expect(event.eat?.box.type).toBe('cannon');
    expect(event.eat?.replaced).toBe(false);
    expect(world.body).toEqual(row(10, 11, 10, 9, 8));
    expect(world.towers).toEqual(['arrow', 'ice', 'cannon']);
    expect(world.boxes).toHaveLength(BOX_COUNT);
    expect(world.boxes.some((b) => b.cell.x === 11 && b.cell.y === 10)).toBe(false);
    expect(event.eat?.spawned).not.toBeNull();
    expect(world.eaten.cannon).toBe(1);
    expect(world.longest).toBe(3);
  });

  it('마디가 40개면 늘지 않고 꼬리 끝 타워만 먹은 것으로 바뀐다', () => {
    const world = new TowerSnakeWorld(seededRandom(5));
    const body = Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => ({ x: 40 - i, y: 3 }));
    const towers = Array.from({ length: MAX_SEGMENTS }, () => 'arrow' as TowerType);
    world.load(body, 'down', towers, [{ cell: { x: 40, y: 4 }, type: 'lightning' }]);
    const event = world.tick();
    expect(event.eat?.replaced).toBe(true);
    expect(world.segments).toBe(MAX_SEGMENTS);
    expect(world.towers).toHaveLength(MAX_SEGMENTS);
    expect(world.towers[MAX_SEGMENTS - 1]).toBe('lightning');
    expect(world.towers[MAX_SEGMENTS - 2]).toBe('arrow');
  });

  it('마디를 잃으면 꼬리 끝 타워도 잃는다', () => {
    const world = new TowerSnakeWorld(seededRandom(5));
    world.load(row(5, BOARD - 1, BOARD - 2, BOARD - 3, BOARD - 4), 'right', ['arrow', 'cannon', 'ice'], []);
    const event = world.tick();
    expect(event.hurt?.lostTower).toBe('ice');
    expect(world.towers).toEqual(['arrow', 'cannon']);
  });

  it('울타리에서 꺾은 칸에 상자가 있으면 마디를 잃고 그 상자를 먹는다', () => {
    const world = new TowerSnakeWorld(seededRandom(5));
    world.load(row(5, BOARD - 1, BOARD - 2, BOARD - 3), 'right', ['arrow', 'arrow'], [{ cell: { x: BOARD - 1, y: 6 }, type: 'ice' }]);
    const event = world.tick();
    expect(event.hit).toBe('wall');
    expect(event.eat?.box.type).toBe('ice');
    expect(world.towers).toEqual(['arrow', 'ice']);
  });

  it('비율에 맞게 타워 종류를 고른다', () => {
    expect(TOWER_TYPES.reduce((sum, t) => sum + TOWER_SPECS[t].weight, 0)).toBeCloseTo(1);
    expect(pickTower(0)).toBe('arrow');
    expect(pickTower(0.39)).toBe('arrow');
    expect(pickTower(0.41)).toBe('cannon');
    expect(pickTower(0.61)).toBe('ice');
    expect(pickTower(0.81)).toBe('lightning');
    expect(pickTower(0.9999)).toBe('lightning');
    const counts: Record<string, number> = {};
    const random = seededRandom(11);
    for (let i = 0; i < 4000; i++) {
      const t = pickTower(random());
      counts[t] = (counts[t] ?? 0) + 1;
    }
    expect(counts.arrow / 4000).toBeGreaterThan(0.35);
    expect(counts.arrow / 4000).toBeLessThan(0.45);
  });

  it('타워 수가 마디 수와 다르게 놓으면 알린다', () => {
    const world = new TowerSnakeWorld(seededRandom(1));
    expect(() => world.load(row(5, 5, 4, 3), 'right', ['arrow'], [])).toThrow();
  });

  it('같은 씨앗이면 같은 상자가 생긴다', () => {
    const a = new TowerSnakeWorld(seededRandom(42));
    const b = new TowerSnakeWorld(seededRandom(42));
    expect(a.boxes).toEqual(b.boxes);
  });
});

describe('적 (단계 3)', () => {
  /** 몸을 놓고 상자와 적을 비운다. */
  const empty = (seed = 9) => {
    const world = new TowerSnakeWorld(seededRandom(seed));
    world.boxes = [];
    world.enemies = [];
    return world;
  };
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  it('격자는 가까운 통의 물체만 돌려준다', () => {
    const grid = new SpatialGrid<string>(10);
    grid.insert('a', 2, 2);
    grid.insert('b', 2.4, 3.2);
    grid.insert('c', 8, 8);
    grid.insert('d', -5, 20);
    const near: string[] = [];
    grid.forEachNear(2, 2, 1, (v) => near.push(v));
    expect(near.sort()).toEqual(['a', 'b']);
    const corner: string[] = [];
    grid.forEachNear(0, 9, 0, (v) => corner.push(v));
    expect(corner).toEqual(['d']);
  });

  it('무리 크기는 분마다 2씩 늘고, 종류는 때가 되어야 나온다', () => {
    expect(waveSize(0)).toBe(2);
    expect(waveSize(59)).toBe(2);
    expect(waveSize(60)).toBe(4);
    expect(waveSize(150)).toBe(6);
    for (let roll = 0; roll < 1; roll += 0.05) expect(pickEnemy(30, roll)).toBe('jelly');
    const after1 = new Set(Array.from({ length: 20 }, (_, i) => pickEnemy(90, i / 20)));
    expect([...after1].sort()).toEqual(['dart', 'jelly']);
    const after2 = new Set(Array.from({ length: 20 }, (_, i) => pickEnemy(130, i / 20)));
    expect([...after2].sort()).toEqual(['dart', 'jelly', 'rock']);
  });

  it('적 빠르기는 모두 뱀보다 느리다', () => {
    for (const spec of Object.values(ENEMY_SPECS)) expect(spec.speed).toBeLessThan(SPEED);
  });

  it('2초마다 머리에서 10~12칸 떨어진 판 안에 무리가 생긴다', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const world = new TowerSnakeWorld(seededRandom(seed));
      world.update(WAVE_SECONDS - 0.05);
      expect(world.enemies).toHaveLength(0);
      world.update(0.1);
      expect(world.enemies).toHaveLength(waveSize(0));
      const head = world.point(0);
      for (const e of world.enemies) {
        expect(e.type).toBe('jelly');
        expect(dist(e, head)).toBeGreaterThan(SPAWN_MIN - GROUP_SPREAD - 0.5);
        expect(dist(e, head)).toBeLessThan(SPAWN_MAX + GROUP_SPREAD + 0.5);
        expect(e.x).toBeGreaterThanOrEqual(-0.5);
        expect(e.x).toBeLessThanOrEqual(BOARD - 0.5);
        expect(e.y).toBeGreaterThanOrEqual(-0.5);
        expect(e.y).toBeLessThanOrEqual(BOARD - 0.5);
      }
    }
  });

  it('구석에 있어도 무리는 판 안에 생긴다', () => {
    const world = empty(3);
    world.load(row(0, 2, 1, 0), 'right', undefined, []);
    world.enemies = [];
    world.update(WAVE_SECONDS + 0.05);
    expect(world.enemies.length).toBeGreaterThan(0);
    for (const e of world.enemies) {
      expect(e.x).toBeGreaterThanOrEqual(-0.5);
      expect(e.y).toBeGreaterThanOrEqual(-0.5);
    }
  });

  it('3분마다 큰 녀석이 나오고(한계와 상관없이), 보통 적은 250마리를 넘지 않는다', () => {
    const world = empty(4);
    // 오래 버티게 무적을 늘 채우고, 울타리를 피해 판을 돈다.
    let boss = 0;
    for (let t = 0; t < BOSS_SECONDS + 1; t += 0.1) {
      world.load([{ x: 20, y: 20 }], 'right', [], []);
      world.invulnerable = 10;
      world.update(0.1);
      boss = Math.max(boss, world.enemies.filter((e) => e.type === 'boss').length);
      expect(world.enemies.filter((e) => e.type !== 'boss').length).toBeLessThanOrEqual(MAX_ENEMIES);
    }
    expect(boss).toBe(1);
  });

  it('적은 머리 쪽으로 다가간다', () => {
    const world = empty();
    world.load(row(20, 20, 19, 18), 'right', undefined, []);
    const enemy = world.spawnEnemy('jelly', 20, 30);
    const before = dist(enemy, world.point(0));
    world.update(0.5);
    expect(dist(enemy, world.point(0))).toBeLessThan(before - 0.5);
    expect(enemy.vy).toBeLessThan(0);
  });

  it('한 점에 겹친 적은 서로 밀어낸다', () => {
    const world = empty();
    world.load(row(5, 5, 4, 3), 'right', undefined, []);
    const a = world.spawnEnemy('jelly', 30, 30);
    const b = world.spawnEnemy('jelly', 30, 30);
    world.update(0.1);
    expect(dist(a, b)).toBeGreaterThan(ENEMY_SPECS.jelly.radius * 2 - 0.05);
  });

  it('적은 몸 마디에 들어가지 않고 돌아간다 (마디는 피해 없음)', () => {
    const world = empty();
    // 세로로 선 몸. 머리는 위쪽 끝, 적은 몸 오른쪽에서 머리 쪽으로 온다.
    world.load([{ x: 20, y: 10 }, ...Array.from({ length: 8 }, (_, i) => ({ x: 20, y: 11 + i }))], 'up', undefined, []);
    const enemy = world.spawnEnemy('jelly', 23, 16);
    let minGap = Infinity;
    for (let i = 0; i < 30; i++) {
      world.invulnerable = 10;
      world.update(ENEMY_STEP);
      for (let k = 1; k < world.body.length; k++) minGap = Math.min(minGap, dist(enemy, world.point(k)));
    }
    expect(minGap).toBeGreaterThan(ENEMY_SPECS.jelly.radius + SEGMENT_RADIUS - 0.05);
    expect(world.segments).toBe(8);
  });

  it('적이 머리에 닿으면 꼬리 끝 마디를 잃고, 적은 튕겨 나가며 체력 절반을 잃는다', () => {
    const world = empty();
    world.load(row(20, 20, 19, 18, 17), 'right', ['arrow', 'cannon', 'ice'], []);
    const enemy = world.spawnEnemy('rock', 20.6, 20);
    const events = world.update(ENEMY_STEP);
    const bump = events.find((e) => e.kind === 'bump');
    expect(bump?.kind).toBe('bump');
    if (bump?.kind !== 'bump') return;
    expect(bump.hurt.lost).toEqual({ x: 17, y: 20 });
    expect(bump.hurt.lostTower).toBe('ice');
    expect(bump.killed).toBe(false);
    expect(world.segments).toBe(2);
    expect(world.invulnerable).toBe(INVULNERABLE_SECONDS);
    expect(enemy.hp).toBe(ENEMY_SPECS.rock.hp / 2);
    expect(enemy.kx).toBeGreaterThan(0);
    expect(dist(enemy, world.point(0))).toBeGreaterThanOrEqual(ENEMY_SPECS.rock.radius + HEAD_RADIUS - 1e-6);
  });

  it('무적이면 적이 닿아도 튕기기만 하고 피해를 주고받지 않는다', () => {
    const world = empty();
    world.load(row(20, 20, 19, 18), 'right', undefined, []);
    world.invulnerable = 0.5;
    const enemy = world.spawnEnemy('jelly', 20.5, 20);
    const events = world.update(ENEMY_STEP);
    expect(events.some((e) => e.kind === 'bump')).toBe(false);
    expect(world.segments).toBe(2);
    expect(enemy.hp).toBe(ENEMY_SPECS.jelly.hp);
    expect(enemy.kx).toBeGreaterThan(0);
  });

  it('젤리는 머리에 두 번 부딪히면 처치된다', () => {
    const world = empty();
    world.load(row(20, 20, 19, 18, 17), 'right', undefined, []);
    const enemy = world.spawnEnemy('jelly', 20.5, 20);
    world.update(ENEMY_STEP);
    world.invulnerable = 0;
    enemy.x = 20.5;
    enemy.y = world.point(0).y;
    enemy.x = world.point(0).x + 0.1;
    const events = world.update(ENEMY_STEP);
    const bump = events.find((e) => e.kind === 'bump');
    expect(bump?.kind === 'bump' && bump.killed).toBe(true);
    expect(world.enemies).not.toContain(enemy);
    expect(world.killed).toBe(1);
  });

  it('머리만 남은 채로 적이 닿으면 끝난다', () => {
    const world = empty();
    world.load([{ x: 20, y: 20 }], 'right', [], []);
    world.spawnEnemy('jelly', 20.3, 20);
    const events = world.update(ENEMY_STEP);
    const last = events.at(-1);
    expect(last && 'hurt' in last ? last.hurt?.over : undefined).toBe(true);
    expect(world.alive).toBe(false);
    expect(world.update(1)).toEqual([]);
  });

  it('큰 녀석은 처치되면 젤리 넷으로 갈라진다', () => {
    const world = empty();
    const boss = world.spawnEnemy('boss', 30, 30);
    expect(world.damageEnemy(boss, 100)).toBe(false);
    expect(world.damageEnemy(boss, ENEMY_SPECS.boss.hp)).toBe(true);
    expect(world.enemies.map((e) => e.type)).toEqual(['jelly', 'jelly', 'jelly', 'jelly']);
    expect(world.killed).toBe(1);
  });

  it('적은 판 밖으로 나가지 않는다', () => {
    const world = empty();
    world.load(row(0, 2, 1, 0), 'right', undefined, []);
    const enemy = world.spawnEnemy('dart', 1, 0);
    enemy.ky = -20;
    world.invulnerable = 10;
    world.update(ENEMY_STEP * 3);
    expect(enemy.y).toBeGreaterThanOrEqual(ENEMY_SPECS.dart.radius - 0.5 - 1e-9);
  });

  it('처음부터 다시 하면 적과 처치 수가 비워진다', () => {
    const world = new TowerSnakeWorld(seededRandom(2));
    world.update(WAVE_SECONDS + 0.1);
    world.killed = 3;
    expect(world.enemies.length).toBeGreaterThan(0);
    world.reset();
    expect(world.enemies).toEqual([]);
    expect(world.killed).toBe(0);
    world.update(WAVE_SECONDS - 0.1);
    expect(world.enemies).toEqual([]);
  });
});

describe('자동 공격 (단계 4)', () => {
  /** 타워 자리를 손으로 정한 판. 처치하면 적 목록에서 뺀다. */
  const arena = (towers: TowerType[], points: Point[], enemies: Enemy[], head: Point = { x: 0, y: 0 }) => {
    const grid = new SpatialGrid<Enemy>(BOARD);
    const list = [...enemies];
    let kills = 0;
    const world: CombatWorld & { list: Enemy[]; kills: () => number; refresh: () => void } = {
      towers,
      towerPoint: (i) => points[i],
      head,
      grid,
      damage(enemy, amount) {
        enemy.hp -= amount;
        if (enemy.hp > 0) return false;
        list.splice(list.indexOf(enemy), 1);
        kills++;
        return true;
      },
      list,
      kills: () => kills,
      refresh() {
        grid.clear();
        for (const e of list) grid.insert(e, e.x, e.y);
      },
    };
    world.refresh();
    return world;
  };
  /** `seconds`초 동안 싸운다 (적은 움직이지 않는다). */
  const fight = (combat: Combat, world: ReturnType<typeof arena>, seconds: number) => {
    const out: CombatEvent[] = [];
    for (let t = 0; t < seconds - 1e-9; t += ENEMY_STEP) {
      world.refresh();
      combat.step(ENEMY_STEP, world, out);
    }
    return out;
  };
  let id = 1;
  const enemy = (type: Parameters<typeof createEnemy>[1], x: number, y: number) => createEnemy(id++, type, x, y);

  it('사거리 안에서 머리에 가장 가까운 적을 고른다', () => {
    const near = enemy('jelly', 13, 10);
    const closeToHead = enemy('jelly', 10, 13);
    const far = enemy('jelly', 20, 10);
    const world = arena([], [], [near, closeToHead, far], { x: 10, y: 15 });
    expect(findTarget(world.grid, { x: 10, y: 10 }, 4, world.head)).toBe(closeToHead);
    expect(findTarget(world.grid, { x: 30, y: 30 }, 4, world.head)).toBeNull();
  });

  it('화살은 쿨다운마다 한 발씩 쏘고, 젤리를 두 발에 처치한다', () => {
    const target = enemy('jelly', 13, 10);
    const world = arena(['arrow'], [{ x: 10, y: 10 }], [target]);
    const combat = new Combat();
    combat.step(ENEMY_STEP, world, []);
    expect(combat.projectiles).toHaveLength(1);
    combat.step(ENEMY_STEP, world, []);
    expect(combat.projectiles).toHaveLength(1);
    fight(combat, world, TOWER_SPECS.arrow.cooldown + 0.4);
    expect(target.hp).toBeLessThanOrEqual(0);
    expect(world.kills()).toBe(1);
    expect(world.list).toHaveLength(0);
  });

  it('사거리 밖의 적은 쏘지 않는다', () => {
    const world = arena(['arrow'], [{ x: 10, y: 10 }], [enemy('jelly', 10 + TOWER_SPECS.arrow.range + 0.3, 10)]);
    const combat = new Combat();
    fight(combat, world, 1);
    expect(combat.projectiles).toHaveLength(0);
    expect(world.list[0].hp).toBe(ENEMY_SPECS.jelly.hp);
  });

  it('대포알은 떨어진 자리 둘레의 적을 모두 맞힌다', () => {
    const target = enemy('rock', 13, 10);
    const beside = enemy('rock', 13, 10 + BLAST_RADIUS);
    const away = enemy('rock', 13, 10 + BLAST_RADIUS + ENEMY_SPECS.rock.radius + 0.5);
    const world = arena(['cannon'], [{ x: 10, y: 10 }], [target, beside, away]);
    const combat = new Combat();
    const out = fight(combat, world, 0.6);
    expect(out.filter((e) => e.kind === 'blast')).toHaveLength(1);
    expect(target.hp).toBe(ENEMY_SPECS.rock.hp - TOWER_SPECS.cannon.damage);
    expect(beside.hp).toBe(ENEMY_SPECS.rock.hp - TOWER_SPECS.cannon.damage);
    expect(away.hp).toBe(ENEMY_SPECS.rock.hp);
  });

  it('얼음에 맞은 적은 2초 동안 느려진다', () => {
    const target = enemy('rock', 12, 10);
    const world = arena(['ice'], [{ x: 10, y: 10 }], [target]);
    const combat = new Combat();
    fight(combat, world, 0.3);
    expect(target.hp).toBe(ENEMY_SPECS.rock.hp - TOWER_SPECS.ice.damage);
    expect(target.slow).toBeGreaterThan(SLOW_SECONDS - 0.3);
  });

  it('느려진 적은 절반 빠르기로 움직인다', () => {
    const world = new TowerSnakeWorld(seededRandom(1));
    world.boxes = [];
    world.load([{ x: 5, y: 5 }], 'right', [], []);
    const fast = world.spawnEnemy('rock', 30, 20);
    const slow = world.spawnEnemy('rock', 30, 30);
    slow.slow = SLOW_SECONDS;
    const fx = fast.x;
    const sx = slow.x;
    world.update(0.5);
    const fastMoved = Math.hypot(fast.x - fx, fast.y - 20);
    const slowMoved = Math.hypot(slow.x - sx, slow.y - 30);
    expect(slowMoved / fastMoved).toBeCloseTo(0.5, 1);
  });

  it('번개는 가까운 적으로 세 번 튀며 약해지고, 멀리는 튀지 않는다', () => {
    const chain = [enemy('rock', 12, 10), enemy('rock', 14, 10), enemy('rock', 16, 10), enemy('rock', 18, 10)];
    const extra = enemy('rock', 20, 10);
    const lonely = enemy('rock', 12, 10 + CHAIN_RANGE + 5);
    const world = arena(['lightning'], [{ x: 10, y: 10 }], [...chain, extra, lonely]);
    const combat = new Combat();
    const out: CombatEvent[] = [];
    combat.step(ENEMY_STEP, world, out);
    const bolt = out.find((e) => e.kind === 'bolt');
    expect(bolt?.kind === 'bolt' && bolt.points).toHaveLength(CHAIN_JUMPS + 2);
    let amount = TOWER_SPECS.lightning.damage;
    for (const e of chain) {
      expect(e.hp).toBeCloseTo(ENEMY_SPECS.rock.hp - amount);
      amount *= CHAIN_FALLOFF;
    }
    expect(extra.hp).toBe(ENEMY_SPECS.rock.hp);
    expect(lonely.hp).toBe(ENEMY_SPECS.rock.hp);
    expect(combat.projectiles).toHaveLength(0);
  });

  it('표적이 먼저 처치되면 화살은 헛맞고, 대포알은 마지막 자리에서 터진다', () => {
    const a = enemy('jelly', 13, 10);
    const c = enemy('jelly', 13, 12);
    const world = arena(['arrow', 'cannon'], [{ x: 10, y: 10 }, { x: 10, y: 12 }], [a, c]);
    const combat = new Combat();
    combat.step(ENEMY_STEP, world, []);
    expect(combat.projectiles).toHaveLength(2);
    world.damage(a, 100);
    world.damage(c, 100);
    const out = fight(combat, world, 0.5);
    expect(combat.projectiles).toHaveLength(0);
    expect(out.filter((e) => e.kind === 'blast')).toHaveLength(1);
  });

  it('투사체는 200개를 넘지 않는다', () => {
    const towers = Array.from({ length: 40 }, () => 'arrow' as TowerType);
    const points = towers.map((_, i) => ({ x: 1, y: i }));
    const targets = Array.from({ length: 40 }, (_, i) => enemy('boss', 4.5, i));
    const world = arena(towers, points, targets);
    const combat = new Combat();
    // 화살을 아주 느리게 해 쌓이게 한다: 표적을 멀리 두고 몇 번 쏜다.
    for (let k = 0; k < 8; k++) {
      for (const p of combat.projectiles) {
        p.x = 1;
        p.tx = 40;
        p.target = null;
      }
      combat.step(TOWER_SPECS.arrow.cooldown + 0.01, world, []);
    }
    expect(combat.projectiles.length).toBeLessThanOrEqual(MAX_PROJECTILES);
  });

  it('마디를 잃어 타워가 줄어도 남은 타워는 그대로 쏜다', () => {
    const towers: TowerType[] = ['arrow', 'arrow', 'arrow'];
    const target = enemy('rock', 12, 10);
    const world = arena(towers, [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }], [target]);
    const combat = new Combat();
    combat.step(ENEMY_STEP, world, []);
    expect(combat.projectiles).toHaveLength(3);
    towers.length = 1;
    fight(combat, world, TOWER_SPECS.arrow.cooldown + 0.05);
    expect(combat.projectiles.length).toBeLessThanOrEqual(2);
  });

  it('판에서 타워가 다가온 적을 쏘아 처치 수가 오른다', () => {
    const world = new TowerSnakeWorld(seededRandom(6));
    world.boxes = [];
    world.load(row(20, 20, 19, 18, 17, 16, 15, 14), 'right', ['arrow', 'arrow', 'cannon', 'lightning', 'ice', 'arrow'], []);
    world.spawnEnemy('jelly', 24, 16);
    world.spawnEnemy('jelly', 24, 24);
    world.spawnEnemy('dart', 16, 24);
    const events = world.update(1.5);
    expect(world.killed).toBe(3);
    expect(world.enemies).toHaveLength(0);
    expect(world.segments).toBe(6);
    expect(events.some((e) => e.kind === 'bolt')).toBe(true);
  });

  it('처음부터 다시 하면 투사체가 비워진다', () => {
    const world = new TowerSnakeWorld(seededRandom(6));
    world.load(row(20, 20, 19, 18), 'right', ['arrow', 'arrow'], []);
    world.spawnEnemy('rock', 23, 20);
    world.update(ENEMY_STEP);
    expect(world.projectiles.length).toBeGreaterThan(0);
    world.reset();
    expect(world.projectiles).toHaveLength(0);
  });
});

describe('연출 이벤트 (단계 5)', () => {
  it('피해를 받고 살아남은 적은 잠깐 번쩍이고, 걸음마다 줄어든다', () => {
    const world = new TowerSnakeWorld(seededRandom(2));
    world.boxes = [];
    world.load([{ x: 5, y: 5 }], 'right', [], []);
    const rock = world.spawnEnemy('rock', 30, 30);
    expect(rock.flash).toBe(0);
    expect(world.damageEnemy(rock, 10)).toBe(false);
    expect(rock.flash).toBe(FLASH_SECONDS);
    world.update(FLASH_SECONDS / 2);
    expect(rock.flash).toBeGreaterThan(0);
    expect(rock.flash).toBeLessThan(FLASH_SECONDS);
    world.update(FLASH_SECONDS);
    expect(rock.flash).toBe(0);
  });

  it('타워가 처치하면 그 적의 종류와 자리로 kill 이벤트를 낸다', () => {
    const world = new TowerSnakeWorld(seededRandom(6));
    world.boxes = [];
    world.load(row(20, 20, 19, 18), 'right', ['lightning', 'lightning'], []);
    world.spawnEnemy('dart', 19, 22);
    const events = world.update(1);
    const kills = events.filter((e): e is KillEvent => e.kind === 'kill');
    expect(world.killed).toBe(1);
    expect(kills).toHaveLength(1);
    expect(kills[0].type).toBe('dart');
    expect(Math.hypot(kills[0].x - 19, kills[0].y - 22)).toBeLessThan(3);
  });

  it('큰 녀석이 처치되면 kill 하나를 내고 젤리 넷으로 갈라진다', () => {
    const world = new TowerSnakeWorld(seededRandom(2));
    world.boxes = [];
    world.load([{ x: 5, y: 5 }], 'right', [], []);
    const boss = world.spawnEnemy('boss', 30, 30);
    boss.hp = 1;
    // update 밖에서 준 피해는 이벤트를 내지 않는다 (받을 곳이 없다).
    expect(world.damageEnemy(boss, 5)).toBe(true);
    expect(world.enemies.filter((e) => e.type === 'jelly')).toHaveLength(4);
  });

  it('머리에 부딪혀 처치된 적도 kill 이벤트를 낸다', () => {
    const world = new TowerSnakeWorld(seededRandom(3));
    world.boxes = [];
    world.load(row(20, 20, 19, 18), 'right', ['arrow', 'arrow'], []);
    const dart = world.spawnEnemy('dart', 20.6, 20);
    dart.hp = 1;
    const events = world.update(ENEMY_STEP);
    const order = events.map((e) => e.kind);
    expect(order).toContain('kill');
    expect(order).toContain('bump');
    expect(order.indexOf('kill')).toBeLessThan(order.indexOf('bump'));
  });
});

describe('타워 뱀 기록 (단계 6)', () => {
  const play = (over: Partial<TowerSnakePlay> = {}): TowerSnakePlay => ({
    seconds: 95.5,
    kills: 40,
    longest: 9,
    eaten: { arrow: 3, cannon: 2, ice: 1, lightning: 1 },
    end: 'down',
    towers: ['arrow', 'cannon', 'ice'],
    ...over,
  });
  const times = { startedAt: 0, endedAt: 1 };

  it('판을 쌓으면 누적 수치가 는다', () => {
    let stats = TOWER_SNAKE_RECORDS.accumulate(emptyTowerSnakeStats(), play(), times);
    stats = TOWER_SNAKE_RECORDS.accumulate(
      stats,
      play({ seconds: 30.2, kills: 55, longest: 4, eaten: { arrow: 1, cannon: 0, ice: 0, lightning: 2 }, end: 'restart' }),
      times,
    );
    expect(stats).toEqual({
      plays: 2,
      bestSeconds: 95.5,
      bestKills: 55,
      longest: 9,
      totalKills: 95,
      totalSeconds: 125.7,
      eaten: { arrow: 4, cannon: 2, ice: 1, lightning: 3 },
    });
  });

  it('저장된 값을 검사한다', () => {
    const migrate = TOWER_SNAKE_RECORDS.migrate!;
    expect(migrate('play', 1, play())).toEqual(play());
    expect(migrate('play', 1, { ...play(), end: 'bored' })).toBeUndefined();
    expect(migrate('play', 1, { ...play(), kills: -1 })).toBeUndefined();
    expect(migrate('play', 1, { ...play(), towers: ['arrow', 'laser'] })).toBeUndefined();
    expect(migrate('play', 1, { ...play(), eaten: { arrow: 'x' } })).toBeUndefined();
    expect(migrate('play', 2, play())).toBeUndefined();
    expect(migrate('stats', 1, { plays: 3 })).toEqual({ ...emptyTowerSnakeStats(), plays: 3 });
    expect(migrate('stats', 1, { plays: 3, eaten: { ice: 2 } })).toEqual({
      ...emptyTowerSnakeStats(),
      plays: 3,
      eaten: { arrow: 0, cannon: 0, ice: 2, lightning: 0 },
    });
    expect(migrate('stats', 1, { plays: 'x' })).toBeUndefined();
    expect(migrate('progress', 1, {})).toBeUndefined();
  });

  it('판 상태에서 기록할 값을 모두 얻는다: 버틴 시간, 처치, 가장 긴 길이, 먹은 종류', () => {
    const world = new TowerSnakeWorld(seededRandom(4));
    world.load(row(20, 20, 19, 18), 'right', ['arrow', 'arrow'], [{ cell: { x: 21, y: 20 }, type: 'ice' }]);
    world.update(STEP_SECONDS * 1.5);
    expect(world.eaten.ice).toBe(1);
    expect(world.longest).toBe(3);
    expect(world.time).toBeCloseTo(STEP_SECONDS * 1.5);
    expect(TOWER_SNAKE_RECORDS.migrate!('play', 1, play({ seconds: world.time, longest: world.longest, eaten: { ...world.eaten }, towers: [...world.towers] }))).toBeDefined();
  });
});

describe('성능 (단계 7)', () => {
  it('적 250마리와 타워 40마디로 600걸음(10초)을 넉넉한 한도 안에 돈다', () => {
    const world = new TowerSnakeWorld(seededRandom(9));
    world.boxes = [];
    // 판 가운데에서 U자로 감은 41칸짜리 몸: 윗줄 20칸, 꺾는 칸, 아랫줄 20칸
    const body: Cell[] = [];
    for (let i = 0; i < 20; i++) body.push({ x: 30 - i, y: 14 });
    body.push({ x: 11, y: 15 });
    for (let i = 0; i < 20; i++) body.push({ x: 11 + i, y: 16 });
    const kinds = TOWER_TYPES;
    world.load(body, 'up', Array.from({ length: MAX_SEGMENTS }, (_, i) => kinds[i % kinds.length]), []);
    world.invulnerable = 1e9;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      const enemy = world.spawnEnemy(['jelly', 'dart', 'rock'][i % 3] as 'jelly', 5 + (i % 30), 20 + Math.floor(i / 30) * 1.5);
      enemy.hp = 1e9;
    }
    const started = performance.now();
    for (let i = 0; i < 600; i++) world.update(ENEMY_STEP);
    const elapsed = performance.now() - started;
    expect(world.enemies.length).toBe(MAX_ENEMIES);
    // 데스크톱에서 약 0.3ms/걸음 (180ms). 느린 기기와 테스트 동시 실행을 생각해 넉넉히 잡는다.
    expect(elapsed).toBeLessThan(3000);
  });
});
