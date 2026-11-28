import { describe, expect, it } from 'vitest';
import { emptySnakeStats, SNAKE_RECORDS, type SnakePlay } from './records';
import { GRID, MAX_SPEED, SnakeGame, START_LENGTH, START_SPEED, type Cell } from './snakeGame';

const fixed = (value: number) => () => value;
const row = (y: number, ...xs: number[]): Cell[] => xs.map((x) => ({ x, y }));

describe('뱀 놀이', () => {
  it('가운데 줄에서 오른쪽을 보고 시작하고, 먹이는 몸 밖에 있다', () => {
    const game = new SnakeGame(fixed(0.5));
    expect(game.body).toHaveLength(START_LENGTH);
    expect(game.direction).toBe('right');
    expect(game.head.y).toBe(Math.floor(GRID / 2));
    expect(game.body.some((c) => c.x === game.food?.x && c.y === game.food?.y)).toBe(false);
    expect(game.speed).toBe(START_SPEED);
  });

  it('한 칸씩 나아가고 길이는 그대로다', () => {
    const game = new SnakeGame(fixed(0));
    game.load(row(5, 5, 4, 3), 'right', { x: 0, y: 0 });
    game.tick();
    expect(game.body).toEqual(row(5, 6, 5, 4));
    expect(game.ticks).toBe(1);
  });

  it('반대 방향과 같은 방향은 무시하고, 두 번까지 미리 받아 둔다', () => {
    const game = new SnakeGame(fixed(0));
    game.load(row(5, 5, 4, 3), 'right', null);
    expect(game.turn('left')).toBe(false);
    expect(game.turn('right')).toBe(false);
    expect(game.turn('up')).toBe(true);
    // 받아 둔 'up'의 반대
    expect(game.turn('down')).toBe(false);
    expect(game.turn('left')).toBe(true);
    expect(game.turn('down')).toBe(false);
    game.tick();
    expect(game.head).toEqual({ x: 5, y: 4 });
    game.tick();
    expect(game.head).toEqual({ x: 4, y: 4 });
  });

  it('먹이를 먹으면 길어지고 빨라지며 새 먹이가 몸 밖에 생긴다', () => {
    const game = new SnakeGame(fixed(0));
    game.load(row(5, 5, 4, 3), 'right', { x: 6, y: 5 });
    const result = game.tick();
    expect(result.ate).toBe(true);
    expect(game.body).toEqual(row(5, 6, 5, 4, 3));
    expect(game.score).toBe(1);
    expect(game.speed).toBeGreaterThan(START_SPEED);
    expect(game.food).not.toBeNull();
    expect(game.body.some((c) => c.x === game.food!.x && c.y === game.food!.y)).toBe(false);
  });

  it('빠르기는 MAX_SPEED를 넘지 않는다', () => {
    const game = new SnakeGame();
    game.score = 10_000;
    expect(game.speed).toBe(MAX_SPEED);
  });

  it('벽에 부딪히면 끝난다', () => {
    const game = new SnakeGame(fixed(0));
    game.load(row(5, GRID - 1, GRID - 2, GRID - 3), 'right', null);
    expect(game.tick().crash).toBe('wall');
    expect(game.alive).toBe(false);
    expect(game.head.x).toBe(GRID - 1);
    expect(game.turn('up')).toBe(false);
  });

  it('제 몸에 부딪히면 끝나지만, 빠져나가는 꼬리 칸에는 들어갈 수 있다', () => {
    // 2×2로 감은 몸: 머리 (5,5), 꼬리 (5,6)
    const loop = new SnakeGame(fixed(0));
    loop.load([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }], 'left', null);
    loop.turn('down');
    expect(loop.tick().crash).toBeNull();
    expect(loop.head).toEqual({ x: 5, y: 6 });

    const bite = new SnakeGame(fixed(0));
    bite.load([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }], 'left', null);
    bite.turn('down');
    expect(bite.tick().crash).toBe('self');
  });

  it('빈 칸이 없으면 판을 채워 이긴다', () => {
    const game = new SnakeGame(fixed(0));
    const body: Cell[] = [];
    // 뱀 모양으로 판 전체를 채우고 마지막 한 칸에 먹이
    for (let y = 0; y < GRID; y++) {
      const xs = Array.from({ length: GRID }, (_, i) => (y % 2 === 0 ? i : GRID - 1 - i));
      for (const x of xs) body.unshift({ x, y });
    }
    const last = body.shift()!;
    game.load(body, last.x === body[0].x ? (last.y > body[0].y ? 'down' : 'up') : last.x > body[0].x ? 'right' : 'left', last);
    const result = game.tick();
    expect(result.ate).toBe(true);
    expect(result.full).toBe(true);
    expect(game.food).toBeNull();
    expect(game.alive).toBe(false);
    expect(game.body).toHaveLength(GRID * GRID);
  });
});

describe('뱀 기록', () => {
  const play = (over: Partial<SnakePlay> = {}): SnakePlay => ({ score: 4, length: 7, ticks: 80, seconds: 12.5, end: 'wall', ...over });

  it('판을 쌓으면 누적 수치가 는다', () => {
    const times = { startedAt: 0, endedAt: 1 };
    let stats = SNAKE_RECORDS.accumulate(emptySnakeStats(), play(), times);
    stats = SNAKE_RECORDS.accumulate(stats, play({ score: 9, length: 12, end: 'full' }), times);
    expect(stats).toEqual({ plays: 2, fills: 1, best: 9, longest: 12, totalFood: 13, totalTicks: 160, totalSeconds: 25 });
  });

  it('저장된 값을 검사한다', () => {
    const migrate = SNAKE_RECORDS.migrate!;
    expect(migrate('play', 1, play())).toEqual(play());
    expect(migrate('play', 1, { ...play(), end: 'bored' })).toBeUndefined();
    expect(migrate('play', 1, { ...play(), score: -1 })).toBeUndefined();
    expect(migrate('play', 2, play())).toBeUndefined();
    expect(migrate('stats', 1, { plays: 3 })).toEqual({ ...emptySnakeStats(), plays: 3 });
    expect(migrate('stats', 1, { plays: 'x' })).toBeUndefined();
    expect(migrate('progress', 1, {})).toBeUndefined();
  });
});
