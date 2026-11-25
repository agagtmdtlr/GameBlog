import { createMemoryBackend, openIndexedDbBackend, type SaveBackend, type Versioned } from './backend';

/** 게임 하나의 기록 모양과 쌓는 방법 */
export interface RecordSpec<Stats, Play> {
  /** 게임 id. 저장소의 열쇠로 쓴다. */
  readonly game: string;
  /** 기록 형식 버전. 모양을 바꾸면 올리고 `migrate`에 옛 모양을 옮기는 방법을 더한다. */
  readonly version: number;
  /** 아직 판 기록이 없을 때의 누적 수치 */
  emptyStats(): Stats;
  /** 끝난 판 하나를 누적 수치에 더한다. `stats`를 바꾸지 말고 새 값을 돌려준다. */
  accumulate(stats: Stats, play: Play, entry: PlayTimes): Stats;
  /**
   * 저장된 값을 지금 형식으로 옮기고 검사한다. 버전이 같아도 불린다.
   * 쓸 수 없는 값이면 `undefined`를 돌려준다 (누적 수치는 빈 값, 판 기록은 건너뜀, 하다 만 판은 없음).
   * 없으면 같은 버전의 값만 그대로 쓴다.
   */
  migrate?(kind: 'stats' | 'play' | 'progress', version: number, data: unknown): unknown;
}

/** 판이 언제 시작하고 끝났는지 (ms, `Date.now()`) */
export interface PlayTimes {
  readonly startedAt: number;
  readonly endedAt: number;
}

/** 꺼내 본 판 기록 */
export interface PlayEntry<Play> extends PlayTimes {
  readonly id: number;
  readonly play: Play;
}

/**
 * 게임 하나의 기록장. 판이 끝날 때마다 판 기록을 쌓고 누적 수치를 고친다. 하다 만 판도 하나 남긴다.
 * 저장은 이 기기의 브라우저에만 한다.
 */
export class RecordBook<Stats, Play, Progress> {
  constructor(
    private readonly spec: RecordSpec<Stats, Play>,
    private readonly backend: SaveBackend,
  ) {}

  /** 이번 방문이 끝나도 남는지 (IndexedDB를 쓸 수 없으면 `false`) */
  get lasting(): boolean {
    return this.backend.kind === 'indexeddb';
  }

  /** 누적 수치 */
  async stats(): Promise<Stats> {
    return this.readStats(await this.backend.get('stats', this.spec.game));
  }

  /** 끝난 판을 쌓고 고친 누적 수치를 돌려준다. */
  async record(play: Play, times: PlayTimes): Promise<Stats> {
    const value = await this.backend.addPlay(
      { game: this.spec.game, version: this.spec.version, ...times, data: play },
      (old) => this.wrap(this.spec.accumulate(this.readStats(old), play, times)),
    );
    return value.data as Stats;
  }

  /** 누적 수치를 직접 고친다 (옛 저장 방식에서 옮길 때 등). */
  async adjustStats(change: (stats: Stats) => Stats): Promise<Stats> {
    const value = await this.backend.updateStats(this.spec.game, (old) => this.wrap(change(this.readStats(old))));
    return value.data as Stats;
  }

  /** 판 기록. 최근 것부터 `limit`개. 쓸 수 없는 기록은 건너뛴다. */
  async plays(limit = 50): Promise<PlayEntry<Play>[]> {
    const rows = await this.backend.plays(this.spec.game, limit);
    const entries: PlayEntry<Play>[] = [];
    for (const row of rows) {
      const play = this.read('play', row);
      if (play !== undefined) entries.push({ id: row.id ?? 0, startedAt: row.startedAt, endedAt: row.endedAt, play: play as Play });
    }
    return entries;
  }

  /** 쌓인 판 기록 수 */
  playCount(): Promise<number> {
    return this.backend.countPlays(this.spec.game);
  }

  /** 하다 만 판. 없거나 쓸 수 없으면 `undefined` */
  async progress(): Promise<Progress | undefined> {
    return this.read('progress', await this.backend.get('progress', this.spec.game)) as Progress | undefined;
  }

  saveProgress(progress: Progress): Promise<void> {
    return this.backend.put('progress', this.spec.game, this.wrap(progress));
  }

  clearProgress(): Promise<void> {
    return this.backend.delete('progress', this.spec.game);
  }

  private wrap(data: unknown): Versioned {
    return { version: this.spec.version, data };
  }

  private readStats(value: Versioned | undefined): Stats {
    return (this.read('stats', value) as Stats | undefined) ?? this.spec.emptyStats();
  }

  private read(kind: 'stats' | 'play' | 'progress', value: Versioned | undefined): unknown {
    if (!value || typeof value !== 'object' || typeof value.version !== 'number') return undefined;
    if (this.spec.migrate) return this.spec.migrate(kind, value.version, value.data);
    return value.version === this.spec.version ? value.data : undefined;
  }
}

let shared: Promise<SaveBackend> | null = null;

/**
 * 모든 게임이 함께 쓰는 저장소. 처음 부를 때 연다.
 * 브라우저가 저장 공간이 모자랄 때 지우지 않도록 오래 남기기를 한 번 부탁한다.
 */
export function sharedBackend(): Promise<SaveBackend> {
  shared ??= (async () => {
    try {
      const backend = await openIndexedDbBackend();
      void navigator.storage?.persist?.().catch(() => false);
      return backend;
    } catch (error) {
      console.warn('기록을 이 기기에 남길 수 없어 이번 방문 동안만 기억합니다.', error);
      return createMemoryBackend();
    }
  })();
  return shared;
}

/** 게임의 기록장을 연다. */
export async function openRecordBook<Stats, Play, Progress>(
  spec: RecordSpec<Stats, Play>,
): Promise<RecordBook<Stats, Play, Progress>> {
  return new RecordBook(spec, await sharedBackend());
}
