import { describe, expect, it } from 'vitest';
import { BOARD, INVULNERABLE_SECONDS, SPEED, START_SEGMENTS, TowerSnakeWorld, type Cell } from './world';

const row = (y: number, ...xs: number[]): Cell[] => xs.map((x) => ({ x, y }));
const STEP_SECONDS = 1 / SPEED;

describe('타워 뱀 판 (단계 1)', () => {
  it('큰 판 가운데에서 머리와 타워 마디 둘로 오른쪽을 보고 시작한다', () => {
    const world = new TowerSnakeWorld();
    const mid = Math.floor(BOARD / 2);
    expect(BOARD).toBeGreaterThan(15);
    expect(world.head).toEqual({ x: mid, y: mid });
    expect(world.segments).toBe(START_SEGMENTS);
    expect(world.snake.direction).toBe('right');
    expect(world.alive).toBe(true);
  });

  it('SPEED마다 한 칸 나아가고, 남은 시간은 alpha가 된다', () => {
    const world = new TowerSnakeWorld();
    const start = world.head.x;
    expect(world.update(STEP_SECONDS * 0.5)).toHaveLength(0);
    expect(world.alpha).toBeCloseTo(0.5);
    expect(world.update(STEP_SECONDS * 2)).toHaveLength(2);
    expect(world.head.x).toBe(start + 2);
    expect(world.ticks).toBe(2);
    expect(world.time).toBeCloseTo(STEP_SECONDS * 2.5);
  });

  it('울타리에 닿으면 꼬리 마디를 잃고 오른쪽으로 꺾어 판 안에 남는다', () => {
    const world = new TowerSnakeWorld();
    world.load(row(5, BOARD - 1, BOARD - 2, BOARD - 3, BOARD - 4), 'right');
    const event = world.tick();
    expect(event.hit).toBe('wall');
    expect(event.turned).toBe(true);
    expect(event.hurt).toEqual({ applied: true, lost: { x: BOARD - 4, y: 5 }, over: false });
    expect(world.snake.direction).toBe('down');
    expect(world.head).toEqual({ x: BOARD - 1, y: 6 });
    expect(world.segments).toBe(2);
    expect(world.invulnerable).toBe(INVULNERABLE_SECONDS);
  });

  it('모서리라 오른쪽도 울타리면 왼쪽으로 꺾는다', () => {
    const world = new TowerSnakeWorld();
    world.load(row(BOARD - 1, BOARD - 1, BOARD - 2, BOARD - 3), 'right');
    world.tick();
    expect(world.snake.direction).toBe('up');
    expect(world.head).toEqual({ x: BOARD - 1, y: BOARD - 2 });
  });

  it('받아 둔 방향이 울타리 쪽이면 버리고 그대로 나아간다', () => {
    const world = new TowerSnakeWorld();
    world.load(row(0, 10, 9, 8), 'right');
    world.turn('up');
    const event = world.tick();
    expect(event.hit).toBeNull();
    expect(world.head).toEqual({ x: 11, y: 0 });
    expect(world.segments).toBe(2);
  });

  it('제 몸에 들어가면 지나가며 꼬리 마디 하나를 잃는다', () => {
    const world = new TowerSnakeWorld();
    // 머리 (5,5)에서 왼쪽은 (4,5). 몸이 (4,5)를 지나간다.
    world.load([{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 4, y: 4 }, { x: 4, y: 3 }], 'up');
    world.turn('left');
    const event = world.tick();
    expect(event.hit).toBe('self');
    expect(event.hurt?.lost).toEqual({ x: 4, y: 3 });
    expect(world.head).toEqual({ x: 4, y: 5 });
    expect(world.segments).toBe(4);
  });

  it('빠져나가는 꼬리 칸으로 들어가는 것은 부딪힘이 아니다', () => {
    const world = new TowerSnakeWorld();
    world.load([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }], 'left');
    world.turn('down');
    expect(world.tick().hit).toBeNull();
  });

  it('무적 동안에는 마디를 잃지 않지만 울타리에서는 꺾는다', () => {
    const world = new TowerSnakeWorld();
    world.load(row(5, BOARD - 2, BOARD - 3, BOARD - 4, BOARD - 5), 'right');
    world.invulnerable = 0.5;
    world.tick();
    const event = world.tick();
    expect(event.hit).toBe('wall');
    expect(event.hurt?.applied).toBe(false);
    expect(world.segments).toBe(3);
    expect(world.snake.direction).toBe('down');
  });

  it('무적 시간은 흐르는 시간만큼 줄어든다', () => {
    const world = new TowerSnakeWorld();
    world.hurt('wall');
    world.update(0.4);
    expect(world.invulnerable).toBeCloseTo(INVULNERABLE_SECONDS - 0.4);
    world.update(1);
    expect(world.invulnerable).toBe(0);
  });

  it('머리만 남은 채로 피해를 받으면 끝나고 더 나아가지 않는다', () => {
    const world = new TowerSnakeWorld();
    world.load([{ x: BOARD - 1, y: 5 }], 'right');
    const event = world.tick();
    expect(event.hurt?.over).toBe(true);
    expect(world.alive).toBe(false);
    expect(world.head).toEqual({ x: BOARD - 1, y: 5 });
    expect(world.update(1)).toEqual([]);
    expect(world.turn('up')).toBe(false);
  });

  it('처음부터 다시 하면 처음 상태로 돌아간다', () => {
    const world = new TowerSnakeWorld();
    world.update(2);
    world.hurt('enemy');
    world.reset();
    expect(world.segments).toBe(START_SEGMENTS);
    expect(world.time).toBe(0);
    expect(world.invulnerable).toBe(0);
    expect(world.alive).toBe(true);
  });
});
