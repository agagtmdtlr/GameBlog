/**
 * 칸 위를 나아가는 뱀 몸. 방향 받기, 한 칸 나아가기, 늘이기, 마디 잃기를 맡는다.
 * 벽·제 몸에 부딪히는지는 판정만 돌려주고, 그 결과(끝, 피해, 꺾기)는 게임이 정한다.
 * 시간과 먹이는 모른다.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

/** 칸 좌표. `x`는 왼쪽에서 오른쪽, `y`는 위(화면 안쪽)에서 아래(화면 앞쪽)로 는다. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

export const STEP: Readonly<Record<Direction, Cell>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Readonly<Record<Direction, Direction>> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** 나아가는 쪽에서 오른쪽으로 꺾은 방향 (판을 위에서 볼 때) */
export const RIGHT_OF: Readonly<Record<Direction, Direction>> = { up: 'right', right: 'down', down: 'left', left: 'up' };
/** 나아가는 쪽에서 왼쪽으로 꺾은 방향 */
export const LEFT_OF: Readonly<Record<Direction, Direction>> = { up: 'left', left: 'down', down: 'right', right: 'up' };

export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export interface GridSnakeOptions {
  /** 판 가로 칸 수 */
  readonly width: number;
  /** 판 세로 칸 수 */
  readonly height: number;
  /** 미리 받아 두는 방향 바꾸기 수. 빠르게 두 번 꺾는 입력을 놓치지 않는다. */
  readonly queueLimit?: number;
}

export class GridSnake {
  readonly width: number;
  readonly height: number;
  /** 머리부터 꼬리까지 */
  body: Cell[] = [];
  /** 지금 나아가는 방향 */
  direction: Direction = 'right';
  private queue: Direction[] = [];
  private readonly queueLimit: number;

  constructor(options: GridSnakeOptions) {
    this.width = options.width;
    this.height = options.height;
    this.queueLimit = options.queueLimit ?? 2;
  }

  /** 몸과 방향을 놓고 받아 둔 방향을 비운다. */
  place(body: readonly Cell[], direction: Direction): void {
    this.body = body.map((c) => ({ x: c.x, y: c.y }));
    this.direction = direction;
    this.queue = [];
  }

  get head(): Cell {
    return this.body[0];
  }

  get tail(): Cell {
    return this.body[this.body.length - 1];
  }

  /** 다음에 나아갈 방향 (받아 둔 방향이 있으면 그것) */
  get nextDirection(): Direction {
    return this.queue[0] ?? this.direction;
  }

  /** 받아 둔 방향들 */
  get queued(): readonly Direction[] {
    return this.queue;
  }

  /**
   * 방향 바꾸기를 받아 둔다. 마지막으로 받은 방향과 같거나 반대면 무시한다 (제 몸으로 바로 돌아 들어가지 않게).
   * 받아들였으면 `true`.
   */
  turn(direction: Direction): boolean {
    const last = this.queue[this.queue.length - 1] ?? this.direction;
    if (direction === last || direction === OPPOSITE[last]) return false;
    if (this.queue.length >= this.queueLimit) return false;
    this.queue.push(direction);
    return true;
  }

  /** 받아 둔 방향을 모두 버린다. */
  clearQueue(): void {
    this.queue = [];
  }

  /** 받아 둔 방향 하나를 꺼내 지금 방향으로 삼는다. 없으면 그대로. */
  takeDirection(): Direction {
    this.direction = this.queue.shift() ?? this.direction;
    return this.direction;
  }

  /** `from`에서 `direction`으로 한 칸 간 칸 */
  ahead(direction: Direction = this.direction, from: Cell = this.head): Cell {
    const step = STEP[direction];
    return { x: from.x + step.x, y: from.y + step.y };
  }

  /** 판 안의 칸인지 */
  inside(cell: Cell): boolean {
    return cell.x >= 0 && cell.y >= 0 && cell.x < this.width && cell.y < this.height;
  }

  /**
   * 머리가 `cell`로 나아가면 부딪히는 몸 마디의 번호 (머리가 0). 없으면 -1.
   * 늘지 않으면(`grow`가 `false`) 꼬리가 같은 때 빠지므로 지금 꼬리 칸은 막히지 않는다.
   */
  bodyHit(cell: Cell, grow: boolean): number {
    const end = grow ? this.body.length : this.body.length - 1;
    for (let i = 0; i < end; i++) if (sameCell(this.body[i], cell)) return i;
    return -1;
  }

  /** 머리를 `cell`로 옮긴다. `grow`면 꼬리를 두어 한 마디 늘고, 아니면 꼬리가 빠진다. 부딪힘은 보지 않는다. */
  moveTo(cell: Cell, grow: boolean): void {
    this.body.unshift({ x: cell.x, y: cell.y });
    if (!grow) this.body.pop();
  }

  /** 꼬리 끝에서 마디를 `count`개 잃는다. 머리는 남긴다. 잃은 마디를 꼬리 끝부터 돌려준다. */
  shrink(count = 1): Cell[] {
    const lost: Cell[] = [];
    while (lost.length < count && this.body.length > 1) lost.push(this.body.pop()!);
    return lost;
  }

  /** `cell`에 몸이 있는지 */
  occupies(cell: Cell): boolean {
    return this.body.some((c) => sameCell(c, cell));
  }

  /** 몸이 없는 칸의 번호 (`y * width + x`) 목록 */
  freeCells(): number[] {
    const taken = new Set(this.body.map((c) => c.y * this.width + c.x));
    const free: number[] = [];
    for (let i = 0; i < this.width * this.height; i++) if (!taken.has(i)) free.push(i);
    return free;
  }

  /** 칸 번호 → 칸 */
  cellAt(index: number): Cell {
    return { x: index % this.width, y: Math.floor(index / this.width) };
  }
}
