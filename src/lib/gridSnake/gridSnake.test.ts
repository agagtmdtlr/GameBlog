import { describe, expect, it } from 'vitest';
import { GridSnake, LEFT_OF, OPPOSITE, RIGHT_OF, type Cell, type Direction } from '.';

const row = (y: number, ...xs: number[]): Cell[] => xs.map((x) => ({ x, y }));

function snake(body: Cell[], direction: Direction = 'right', size = 10): GridSnake {
  const s = new GridSnake({ width: size, height: size });
  s.place(body, direction);
  return s;
}

describe('칸 위의 뱀 몸', () => {
  it('놓은 몸을 복사해 갖고, 받아 둔 방향을 비운다', () => {
    const body = row(5, 5, 4, 3);
    const s = snake(body);
    s.turn('up');
    s.place(body, 'right');
    expect(s.body).toEqual(body);
    expect(s.body[0]).not.toBe(body[0]);
    expect(s.queued).toEqual([]);
    expect(s.head).toEqual({ x: 5, y: 5 });
    expect(s.tail).toEqual({ x: 3, y: 5 });
  });

  it('반대·같은 방향은 무시하고, 정한 수까지만 받아 두며, 꺼낸 순서대로 방향이 된다', () => {
    const s = snake(row(5, 5, 4, 3));
    expect(s.turn('left')).toBe(false);
    expect(s.turn('right')).toBe(false);
    expect(s.turn('up')).toBe(true);
    expect(s.turn('down')).toBe(false);
    expect(s.turn('left')).toBe(true);
    expect(s.turn('down')).toBe(false);
    expect(s.nextDirection).toBe('up');
    expect(s.takeDirection()).toBe('up');
    expect(s.takeDirection()).toBe('left');
    expect(s.takeDirection()).toBe('left');
    s.turn('up');
    s.clearQueue();
    expect(s.nextDirection).toBe('left');
  });

  it('받아 둘 수를 정할 수 있다', () => {
    const s = new GridSnake({ width: 5, height: 5, queueLimit: 1 });
    s.place(row(2, 2, 1), 'right');
    expect(s.turn('up')).toBe(true);
    expect(s.turn('left')).toBe(false);
  });

  it('앞 칸과 판 안을 판정한다', () => {
    const s = snake(row(0, 9, 8), 'right');
    expect(s.ahead()).toEqual({ x: 10, y: 0 });
    expect(s.inside(s.ahead())).toBe(false);
    expect(s.inside(s.ahead('up'))).toBe(false);
    expect(s.inside(s.ahead('down'))).toBe(true);
    expect(s.ahead('left', { x: 3, y: 3 })).toEqual({ x: 2, y: 3 });
  });

  it('늘지 않을 때는 빠져나가는 꼬리 칸으로 들어갈 수 있고, 늘 때는 막힌다', () => {
    // 2×2로 감은 몸: 머리 (5,5), 꼬리 (5,6)
    const s = snake([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }], 'left');
    const tailCell = { x: 5, y: 6 };
    expect(s.bodyHit(tailCell, false)).toBe(-1);
    expect(s.bodyHit(tailCell, true)).toBe(3);
    expect(s.bodyHit({ x: 6, y: 6 }, false)).toBe(2);
  });

  it('나아가면 꼬리가 빠지고, 늘면 꼬리가 남는다', () => {
    const s = snake(row(5, 5, 4, 3));
    s.moveTo({ x: 6, y: 5 }, false);
    expect(s.body).toEqual(row(5, 6, 5, 4));
    s.moveTo({ x: 7, y: 5 }, true);
    expect(s.body).toEqual(row(5, 7, 6, 5, 4));
  });

  it('제 몸 칸으로도 옮길 수 있다 (몸을 지나가는 규칙은 게임이 정한다)', () => {
    const s = snake([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }], 'left');
    const into = { x: 5, y: 6 };
    expect(s.bodyHit(into, false)).toBe(3);
    s.moveTo(into, false);
    expect(s.head).toEqual(into);
    expect(s.body).toHaveLength(5);
    expect(s.body.filter((c) => c.x === 5 && c.y === 6)).toHaveLength(2);
  });

  it('꼬리 끝부터 마디를 잃고, 머리는 남긴다', () => {
    const s = snake(row(5, 5, 4, 3, 2));
    expect(s.shrink()).toEqual([{ x: 2, y: 5 }]);
    expect(s.body).toEqual(row(5, 5, 4, 3));
    expect(s.shrink(5)).toEqual([{ x: 3, y: 5 }, { x: 4, y: 5 }]);
    expect(s.body).toEqual(row(5, 5));
    expect(s.shrink()).toEqual([]);
  });

  it('빈 칸 목록과 칸 번호', () => {
    const s = new GridSnake({ width: 3, height: 2 });
    s.place([{ x: 0, y: 0 }, { x: 1, y: 0 }], 'left');
    expect(s.freeCells()).toEqual([2, 3, 4, 5]);
    expect(s.cellAt(4)).toEqual({ x: 1, y: 1 });
    expect(s.occupies({ x: 1, y: 0 })).toBe(true);
    expect(s.occupies({ x: 2, y: 0 })).toBe(false);
  });

  it('오른쪽·왼쪽으로 꺾은 방향', () => {
    for (const d of ['up', 'down', 'left', 'right'] as const) {
      expect(LEFT_OF[RIGHT_OF[d]]).toBe(d);
      expect(RIGHT_OF[RIGHT_OF[d]]).toBe(OPPOSITE[d]);
    }
    expect(RIGHT_OF.up).toBe('right');
    expect(LEFT_OF.up).toBe('left');
  });
});
