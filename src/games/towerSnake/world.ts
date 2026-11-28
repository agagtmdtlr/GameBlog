import { GridSnake, LEFT_OF, RIGHT_OF, sameCell, type Cell, type Direction } from '../../lib/gridSnake';
import type { Random } from './random';
import { pickTower, START_TOWER, type TowerType } from './towers';

export type { Cell, Direction } from '../../lib/gridSnake';

/** 판 한 변의 칸 수 (D1: 큰 판) */
export const BOARD = 41;
/** 처음 타워 마디 수 (머리 빼고) */
export const START_SEGMENTS = 2;
/** 타워 마디 수 한계 (머리 빼고, D4) */
export const MAX_SEGMENTS = 40;
/** 뱀이 나아가는 빠르기 (초당 칸, 일정) */
export const SPEED = 5;
/** 피해를 받은 뒤 무적 시간 (초) */
export const INVULNERABLE_SECONDS = 1;
/** 판에 늘 있는 타워 상자 수 */
export const BOX_COUNT = 3;
/** 새 상자는 머리에서 이 칸 수보다 멀리 생긴다 (가로·세로 중 먼 쪽) */
export const BOX_MIN_DISTANCE = 6;

/** 피해의 원인. `enemy`는 단계 3에서 쓴다. */
export type DamageCause = 'wall' | 'self' | 'enemy';

/** 판 위의 타워 상자. 먹으면 그 타워 마디가 꼬리에 붙는다. */
export interface TowerBox {
  readonly cell: Cell;
  readonly type: TowerType;
}

/** 피해를 주려 한 결과 */
export interface Hurt {
  /** 실제로 피해를 받았는지 (무적이면 `false`) */
  readonly applied: boolean;
  /** 잃은 꼬리 마디 자리 */
  readonly lost: Cell | null;
  /** 잃은 꼬리 마디의 타워 */
  readonly lostTower: TowerType | null;
  /** 머리만 남은 채로 피해를 받아 끝났는지 */
  readonly over: boolean;
}

/** 상자를 먹은 결과 */
export interface Eat {
  readonly box: TowerBox;
  /** 마디가 한계라서 꼬리 끝 타워를 바꿨는지 (늘지 않음) */
  readonly replaced: boolean;
  /** 먹어서 새로 생긴 상자 */
  readonly spawned: TowerBox | null;
}

/** 한 칸 나아간 결과 */
export interface TickEvent {
  /** 나아가기 전 몸 (그리기가 칸 사이를 잇는 데 쓴다) */
  readonly before: readonly Cell[];
  /** 무엇에 부딪혔는지. 부딪히지 않았으면 `null` (무적이라 피해가 없어도 적는다) */
  readonly hit: DamageCause | null;
  readonly hurt: Hurt | null;
  /** 울타리에 닿아 저절로 꺾었는지 */
  readonly turned: boolean;
  readonly eat: Eat | null;
}

/** 가로·세로 중 먼 쪽의 칸 거리 */
const reach = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * 타워 뱀 한 판의 상태 (단계 2: 판, 움직임, 울타리·제 몸 피해, 타워 상자).
 * 몸 움직임은 공용 `GridSnake`가 맡고, 여기서는 울타리에서 꺾기, 제 몸 지나가기, 마디 잃기, 무적, 끝, 상자 먹기를 정한다.
 * `update(dt)`로 시간을 받아 `SPEED`마다 한 칸 나아간다.
 */
export class TowerSnakeWorld {
  readonly snake = new GridSnake({ width: BOARD, height: BOARD });
  /** 마디마다의 타워. `towers[i]`는 머리에서 `i + 1`번째 마디(`body[i + 1]`)의 타워다. */
  towers: TowerType[] = [];
  boxes: TowerBox[] = [];
  /** 논 시간 (초) */
  time = 0;
  /** 나아간 칸 수 */
  ticks = 0;
  /** 남은 무적 시간 (초) */
  invulnerable = 0;
  alive = true;
  /** 이번 판에서 가장 길었던 타워 마디 수 */
  longest = START_SEGMENTS;
  /** 이번 판에서 먹은 타워 상자 수 (종류별) */
  eaten: Record<TowerType, number> = { arrow: 0, cannon: 0, ice: 0, lightning: 0 };
  /** 이번 칸에서 흐른 시간 (초) */
  private pending = 0;

  constructor(private readonly random: Random = Math.random) {
    this.reset();
  }

  reset(): void {
    const mid = Math.floor(BOARD / 2);
    this.snake.place(
      Array.from({ length: START_SEGMENTS + 1 }, (_, i) => ({ x: mid - i, y: mid })),
      'right',
    );
    this.towers = Array.from({ length: START_SEGMENTS }, () => START_TOWER);
    this.time = 0;
    this.ticks = 0;
    this.invulnerable = 0;
    this.alive = true;
    this.longest = START_SEGMENTS;
    this.eaten = { arrow: 0, cannon: 0, ice: 0, lightning: 0 };
    this.pending = 0;
    this.boxes = [];
    while (this.boxes.length < BOX_COUNT) {
      const box = this.spawnBox();
      if (!box) break;
      this.boxes.push(box);
    }
  }

  /** 머리부터 꼬리까지 */
  get body(): Cell[] {
    return this.snake.body;
  }

  get head(): Cell {
    return this.snake.head;
  }

  /** 타워 마디 수 (머리 빼고) */
  get segments(): number {
    return this.snake.body.length - 1;
  }

  /** 이번 칸으로 나아간 정도 (0~1) */
  get alpha(): number {
    return Math.min(1, this.pending * SPEED);
  }

  /** 방향을 받아 둔다. 받아들였으면 `true`. */
  turn(direction: Direction): boolean {
    if (!this.alive) return false;
    return this.snake.turn(direction);
  }

  /** 시간을 `dt`초 흘린다. 그동안 나아간 칸마다의 결과를 돌려준다. */
  update(dt: number): TickEvent[] {
    if (!this.alive) return [];
    this.time += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.pending += dt;
    const events: TickEvent[] = [];
    while (this.alive && this.pending >= 1 / SPEED) {
      this.pending -= 1 / SPEED;
      events.push(this.tick());
    }
    return events;
  }

  /** 한 칸 나아간다. */
  tick(): TickEvent {
    const before = this.snake.body.map((c) => ({ ...c }));
    const snake = this.snake;
    // 받아 둔 방향이 울타리 쪽이면 버린다 (D3).
    if (snake.queued.length > 0 && !snake.inside(snake.ahead(snake.nextDirection))) snake.clearQueue();
    let direction = snake.takeDirection();
    let next = snake.ahead(direction);
    let hit: DamageCause | null = null;
    let turned = false;
    if (!snake.inside(next)) {
      // 울타리: 오른쪽으로 꺾고, 모서리라 오른쪽도 막혔으면 왼쪽으로 (D3).
      hit = 'wall';
      turned = true;
      direction = snake.inside(snake.ahead(RIGHT_OF[direction])) ? RIGHT_OF[direction] : LEFT_OF[direction];
      snake.direction = direction;
      next = snake.ahead(direction);
    }
    const boxIndex = this.boxes.findIndex((b) => sameCell(b.cell, next));
    // 제 몸: 지나가며 마디를 잃는다. 꺾은 칸이 몸이어도 피해는 한 번이다.
    // 먹는 칸에서는 꼬리가 빠지지 않지만, 상자는 몸 위에 생기지 않으므로 판정은 같다.
    if (hit === null && snake.bodyHit(next, boxIndex >= 0) >= 0) hit = 'self';
    this.ticks++;
    const hurt = hit ? this.hurt(hit) : null;
    if (hurt?.over) return { before, hit, hurt, turned, eat: null };
    const eat = boxIndex >= 0 ? this.eat(boxIndex, next) : null;
    if (!eat) snake.moveTo(next, false);
    return { before, hit, hurt, turned, eat };
  }

  /**
   * 피해를 준다. 무적이면 아무 일도 없다. 머리만 남았으면 판이 끝나고, 아니면 꼬리 끝 마디(와 그 타워)를 잃고 무적이 된다 (D2).
   */
  hurt(_cause: DamageCause): Hurt {
    if (!this.alive || this.invulnerable > 0) return { applied: false, lost: null, lostTower: null, over: false };
    if (this.segments === 0) {
      this.alive = false;
      return { applied: true, lost: null, lostTower: null, over: true };
    }
    const [lost] = this.snake.shrink(1);
    const lostTower = this.towers.pop() ?? null;
    this.invulnerable = INVULNERABLE_SECONDS;
    return { applied: true, lost, lostTower, over: false };
  }

  /** 몸과 타워를 바로 놓는다 (개발 확인과 테스트용). 타워를 주지 않으면 모두 화살이다. */
  load(body: readonly Cell[], direction: Direction, towers?: readonly TowerType[], boxes?: readonly TowerBox[]): void {
    this.snake.place(body, direction);
    this.towers = towers ? [...towers] : Array.from({ length: body.length - 1 }, () => START_TOWER);
    if (this.towers.length !== this.segments) throw new Error('타워 수가 마디 수와 다릅니다.');
    if (boxes) this.boxes = boxes.map((b) => ({ cell: { ...b.cell }, type: b.type }));
    this.invulnerable = 0;
    this.alive = true;
    this.pending = 0;
    this.longest = Math.max(this.longest, this.segments);
  }

  /** 상자를 먹고 머리를 그 칸으로 옮긴다. 한계면 늘지 않고 꼬리 끝 타워를 바꾼다 (D4). */
  private eat(index: number, cell: Cell): Eat {
    const [box] = this.boxes.splice(index, 1);
    const replaced = this.segments >= MAX_SEGMENTS;
    this.snake.moveTo(cell, !replaced);
    if (replaced) this.towers[this.towers.length - 1] = box.type;
    else this.towers.push(box.type);
    this.eaten[box.type]++;
    this.longest = Math.max(this.longest, this.segments);
    const spawned = this.spawnBox();
    if (spawned) this.boxes.push(spawned);
    return { box, replaced, spawned };
  }

  /** 뱀·다른 상자가 없고 머리에서 먼 칸에 새 상자. 먼 칸이 없으면 아무 빈 칸, 그것도 없으면 `null` */
  private spawnBox(): TowerBox | null {
    const taken = new Set(this.boxes.map((b) => b.cell.y * BOARD + b.cell.x));
    const free = this.snake.freeCells().filter((i) => !taken.has(i));
    const far = free.filter((i) => reach(this.snake.cellAt(i), this.head) > BOX_MIN_DISTANCE);
    const pool = far.length > 0 ? far : free;
    if (pool.length === 0) return null;
    const cell = this.snake.cellAt(pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))]);
    return { cell, type: pickTower(this.random()) };
  }
}
