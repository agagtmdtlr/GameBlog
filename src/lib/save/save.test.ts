import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createMemoryBackend, openIndexedDbBackend, type SaveBackend } from './backend';
import { RecordBook, type RecordSpec } from './recordBook';

interface Stats {
  games: number;
  best: number;
}
interface Play {
  score: number;
  board: number[][];
}
interface Progress {
  score: number;
}

const spec: RecordSpec<Stats, Play> = {
  game: 'test',
  version: 1,
  emptyStats: () => ({ games: 0, best: 0 }),
  accumulate: (stats, play) => ({ games: stats.games + 1, best: Math.max(stats.best, play.score) }),
};

const times = (n: number) => ({ startedAt: n * 1000, endedAt: n * 1000 + 500 });

const backends: [string, () => Promise<SaveBackend>][] = [
  ['IndexedDB', () => openIndexedDbBackend(new IDBFactory())],
  ['메모리', async () => createMemoryBackend()],
];

describe.each(backends)('기록장 (%s)', (_, open) => {
  it('판 기록을 쌓으며 누적 수치를 고친다', async () => {
    const book = new RecordBook(spec, await open());
    expect(await book.stats()).toEqual({ games: 0, best: 0 });
    await book.record({ score: 40, board: [[2, 4]] }, times(1));
    const stats = await book.record({ score: 12, board: [[8]] }, times(2));
    expect(stats).toEqual({ games: 2, best: 40 });
    expect(await book.stats()).toEqual({ games: 2, best: 40 });
    expect(await book.playCount()).toBe(2);
  });

  it('판 기록은 최근 것부터 꺼내고, 복합 데이터를 그대로 돌려준다', async () => {
    const book = new RecordBook(spec, await open());
    for (let i = 1; i <= 5; i++) await book.record({ score: i, board: [[i, 0], [0, i * 2]] }, times(i));
    const recent = await book.plays(3);
    expect(recent.map((entry) => entry.play.score)).toEqual([5, 4, 3]);
    expect(recent[0].play.board).toEqual([[5, 0], [0, 10]]);
    expect(recent[0].startedAt).toBe(5000);
    expect(recent[0].endedAt).toBe(5500);
  });

  it('게임마다 기록을 따로 둔다', async () => {
    const backend = await open();
    const a = new RecordBook(spec, backend);
    const b = new RecordBook({ ...spec, game: 'other' }, backend);
    await a.record({ score: 9, board: [] }, times(1));
    expect(await b.stats()).toEqual({ games: 0, best: 0 });
    expect(await b.plays()).toEqual([]);
  });

  it('하다 만 판을 남기고 지운다', async () => {
    const book = new RecordBook(spec, await open());
    expect(await book.progress()).toBeUndefined();
    await book.saveProgress({ score: 7 });
    expect(await book.progress()).toEqual({ score: 7 });
    await book.clearProgress();
    expect(await book.progress()).toBeUndefined();
  });

  it('꺼낸 값을 바꿔도 저장된 값은 그대로다', async () => {
    const book = new RecordBook(spec, await open());
    await book.record({ score: 3, board: [[2]] }, times(1));
    const [entry] = await book.plays();
    entry.play.board[0][0] = 999;
    expect((await book.plays())[0].play.board).toEqual([[2]]);
  });

  it('누적 계산이 실패하면 판 기록도 남지 않는다', async () => {
    const book = new RecordBook(
      {
        ...spec,
        accumulate: () => {
          throw new Error('실패');
        },
      },
      await open(),
    );
    await expect(book.record({ score: 1, board: [] }, times(1))).rejects.toThrow();
    expect(await book.playCount()).toBe(0);
  });

  it('버전이 다른 값은 migrate가 없으면 쓰지 않는다', async () => {
    const backend = await open();
    await new RecordBook(spec, backend).record({ score: 50, board: [] }, times(1));
    const next = new RecordBook({ ...spec, version: 2 }, backend);
    expect(await next.stats()).toEqual({ games: 0, best: 0 });
    expect(await next.plays()).toEqual([]);
  });

  it('migrate로 옛 값을 옮기고 이상한 값은 버린다', async () => {
    const backend = await open();
    const old = new RecordBook(spec, backend);
    await old.record({ score: 50, board: [] }, times(1));
    await backend.put('progress', 'test', { version: 1, data: 'broken' });
    const next = new RecordBook<Stats, Play, Progress>(
      {
        ...spec,
        version: 2,
        migrate: (kind, version, data) => {
          if (kind === 'progress') return typeof data === 'object' ? data : undefined;
          return version <= 2 ? data : undefined;
        },
      },
      backend,
    );
    expect(await next.stats()).toEqual({ games: 1, best: 50 });
    expect(await next.plays()).toHaveLength(1);
    expect(await next.progress()).toBeUndefined();
  });
});

describe('IndexedDB 저장소', () => {
  it('다시 열어도 기록이 남는다', async () => {
    const factory = new IDBFactory();
    const first = new RecordBook(spec, await openIndexedDbBackend(factory));
    await first.record({ score: 21, board: [[2]] }, times(1));
    await first.saveProgress({ score: 4 });
    const again = new RecordBook(spec, await openIndexedDbBackend(factory));
    expect(again.lasting).toBe(true);
    expect(await again.stats()).toEqual({ games: 1, best: 21 });
    expect(await again.progress()).toEqual({ score: 4 });
  });

  it('동시에 여러 판을 쌓아도 누적 수치를 잃지 않는다', async () => {
    const book = new RecordBook(spec, await openIndexedDbBackend(new IDBFactory()));
    await Promise.all([1, 2, 3, 4].map((i) => book.record({ score: i, board: [] }, times(i))));
    expect(await book.stats()).toEqual({ games: 4, best: 4 });
  });
});
