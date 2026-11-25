/**
 * 기록을 실제로 담는 곳. 브라우저의 IndexedDB를 쓰고, 쓸 수 없으면 이번 방문 동안만 메모리에 담는다.
 * 서버로 보내지 않는다 (2026-11-25 사용자 결정, 서버 연동 보류).
 */

/** 형식 버전을 붙인 값 */
export interface Versioned {
  readonly version: number;
  readonly data: unknown;
}

/** 저장된 판 기록 한 줄 */
export interface StoredPlay extends Versioned {
  /** 저장소가 붙이는 번호. 늘어나기만 한다. */
  readonly id?: number;
  readonly game: string;
  /** 판을 시작한 시각 (ms, `Date.now()`) */
  readonly startedAt: number;
  /** 판이 끝난 시각 (ms, `Date.now()`) */
  readonly endedAt: number;
}

/** 게임마다 하나씩 두는 값의 저장소: 누적 수치(`stats`), 하다 만 판(`progress`) */
export type SlotStore = 'stats' | 'progress';

export interface SaveBackend {
  /** `memory`면 이번 방문이 끝나면 사라진다. */
  readonly kind: 'indexeddb' | 'memory';
  get(store: SlotStore, game: string): Promise<Versioned | undefined>;
  put(store: SlotStore, game: string, value: Versioned): Promise<void>;
  delete(store: SlotStore, game: string): Promise<void>;
  /** `stats` 값을 읽고 바꿔 쓴다. 한 거래 안에서 해서 겹쳐 써도 잃지 않는다. */
  updateStats(game: string, next: (old: Versioned | undefined) => Versioned): Promise<Versioned>;
  /** 판 기록을 더하고 `stats`를 같은 거래에서 고친다. 둘 다 되거나 둘 다 안 된다. */
  addPlay(play: StoredPlay, next: (old: Versioned | undefined) => Versioned): Promise<Versioned>;
  /** 게임의 판 기록. 최근 것부터 `limit`개 */
  plays(game: string, limit: number): Promise<StoredPlay[]>;
  /** 게임의 판 기록 수 */
  countPlays(game: string): Promise<number>;
}

export const DB_NAME = 'gameblog';
const DB_VERSION = 1;

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('저장 거래가 취소되었습니다'));
  });

/** IndexedDB 저장소를 연다. 테스트는 `factory`로 가짜를 넘긴다. */
export async function openIndexedDbBackend(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<SaveBackend> {
  const open = factory.open(name, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    // 버전 1: 처음 만든 구조. 바꿀 때는 버전을 올리고 옛 구조에서 옮기는 단계를 더한다.
    if (!db.objectStoreNames.contains('stats')) db.createObjectStore('stats');
    if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress');
    if (!db.objectStoreNames.contains('plays')) {
      const plays = db.createObjectStore('plays', { keyPath: 'id', autoIncrement: true });
      plays.createIndex('game', 'game');
    }
  };
  const db = await request(open);
  // 다른 탭이 새 버전으로 열려고 하면 비켜 준다.
  db.onversionchange = () => db.close();

  const slot = async <T>(store: SlotStore, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) => {
    const tx = db.transaction(store, mode);
    const [result] = await Promise.all([request(run(tx.objectStore(store))), done(tx)]);
    return result;
  };

  /** 거래 안에서 `stats`를 읽고 `next`로 바꿔 쓴다. */
  const rewriteStats = (stats: IDBObjectStore, game: string, next: (old: Versioned | undefined) => Versioned) =>
    new Promise<Versioned>((resolve, reject) => {
      const read = stats.get(game);
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        try {
          const value = next(read.result as Versioned | undefined);
          stats.put(value, game);
          resolve(value);
        } catch (error) {
          reject(error);
          stats.transaction.abort();
        }
      };
    });

  return {
    kind: 'indexeddb',
    get: (store, game) => slot(store, 'readonly', (s) => s.get(game) as IDBRequest<Versioned | undefined>),
    put: async (store, game, value) => {
      await slot(store, 'readwrite', (s) => s.put(value, game));
    },
    delete: async (store, game) => {
      await slot(store, 'readwrite', (s) => s.delete(game));
    },
    async updateStats(game, next) {
      const tx = db.transaction('stats', 'readwrite');
      const [value] = await Promise.all([rewriteStats(tx.objectStore('stats'), game, next), done(tx)]);
      return value;
    },
    async addPlay(play, next) {
      const tx = db.transaction(['plays', 'stats'], 'readwrite');
      const { id: _, ...row } = play;
      tx.objectStore('plays').add(row);
      const [value] = await Promise.all([rewriteStats(tx.objectStore('stats'), play.game, next), done(tx)]);
      return value;
    },
    async plays(game, limit) {
      const tx = db.transaction('plays', 'readonly');
      const index = tx.objectStore('plays').index('game');
      const rows: StoredPlay[] = [];
      await new Promise<void>((resolve, reject) => {
        // 번호가 늘어나기만 하므로 뒤에서부터 읽으면 최근 것부터다.
        const cursor = index.openCursor(game, 'prev');
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const at = cursor.result;
          if (!at || rows.length >= limit) return resolve();
          rows.push(at.value as StoredPlay);
          at.continue();
        };
      });
      await done(tx);
      return rows;
    },
    countPlays: (game) => {
      const tx = db.transaction('plays', 'readonly');
      return request(tx.objectStore('plays').index('game').count(game));
    },
  };
}

/** IndexedDB를 쓸 수 없을 때 쓰는 메모리 저장소. 이번 방문이 끝나면 사라진다. */
export function createMemoryBackend(): SaveBackend {
  const slots = { stats: new Map<string, Versioned>(), progress: new Map<string, Versioned>() };
  const rows: StoredPlay[] = [];
  let nextId = 1;
  // 저장소에서 꺼낸 값을 바꿔도 저장된 값이 바뀌지 않게 복사한다 (IndexedDB와 같게).
  const copy = <T>(value: T): T => structuredClone(value);
  const rewrite = (game: string, next: (old: Versioned | undefined) => Versioned) => {
    const value = copy(next(copy(slots.stats.get(game))));
    slots.stats.set(game, value);
    return copy(value);
  };
  return {
    kind: 'memory',
    get: async (store, game) => copy(slots[store].get(game)),
    put: async (store, game, value) => {
      slots[store].set(game, copy(value));
    },
    delete: async (store, game) => {
      slots[store].delete(game);
    },
    updateStats: async (game, next) => rewrite(game, next),
    async addPlay(play, next) {
      const value = rewrite(play.game, next);
      rows.push(copy({ ...play, id: nextId++ }));
      return value;
    },
    plays: async (game, limit) =>
      copy(
        rows
          .filter((row) => row.game === game)
          .reverse()
          .slice(0, limit),
      ),
    countPlays: async (game) => rows.filter((row) => row.game === game).length,
  };
}
