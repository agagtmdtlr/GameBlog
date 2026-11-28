/**
 * 메인 페이지 컷에 넣는 콘텐츠. 원본은 `contents.json`이고, 여기서 모양을 검사해 쓰기 좋은 꼴로 바꾼다.
 * DOM 없이 계산하므로 테스트할 수 있다.
 *
 * ```json
 * { "title": "Game Blog", "contents": [{ "title": "...", "added": "2026-11-28", "preview": { ... }, "open": { ... } }] }
 * ```
 *
 * - 콘텐츠는 컷 id를 적지 않는다. 최근에 더한 것부터 컷 배치 순서(`a`, `b`, …)대로 채운다 (`placeContents`).
 * - `added`: 더한 날 (`YYYY-MM-DD`). 같은 날이면 목록에서 뒤에 있는 것을 더 최근으로 본다. 새 콘텐츠는 목록 끝에 더한다.
 * - `preview`: `{ "image": "<previews/의 파일>" }`, `{ "video": "<previews/의 파일>" }`(소리 없이 반복),
 *   `{ "youtube": "<영상 id>" }`(YouTube 썸네일) 중 하나
 * - `open`: `{ "scene": "<씬 id>" }`(이 사이트의 3D 씬으로 들어감), `{ "game": "<게임 id>" }`(이 사이트의 미니 게임),
 *   `{ "youtube": "<영상 id>" }`, `{ "url": "https://..." }`(새 탭) 중 하나
 * - `title`: 화면에 글로 쓰지 않고 스크린 리더와 마우스 툴팁에만 쓴다.
 */

export type CutPreview =
  | { readonly kind: 'image'; readonly file: string }
  | { readonly kind: 'video'; readonly file: string }
  | { readonly kind: 'youtube'; readonly videoId: string };

export type CutTarget =
  | { readonly kind: 'scene'; readonly sceneId: string }
  | { readonly kind: 'game'; readonly gameId: string }
  | { readonly kind: 'youtube'; readonly videoId: string }
  | { readonly kind: 'url'; readonly href: string };

export interface CutContent {
  readonly title: string;
  /** 더한 날 (`YYYY-MM-DD`) */
  readonly added: string;
  readonly preview: CutPreview;
  readonly open: CutTarget;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const FILE_NAME = /^[\w.-]+\.(png|jpe?g|webp|gif|svg|mp4|webm)$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 하나만 있는 키와 그 문자열 값. 아니면 오류 */
function onlyKey(value: unknown, where: string, keys: readonly string[]): [string, string] {
  if (!isRecord(value)) throw new Error(`${where}: 객체여야 합니다`);
  const entries = Object.entries(value);
  if (entries.length !== 1 || !keys.includes(entries[0][0]))
    throw new Error(`${where}: ${keys.join(', ')} 중 하나만 있어야 합니다`);
  const [key, text] = entries[0];
  if (typeof text !== 'string' || text === '') throw new Error(`${where}.${key}: 빈 문자열이 아닌 글이어야 합니다`);
  return [key, text];
}

function readPreview(value: unknown, where: string): CutPreview {
  const [key, text] = onlyKey(value, where, ['image', 'video', 'youtube']);
  if (key === 'youtube') {
    if (!YOUTUBE_ID.test(text)) throw new Error(`${where}.youtube: 11자 영상 id여야 합니다`);
    return { kind: 'youtube', videoId: text };
  }
  if (!FILE_NAME.test(text)) throw new Error(`${where}.${key}: previews/ 안의 그림·영상 파일 이름이어야 합니다`);
  return key === 'image' ? { kind: 'image', file: text } : { kind: 'video', file: text };
}

function readTarget(value: unknown, where: string): CutTarget {
  const [key, text] = onlyKey(value, where, ['scene', 'game', 'youtube', 'url']);
  if (key === 'scene') return { kind: 'scene', sceneId: text };
  if (key === 'game') return { kind: 'game', gameId: text };
  if (key === 'youtube') {
    if (!YOUTUBE_ID.test(text)) throw new Error(`${where}.youtube: 11자 영상 id여야 합니다`);
    return { kind: 'youtube', videoId: text };
  }
  if (!/^https:\/\//.test(text)) throw new Error(`${where}.url: https:// 주소여야 합니다`);
  return { kind: 'url', href: text };
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** `contents.json`의 콘텐츠 목록을 적힌 순서대로 읽는다. 모양이 틀리면 어디가 틀렸는지 알리는 오류를 던진다. */
export function loadContents(data: unknown): CutContent[] {
  if (!isRecord(data) || !Array.isArray(data.contents)) throw new Error('contents: { "contents": [ ... ] } 꼴이어야 합니다');
  return data.contents.map((entry: unknown, i) => {
    const where = `contents[${i}]`;
    if (!isRecord(entry)) throw new Error(`${where}: 객체여야 합니다`);
    if (typeof entry.title !== 'string' || entry.title.trim() === '') throw new Error(`${where}.title: 이름이 필요합니다`);
    if (typeof entry.added !== 'string' || !DATE.test(entry.added)) throw new Error(`${where}.added: YYYY-MM-DD 날짜여야 합니다`);
    return {
      title: entry.title,
      added: entry.added,
      preview: readPreview(entry.preview, `${where}.preview`),
      open: readTarget(entry.open, `${where}.open`),
    };
  });
}

/**
 * 콘텐츠를 최근에 더한 것부터 컷 순서대로 놓는다. 같은 날이면 목록에서 뒤에 있는 것이 먼저다.
 * 컷보다 콘텐츠가 많으면 오래된 것은 놓지 않는다 (테스트가 막는다).
 */
export function placeContents(contents: readonly CutContent[], cutIds: readonly string[]): Map<string, CutContent> {
  const newestFirst = contents
    .map((content, index) => ({ content, index }))
    .sort((a, b) => (a.content.added === b.content.added ? b.index - a.index : a.content.added < b.content.added ? 1 : -1))
    .map((entry) => entry.content);
  const placed = new Map<string, CutContent>();
  cutIds.forEach((id, i) => {
    if (i < newestFirst.length) placed.set(id, newestFirst[i]);
  });
  return placed;
}

/** `contents.json`을 읽어 컷 id마다의 콘텐츠로 놓는다. */
export function loadCutContents(data: unknown, cutIds: readonly string[]): Map<string, CutContent> {
  return placeContents(loadContents(data), cutIds);
}

/** `contents.json`의 `title`: 코믹 프레임 위 오림 글자 제목. 영어만 쓴다 (오림 글자가 영어만 지원). */
export function loadPageTitle(data: unknown): string {
  const title = isRecord(data) ? data.title : undefined;
  if (typeof title !== 'string' || !/^[A-Za-z0-9 .,!?&'\-:\n]+$/.test(title) || title.trim() === '')
    throw new Error("contents.title: 영어 글자, 숫자, 공백, 줄바꿈, . , ! ? & ' - : 로만 된 제목이어야 합니다");
  return title;
}

/**
 * 제목을 줄로 나누는 방법들. 한 줄과, 낱말이 둘 이상이면 글자 수가 가장 고르게 나뉘는 두 줄.
 * 제목에 줄바꿈이 있으면 그대로 하나만 쓴다. 화면에 따라 더 크게 들어가는 쪽을 고른다.
 */
export function titleLineOptions(title: string): string[] {
  if (title.includes('\n')) return [title];
  const words = title.trim().split(/\s+/);
  const options = [words.join(' ')];
  if (words.length < 2) return options;
  let best = '';
  let bestLength = Infinity;
  for (let i = 1; i < words.length; i++) {
    const top = words.slice(0, i).join(' ');
    const bottom = words.slice(i).join(' ');
    const longest = Math.max(top.length, bottom.length);
    if (longest < bestLength) {
      bestLength = longest;
      best = `${top}\n${bottom}`;
    }
  }
  return [...options, best];
}

/** 컷을 눌렀을 때 갈 주소와 새 탭으로 열지 여부 */
export function targetLink(target: CutTarget): { href: string; external: boolean } {
  switch (target.kind) {
    case 'scene':
      return { href: `?scene=${encodeURIComponent(target.sceneId)}`, external: false };
    case 'game':
      return { href: `?game=${encodeURIComponent(target.gameId)}`, external: false };
    case 'youtube':
      return { href: `https://www.youtube.com/watch?v=${target.videoId}`, external: true };
    case 'url':
      return { href: target.href, external: true };
  }
}

/**
 * YouTube 영상의 16:9 썸네일 주소. 큰 그림(`maxresdefault`)이 없는 영상이 있어 작은 그림(`mqdefault`)을 대신 쓴다.
 * `hqdefault`는 4:3 안에 검은 띠가 들어 있어 쓰지 않는다.
 */
export function youtubeThumbnails(videoId: string): { large: string; fallback: string } {
  const base = `https://i.ytimg.com/vi/${videoId}`;
  return { large: `${base}/maxresdefault.jpg`, fallback: `${base}/mqdefault.jpg` };
}
