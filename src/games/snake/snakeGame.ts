/** 판 한 변의 칸 수. 홀수라 뱀이 가운데 줄에서 시작한다. */
export const GRID = 15;
/** 처음 몸 길이 (머리 포함) */
export const START_LENGTH = 3;
/** 처음 빠르기 (초당 칸) */
export const START_SPEED = 6.5;
/** 먹이 하나마다 빨라지는 정도 (초당 칸) */
export const SPEED_STEP = 0.15;
export const MAX_SPEED = 13;
/** 미리 받아 두는 방향 바꾸기 수. 빠르게 두 번 꺾는 입력을 놓치지 않는다. */
const QUEUE_LIMIT = 2;

export type Direction = 'up' | 'down' | 'left' | 'right';

/** 칸 좌표. `x`는 왼쪽에서 오른쪽, `y`는 위(화면 안쪽)에서 아래(화면 앞쪽)로 는다. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

export const STEP: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** 한 칸 나아간 결과 */
export interface TickResult {
  /** 먹이를 먹었는지 */
  readonly ate: boolean;
  /** 부딪혀 끝났으면 무엇에 부딪혔는지 */
  readonly crash: 'wall' | 'self' | null;
  /** 판을 모두 채웠는지 */
  readonly full: boolean;
}

export type Random = () => number;

/** 뱀 한 판의 상태. 시간은 모르고 `tick`마다 한 칸 나아간다. */
export class SnakeGame {
  /** 머리부터 꼬리까지 */
  body: Cell[] = [];
  /** 지금 나아가는 방향 */
  direction: Direction = 'right';
  food: Cell | null = null;
  /** 먹은 먹이 수 */
  score = 0;
  /** 나아간 칸 수 */
  ticks = 0;
  alive = true;
  /** 판을 모두 채워 이겼는지 */
  full = false;
  private queue: Direction[] = [];

  constructor(private readonly random: Random = Math.random) {
    this.reset();
  }

  reset(): void {
    const y = Math.floor(GRID / 2);
    const head = Math.floor(GRID / 2) - 2;
    this.body = Array.from({ length: START_LENGTH }, (_, i) => ({ x: head - i, y }));
    this.direction = 'right';
    this.queue = [];
    this.score = 0;
    this.ticks = 0;
    this.alive = true;
    this.full = false;
    this.food = this.placeFood();
  }

  get head(): Cell {
    return this.body[0];
  }

  /** 초당 나아가는 칸 수 */
  get speed(): number {
    return Math.min(MAX_SPEED, START_SPEED + this.score * SPEED_STEP);
  }

  /** 다음에 나아갈 방향 (받아 둔 방향이 있으면 그것) */
  get nextDirection(): Direction {
    return this.queue[0] ?? this.direction;
  }

  /**
   * 방향을 바꾼다. 마지막으로 받은 방향과 같거나 반대면 무시한다 (제 몸으로 바로 돌아 들어가지 않게).
   * 받아들였으면 `true`.
   */
  turn(direction: Direction): boolean {
    if (!this.alive) return false;
    const last = this.queue[this.queue.length - 1] ?? this.direction;
    if (direction === last || direction === OPPOSITE[last]) return false;
    if (this.queue.length >= QUEUE_LIMIT) return false;
    this.queue.push(direction);
    return true;
  }

  /** 한 칸 나아간다. */
  tick(): TickResult {
    if (!this.alive) return { ate: false, crash: null, full: this.full };
    this.direction = this.queue.shift() ?? this.direction;
    const step = STEP[this.direction];
    const next = { x: this.head.x + step.x, y: this.head.y + step.y };
    this.ticks++;
    if (next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID) return this.crash('wall');
    const ate = this.food !== null && next.x === this.food.x && next.y === this.food.y;
    // 먹지 않으면 꼬리가 같은 때 빠지므로 지금 꼬리 칸으로는 들어갈 수 있다.
    const blocking = ate ? this.body : this.body.slice(0, -1);
    if (blocking.some((c) => c.x === next.x && c.y === next.y)) return this.crash('self');
    this.body.unshift(next);
    if (ate) {
      this.score++;
      this.food = this.placeFood();
      if (!this.food) {
        this.full = true;
        this.alive = false;
      }
    } else this.body.pop();
    return { ate, crash: null, full: this.full };
  }

  /** 판을 바로 놓는다 (개발 확인과 테스트용). */
  load(body: readonly Cell[], direction: Direction, food: Cell | null): void {
    this.body = body.map((c) => ({ ...c }));
    this.direction = direction;
    this.queue = [];
    this.food = food;
    this.alive = true;
    this.full = false;
  }

  private crash(crash: 'wall' | 'self'): TickResult {
    this.alive = false;
    return { ate: false, crash, full: false };
  }

  /** 뱀이 없는 칸 가운데 하나. 빈 칸이 없으면 `null` */
  private placeFood(): Cell | null {
    const taken = new Set(this.body.map((c) => c.y * GRID + c.x));
    const free: number[] = [];
    for (let i = 0; i < GRID * GRID; i++) if (!taken.has(i)) free.push(i);
    if (free.length === 0) return null;
    const pick = free[Math.min(free.length - 1, Math.floor(this.random() * free.length))];
    return { x: pick % GRID, y: Math.floor(pick / GRID) };
  }
}
