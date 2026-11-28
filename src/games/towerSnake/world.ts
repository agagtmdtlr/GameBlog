import { GridSnake, LEFT_OF, RIGHT_OF, type Cell, type Direction } from '../../lib/gridSnake';

export type { Cell, Direction } from '../../lib/gridSnake';

/** 판 한 변의 칸 수 (D1: 큰 판) */
export const BOARD = 41;
/** 처음 타워 마디 수 (머리 빼고) */
export const START_SEGMENTS = 2;
/** 뱀이 나아가는 빠르기 (초당 칸, 일정) */
export const SPEED = 5;
/** 피해를 받은 뒤 무적 시간 (초) */
export const INVULNERABLE_SECONDS = 1;

/** 피해의 원인. `enemy`는 단계 3에서 쓴다. */
export type DamageCause = 'wall' | 'self' | 'enemy';

/** 피해를 주려 한 결과 */
export interface Hurt {
  /** 실제로 피해를 받았는지 (무적이면 `false`) */
  readonly applied: boolean;
  /** 잃은 꼬리 마디 자리 */
  readonly lost: Cell | null;
  /** 머리만 남은 채로 피해를 받아 끝났는지 */
  readonly over: boolean;
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
}

/**
 * 타워 뱀 한 판의 상태 (단계 1: 판, 움직임, 울타리·제 몸 피해).
 * 몸 움직임은 공용 `GridSnake`가 맡고, 여기서는 울타리에서 꺾기, 제 몸 지나가기, 마디 잃기, 무적, 끝을 정한다.
 * `update(dt)`로 시간을 받아 `SPEED`마다 한 칸 나아간다.
 */
export class TowerSnakeWorld {
  readonly snake = new GridSnake({ width: BOARD, height: BOARD });
  /** 논 시간 (초) */
  time = 0;
  /** 나아간 칸 수 */
  ticks = 0;
  /** 남은 무적 시간 (초) */
  invulnerable = 0;
  alive = true;
  /** 이번 판에서 가장 길었던 타워 마디 수 */
  longest = START_SEGMENTS;
  /** 이번 칸에서 흐른 시간 (초) */
  private pending = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    const mid = Math.floor(BOARD / 2);
    this.snake.place(
      Array.from({ length: START_SEGMENTS + 1 }, (_, i) => ({ x: mid - i, y: mid })),
      'right',
    );
    this.time = 0;
    this.ticks = 0;
    this.invulnerable = 0;
    this.alive = true;
    this.longest = START_SEGMENTS;
    this.pending = 0;
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
    // 제 몸: 지나가며 마디를 잃는다. 꺾은 칸이 몸이어도 피해는 한 번이다.
    if (hit === null && snake.bodyHit(next, false) >= 0) hit = 'self';
    this.ticks++;
    const hurt = hit ? this.hurt(hit) : null;
    if (hurt?.over) return { before, hit, hurt, turned };
    snake.moveTo(next, false);
    return { before, hit, hurt, turned };
  }

  /**
   * 피해를 준다. 무적이면 아무 일도 없다. 머리만 남았으면 판이 끝나고, 아니면 꼬리 끝 마디를 잃고 무적이 된다 (D2).
   */
  hurt(_cause: DamageCause): Hurt {
    if (!this.alive || this.invulnerable > 0) return { applied: false, lost: null, over: false };
    if (this.segments === 0) {
      this.alive = false;
      return { applied: true, lost: null, over: true };
    }
    const [lost] = this.snake.shrink(1);
    this.invulnerable = INVULNERABLE_SECONDS;
    return { applied: true, lost, over: false };
  }

  /** 몸을 바로 놓는다 (개발 확인과 테스트용). */
  load(body: readonly Cell[], direction: Direction): void {
    this.snake.place(body, direction);
    this.invulnerable = 0;
    this.alive = true;
    this.pending = 0;
    this.longest = Math.max(this.longest, this.segments);
  }
}
