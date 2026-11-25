/** 판 한 변의 칸 수 */
export const SIZE = 4;
/** 이 값의 타일을 만들면 이긴다. 이긴 뒤에도 계속 할 수 있다. */
export const GOAL = 2048;
/** 새 타일이 4일 확률 (나머지는 2) */
const FOUR_CHANCE = 0.1;

export type Direction = 'left' | 'right' | 'up' | 'down';

/** 판 위의 타일. `id`는 화면에서 같은 타일을 따라가는 데 쓴다. */
export interface Tile {
  readonly id: number;
  readonly value: number;
  readonly row: number;
  readonly col: number;
}

/** 한 번 밀었을 때 일어난 일 */
export interface MoveResult {
  /** 하나라도 움직이거나 합쳐졌는지 */
  readonly moved: boolean;
  /** 이번에 얻은 점수 (합쳐진 타일 값의 합) */
  readonly gained: number;
  /** 합쳐져 새로 생긴 타일 id */
  readonly merged: readonly number[];
  /** 합쳐지며 사라진 타일. 화면에서 합쳐진 자리로 미끄러진 뒤 지운다. */
  readonly removed: readonly Tile[];
}

type Random = () => number;

/**
 * 2048 판의 상태. DOM 없음.
 * 미는 방향으로 타일을 모두 붙이고, 같은 값이 이웃하면 하나로 합친다. 한 번 민 사이에 합쳐진 타일은 다시 합쳐지지 않는다.
 * 움직임이 있었으면 빈 칸 하나에 2(10%는 4)가 생긴다.
 */
export class Board {
  private tiles: Tile[] = [];
  private nextId = 1;
  score = 0;
  /** 이미 `GOAL`을 만들어 이긴 판인지 */
  won = false;

  constructor(private readonly random: Random = Math.random) {}

  /** 빈 판에서 타일 두 개로 시작한다. */
  reset(): void {
    this.tiles = [];
    this.score = 0;
    this.won = false;
    this.spawn();
    this.spawn();
  }

  /** 시험용: 칸 값으로 판을 채운다. 0은 빈 칸 */
  load(grid: readonly (readonly number[])[]): void {
    this.tiles = [];
    grid.forEach((line, row) =>
      line.forEach((value, col) => {
        if (value > 0) this.tiles.push({ id: this.nextId++, value, row, col });
      }),
    );
  }

  get all(): readonly Tile[] {
    return this.tiles;
  }

  /** 칸 값 표 (0은 빈 칸) */
  grid(): number[][] {
    const grid = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
    for (const tile of this.tiles) grid[tile.row][tile.col] = tile.value;
    return grid;
  }

  /** 빈 칸 하나에 새 타일을 놓는다. 빈 칸이 없으면 `null` */
  spawn(): Tile | null {
    const taken = new Set(this.tiles.map((tile) => tile.row * SIZE + tile.col));
    const empty: number[] = [];
    for (let cell = 0; cell < SIZE * SIZE; cell++) if (!taken.has(cell)) empty.push(cell);
    if (empty.length === 0) return null;
    const cell = empty[Math.floor(this.random() * empty.length)];
    const value = this.random() < FOUR_CHANCE ? 4 : 2;
    const tile: Tile = { id: this.nextId++, value, row: Math.floor(cell / SIZE), col: cell % SIZE };
    this.tiles.push(tile);
    return tile;
  }

  /** `direction`으로 민다. 움직임이 있었으면 새 타일도 하나 놓는다. */
  move(direction: Direction): MoveResult & { spawned: Tile | null } {
    const result = this.slide(direction);
    return { ...result, spawned: result.moved ? this.spawn() : null };
  }

  /** 새 타일 없이 밀기만 한다. */
  slide(direction: Direction): MoveResult {
    const byCell = new Map<number, Tile>();
    for (const tile of this.tiles) byCell.set(tile.row * SIZE + tile.col, tile);
    const next: Tile[] = [];
    const merged: number[] = [];
    const removed: Tile[] = [];
    let gained = 0;
    let moved = false;

    for (let line = 0; line < SIZE; line++) {
      // 미는 쪽 끝에서부터 읽은 줄의 칸 좌표
      const cells = Array.from({ length: SIZE }, (_, step) => cellOf(direction, line, step));
      const lineTiles = cells.map(([row, col]) => byCell.get(row * SIZE + col)).filter((tile) => tile !== undefined);
      let target = 0;
      for (let i = 0; i < lineTiles.length; i++) {
        const tile = lineTiles[i];
        const [row, col] = cells[target];
        const partner = lineTiles[i + 1];
        if (partner && partner.value === tile.value) {
          const value = tile.value * 2;
          const fresh: Tile = { id: this.nextId++, value, row, col };
          next.push(fresh);
          merged.push(fresh.id);
          removed.push({ ...tile, row, col }, { ...partner, row, col });
          gained += value;
          moved = true;
          i++;
        } else {
          if (tile.row !== row || tile.col !== col) moved = true;
          next.push({ ...tile, row, col });
        }
        target++;
      }
    }

    if (moved) {
      this.tiles = next;
      this.score += gained;
      if (!this.won && next.some((tile) => tile.value >= GOAL)) this.won = true;
    }
    return { moved, gained, merged, removed };
  }

  /** 더 밀 수 있는지 (빈 칸이 있거나 이웃한 같은 값이 있으면 된다) */
  canMove(): boolean {
    if (this.tiles.length < SIZE * SIZE) return true;
    const grid = this.grid();
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const value = grid[row][col];
        if (col + 1 < SIZE && grid[row][col + 1] === value) return true;
        if (row + 1 < SIZE && grid[row + 1][col] === value) return true;
      }
    }
    return false;
  }

  /** 판에서 가장 큰 타일 값 */
  get highest(): number {
    return this.tiles.reduce((best, tile) => Math.max(best, tile.value), 0);
  }
}

/** `direction`으로 밀 때 `line`번째 줄에서 미는 쪽 끝부터 `step`번째 칸 */
function cellOf(direction: Direction, line: number, step: number): [row: number, col: number] {
  switch (direction) {
    case 'left':
      return [line, step];
    case 'right':
      return [line, SIZE - 1 - step];
    case 'up':
      return [step, line];
    case 'down':
      return [SIZE - 1 - step, line];
  }
}
