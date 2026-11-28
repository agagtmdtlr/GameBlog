import { OPPOSITE, STEP, type Direction } from '../../lib/gridSnake';
import { ENEMY_SPECS } from './enemies';
import { seededRandom, type Random } from './random';
import { BOARD, SPEED, TowerSnakeWorld, type Cell, type DamageCause } from './world';

/**
 * 수치를 맞추려고 판을 저절로 노는 봇 (단계 7). 놀이에는 쓰지 않는다.
 * 칸마다 갈 수 있는 세 방향을 점수로 견줘 고른다: 울타리·제 몸은 피하고, 가까운 적은 멀리하고, 가까운 상자 쪽으로 간다.
 */
export interface BotSkill {
  /** 방향을 다시 정하기까지 걸리는 시간 (초, 클수록 늦게 반응한다). 뱀이 빨라져도 사람의 반응은 그대로라 초로 둔다. */
  readonly reaction: number;
  /** 정할 때마다 가장 좋은 쪽 대신 아무 안전한 쪽을 고를 확률 */
  readonly slip: number;
  /** 적을 피하려고 보는 거리 (칸) */
  readonly sight: number;
}

/** 처음 하는 사람: 조금 늦게 반응하고 가끔 엉뚱한 쪽으로 꺾는다. 적은 가까이 와야 본다. */
export const NEWCOMER: BotSkill = { reaction: 0.4, slip: 0.12, sight: 3 };
/** 익숙한 사람: 칸마다 정하고 실수가 없다. */
export const EXPERT: BotSkill = { reaction: 0.2, slip: 0, sight: 5 };

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** 한 판의 결과 */
export interface BotResult {
  /** 버틴 시간 (초) */
  readonly seconds: number;
  readonly kills: number;
  readonly longest: number;
  readonly alive: boolean;
  /** 마디를 잃은 까닭마다의 수 */
  readonly losses: Readonly<Record<DamageCause, number>>;
}

/** 다음 칸 하나의 점수 (클수록 좋다) */
function score(world: TowerSnakeWorld, from: Cell, direction: Direction, skill: BotSkill): number {
  const next = { x: from.x + STEP[direction].x, y: from.y + STEP[direction].y };
  if (next.x < 0 || next.y < 0 || next.x >= BOARD || next.y >= BOARD) return -1000;
  let value = 0;
  // 제 몸: 꼬리 끝은 빠져나가므로 뺀다.
  const body = world.body;
  for (let i = 1; i < body.length - 1; i++) if (body[i].x === next.x && body[i].y === next.y) value -= 400;
  // 적: 가까울수록, 큰 적일수록 멀리한다. 두 칸 앞까지 본다.
  const ahead = { x: next.x + STEP[direction].x, y: next.y + STEP[direction].y };
  for (const e of world.enemies) {
    const near = Math.hypot(e.x - next.x, e.y - next.y) - ENEMY_SPECS[e.type].radius;
    if (near < skill.sight) value -= (skill.sight - near) ** 2 * 6;
    const far = Math.hypot(e.x - ahead.x, e.y - ahead.y) - ENEMY_SPECS[e.type].radius;
    if (far < skill.sight) value -= (skill.sight - far) ** 2 * 2;
  }
  // 울타리 가까이는 조금 꺼린다.
  const edge = Math.min(next.x, next.y, BOARD - 1 - next.x, BOARD - 1 - next.y);
  if (edge < 2) value -= (2 - edge) * 8;
  // 가까운 상자 쪽으로 간다.
  let box = Infinity;
  for (const b of world.boxes) box = Math.min(box, Math.abs(b.cell.x - next.x) + Math.abs(b.cell.y - next.y));
  if (box < Infinity) value -= box * 3;
  return value;
}

/** 봇이 방향을 하나 정한다. */
export function choose(world: TowerSnakeWorld, skill: BotSkill, random: Random): Direction {
  const current = world.snake.nextDirection;
  const options = DIRECTIONS.filter((d) => d !== OPPOSITE[current]).map((d) => ({ d, v: score(world, world.head, d, skill) }));
  options.sort((a, b) => b.v - a.v);
  if (random() < skill.slip) {
    const safe = options.filter((o) => o.v > -300);
    if (safe.length > 0) return safe[Math.floor(random() * safe.length)].d;
  }
  return options[0].d;
}

/** 씨앗 하나로 한 판을 끝까지(또는 `limit`초까지) 논다. */
export function playGame(seed: number, skill: BotSkill, limit = 600): BotResult {
  const world = new TowerSnakeWorld(seededRandom(seed));
  const random = seededRandom(seed * 7919 + 13);
  let ticks = 0;
  const losses: Record<DamageCause, number> = { enemy: 0, wall: 0, self: 0 };
  while (world.alive && world.time < limit) {
    if (ticks % Math.max(1, Math.round(skill.reaction * SPEED)) === 0) {
      const direction = choose(world, skill, random);
      if (direction !== world.snake.nextDirection) world.turn(direction);
    }
    for (const event of world.update(1 / SPEED)) {
      if (event.kind === 'bump') losses.enemy++;
      else if (event.kind === 'tick' && event.hurt?.applied && event.hit) losses[event.hit]++;
    }
    ticks++;
  }
  return { seconds: world.time, kills: world.killed, longest: world.longest, alive: world.alive, losses };
}
