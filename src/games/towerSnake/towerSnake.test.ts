import { describe, expect, it } from 'vitest';
import { seededRandom } from './random';
import { pickTower, TOWER_SPECS, TOWER_TYPES, type TowerType } from './towers';
import {
  BOARD,
  BOX_COUNT,
  BOX_MIN_DISTANCE,
  INVULNERABLE_SECONDS,
  MAX_SEGMENTS,
  SPEED,
  START_SEGMENTS,
  TowerSnakeWorld,
  type Cell,
} from './world';

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
    expect(world.towers).toEqual(['arrow', 'arrow']);
  });

  it('상자를 먹으면 꼬리 끝에 그 타워 마디가 붙고, 새 상자가 생겨 늘 3개다', () => {
    const world = new TowerSnakeWorld(seededRandom(5));
    const far = [{ cell: { x: 0, y: 0 }, type: 'arrow' as TowerType }, { cell: { x: 0, y: 1 }, type: 'arrow' as TowerType }];
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
