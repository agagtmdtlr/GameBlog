import { GridSnake, type Cell, type Direction } from '../../lib/gridSnake';

export { STEP, type Cell, type Direction } from '../../lib/gridSnake';

/** 판 한 변의 칸 수. 홀수라 뱀이 가운데 줄에서 시작한다. */
export const GRID = 15;
/** 처음 몸 길이 (머리 포함) */
export const START_LENGTH = 3;
/** 처음 빠르기 (초당 칸) */
export const START_SPEED = 6.5;
/** 먹이 하나마다 빨라지는 정도 (초당 칸) */
export const SPEED_STEP = 0.15;
export const MAX_SPEED = 13;

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

/**
 * 뱀 한 판의 상태. 시간은 모르고 `tick`마다 한 칸 나아간다.
 * 몸 움직임은 공용 `GridSnake`(`lib/gridSnake/`)가 맡고, 여기서는 먹이·점수·부딪히면 끝나는 규칙을 정한다.
 */
export class SnakeGame {
  private readonly snake = new GridSnake({ width: GRID, height: GRID });
  food: Cell | null = null;
  /** 먹은 먹이 수 */
  score = 0;
  /** 나아간 칸 수 */
  ticks = 0;
  alive = true;
  /** 판을 모두 채워 이겼는지 */
  full = false;

  constructor(private readonly random: Random = Math.random) {
    this.reset();
  }

  reset(): void {
    const y = Math.floor(GRID / 2);
    const head = Math.floor(GRID / 2) - 2;
    this.snake.place(
      Array.from({ length: START_LENGTH }, (_, i) => ({ x: head - i, y })),
      'right',
    );
    this.score = 0;
    this.ticks = 0;
    this.alive = true;
    this.full = false;
    this.food = this.placeFood();
  }

  /** 머리부터 꼬리까지 */
  get body(): Cell[] {
    return this.snake.body;
  }

  get head(): Cell {
    return this.snake.head;
  }

  /** 지금 나아가는 방향 */
  get direction(): Direction {
    return this.snake.direction;
  }

  /** 초당 나아가는 칸 수 */
  get speed(): number {
    return Math.min(MAX_SPEED, START_SPEED + this.score * SPEED_STEP);
  }

  /** 다음에 나아갈 방향 (받아 둔 방향이 있으면 그것) */
  get nextDirection(): Direction {
    return this.snake.nextDirection;
  }

  /**
   * 방향을 바꾼다. 마지막으로 받은 방향과 같거나 반대면 무시한다 (제 몸으로 바로 돌아 들어가지 않게).
   * 받아들였으면 `true`.
   */
  turn(direction: Direction): boolean {
    if (!this.alive) return false;
    return this.snake.turn(direction);
  }

  /** 한 칸 나아간다. */
  tick(): TickResult {
    if (!this.alive) return { ate: false, crash: null, full: this.full };
    const next = this.snake.ahead(this.snake.takeDirection());
    this.ticks++;
    if (!this.snake.inside(next)) return this.crash('wall');
    const ate = this.food !== null && next.x === this.food.x && next.y === this.food.y;
    if (this.snake.bodyHit(next, ate) >= 0) return this.crash('self');
    this.snake.moveTo(next, ate);
    if (ate) {
      this.score++;
      this.food = this.placeFood();
      if (!this.food) {
        this.full = true;
        this.alive = false;
      }
    }
    return { ate, crash: null, full: this.full };
  }

  /** 판을 바로 놓는다 (개발 확인과 테스트용). */
  load(body: readonly Cell[], direction: Direction, food: Cell | null): void {
    this.snake.place(body, direction);
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
    const free = this.snake.freeCells();
    if (free.length === 0) return null;
    return this.snake.cellAt(free[Math.min(free.length - 1, Math.floor(this.random() * free.length))]);
  }
}
