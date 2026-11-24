/**
 * 메인 페이지 컷에 넣는 콘텐츠. 원본은 `contents.json`이고, 여기서 모양을 검사해 쓰기 좋은 꼴로 바꾼다.
 * DOM 없이 계산하므로 테스트할 수 있다.
 *
 * ```json
 * { "cuts": { "<컷 id>": { "title": "...", "preview": { ... }, "open": { ... } } } }
 * ```
 *
 * - `preview`: `{ "image": "<previews/의 파일>" }`, `{ "video": "<previews/의 파일>" }`(소리 없이 반복),
 *   `{ "youtube": "<영상 id>" }`(YouTube 썸네일) 중 하나
 * - `open`: `{ "scene": "<씬 id>" }`(이 사이트의 씬으로 들어감), `{ "youtube": "<영상 id>" }`, `{ "url": "https://..." }`(새 탭) 중 하나
 * - `title`: 화면에 글로 쓰지 않고 스크린 리더와 마우스 툴팁에만 쓴다.
 */

export type CutPreview =
  | { readonly kind: 'image'; readonly file: string }
  | { readonly kind: 'video'; readonly file: string }
  | { readonly kind: 'youtube'; readonly videoId: string };

export type CutTarget =
  | { readonly kind: 'scene'; readonly sceneId: string }
  | { readonly kind: 'youtube'; readonly videoId: string }
  | { readonly kind: 'url'; readonly href: string };

export interface CutContent {
  readonly title: string;
  readonly preview: CutPreview;
  readonly open: CutTarget;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const FILE_NAME = /^[\w.-]+\.(png|jpe?g|webp|gif|mp4|webm)$/i;

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
  const [key, text] = onlyKey(value, where, ['scene', 'youtube', 'url']);
  if (key === 'scene') return { kind: 'scene', sceneId: text };
  if (key === 'youtube') {
    if (!YOUTUBE_ID.test(text)) throw new Error(`${where}.youtube: 11자 영상 id여야 합니다`);
    return { kind: 'youtube', videoId: text };
  }
  if (!/^https:\/\//.test(text)) throw new Error(`${where}.url: https:// 주소여야 합니다`);
  return { kind: 'url', href: text };
}

/** `contents.json`을 읽는다. 모양이 틀리면 어디가 틀렸는지 알리는 오류를 던진다. */
export function loadCutContents(data: unknown): Map<string, CutContent> {
  if (!isRecord(data) || !isRecord(data.cuts)) throw new Error('contents: { "cuts": { ... } } 꼴이어야 합니다');
  const contents = new Map<string, CutContent>();
  for (const [id, entry] of Object.entries(data.cuts)) {
    const where = `cuts.${id}`;
    if (!isRecord(entry)) throw new Error(`${where}: 객체여야 합니다`);
    if (typeof entry.title !== 'string' || entry.title.trim() === '') throw new Error(`${where}.title: 이름이 필요합니다`);
    contents.set(id, {
      title: entry.title,
      preview: readPreview(entry.preview, `${where}.preview`),
      open: readTarget(entry.open, `${where}.open`),
    });
  }
  return contents;
}

/** 컷을 눌렀을 때 갈 주소와 새 탭으로 열지 여부 */
export function targetLink(target: CutTarget): { href: string; external: boolean } {
  switch (target.kind) {
    case 'scene':
      return { href: `?scene=${encodeURIComponent(target.sceneId)}`, external: false };
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
