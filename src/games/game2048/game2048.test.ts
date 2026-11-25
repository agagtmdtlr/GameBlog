import { describe, expect, it } from 'vitest';
import { Board, GOAL, SIZE } from './board';
import { tileStyle } from './tileStyle';
import { emptyStats2048, RECORDS_2048, type Play2048 } from './records';

const board = (grid: number[][]) => {
  const b = new Board(() => 0);
  b.load(grid);
  return b;
};

describe('2048 판', () => {
  it('시작하면 타일이 두 개다', () => {
    const b = new Board();
    b.reset();
    expect(b.all).toHaveLength(2);
    expect(b.all.every((tile) => tile.value === 2 || tile.value === 4)).toBe(true);
  });

  it('밀면 한쪽으로 붙고 같은 값은 합쳐진다', () => {
    const b = board([
      [2, 2, 2, 2],
      [0, 4, 0, 4],
      [2, 0, 0, 2],
      [8, 4, 2, 0],
    ]);
    const result = b.slide('left');
    expect(b.grid()).toEqual([
      [4, 4, 0, 0],
      [8, 0, 0, 0],
      [4, 0, 0, 0],
      [8, 4, 2, 0],
    ]);
    expect(result.moved).toBe(true);
    expect(result.gained).toBe(4 + 4 + 8 + 4);
    expect(result.merged).toHaveLength(4);
    expect(result.removed).toHaveLength(8);
    expect(b.score).toBe(20);
  });

  it('한 번 민 사이에 합쳐진 타일은 다시 합쳐지지 않는다', () => {
    const b = board([
      [4, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    b.slide('left');
    expect(b.grid()[0]).toEqual([4, 4, 0, 0]);
  });

  it('미는 쪽 끝부터 합친다', () => {
    const b = board([
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    b.slide('right');
    expect(b.grid()[0]).toEqual([0, 0, 2, 4]);
    b.load([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [4, 0, 0, 0],
      [4, 0, 0, 0],
    ]);
    b.slide('down');
    expect(b.grid().map((line) => line[0])).toEqual([0, 0, 4, 8]);
    b.slide('up');
    expect(b.grid().map((line) => line[0])).toEqual([4, 8, 0, 0]);
  });

  it('움직임이 없으면 새 타일이 생기지 않는다', () => {
    const b = board([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const result = b.move('left');
    expect(result.moved).toBe(false);
    expect(result.spawned).toBeNull();
    expect(b.all).toHaveLength(2);
    expect(b.move('right').spawned).not.toBeNull();
    expect(b.all).toHaveLength(3);
  });

  it('빈 칸도 이웃한 같은 값도 없으면 끝난다', () => {
    const full = board([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(full.canMove()).toBe(false);
    full.load([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 4],
    ]);
    expect(full.canMove()).toBe(true);
  });

  it(`${GOAL}을 만들면 이긴다`, () => {
    const b = board([
      [GOAL / 2, GOAL / 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(b.won).toBe(false);
    b.slide('left');
    expect(b.won).toBe(true);
    expect(b.highest).toBe(GOAL);
  });

  it('타일 id는 겹치지 않는다', () => {
    const b = new Board();
    b.reset();
    const directions = ['left', 'up', 'right', 'down'] as const;
    for (let i = 0; i < 200 && b.canMove(); i++) b.move(directions[i % 4]);
    const ids = b.all.map((tile) => tile.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.all.length).toBeLessThanOrEqual(SIZE * SIZE);
  });

  it('타일 값마다 색이 다르다', () => {
    const values = Array.from({ length: 17 }, (_, i) => 2 ** (i + 1));
    const colors = values.map((value) => tileStyle(value).background);
    expect(new Set(colors.slice(0, 11)).size).toBe(11);
    expect(colors.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
  });
});

describe('2048 기록', () => {
  const play = (score: number, extra: Partial<Play2048> = {}): Play2048 => ({
    score,
    highest: 64,
    moves: 10,
    won: false,
    end: 'over',
    grid: [
      [2, 4, 8, 16],
      [4, 8, 16, 32],
      [8, 16, 32, 64],
      [16, 32, 64, 2],
    ],
    ...extra,
  });
  const times = { startedAt: 0, endedAt: 1 };

  it('끝난 판을 누적 수치에 더한다', () => {
    let stats = emptyStats2048();
    stats = RECORDS_2048.accumulate(stats, play(300), times);
    stats = RECORDS_2048.accumulate(stats, play(120, { end: 'restart', won: true, highest: 2048, moves: 5 }), times);
    expect(stats).toEqual({ plays: 2, finished: 1, wins: 1, best: 300, bestTile: 2048, totalScore: 420, totalMoves: 15 });
  });

  it('저장된 값을 검사한다', () => {
    const migrate = RECORDS_2048.migrate!;
    expect(migrate('play', 1, play(8))).toEqual(play(8));
    expect(migrate('play', 1, { ...play(8), grid: [[3]] })).toBeUndefined();
    expect(migrate('play', 2, play(8))).toBeUndefined();
    expect(migrate('stats', 1, { best: 40 })).toEqual({ ...emptyStats2048(), best: 40 });
    expect(migrate('stats', 1, { best: -1 })).toBeUndefined();
    const progress = { grid: play(0).grid, score: 4, won: false, moves: 2, startedAt: 5 };
    expect(migrate('progress', 1, progress)).toEqual(progress);
    expect(migrate('progress', 1, { ...progress, grid: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] })).toBeUndefined();
  });
});
