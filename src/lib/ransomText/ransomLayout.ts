/**
 * 종이를 찢어 오린 글자를 이어 붙인 "오림 글자" 배치. DOM과 캔버스 없이 계산하므로 테스트할 수 있다.
 * 그리기는 `drawRansomText.ts`가 한다.
 *
 * - 영어만 지원한다: `A-Z a-z 0-9`와 공백, 문장 부호 `. , ! ? & ' - :`. 그 밖의 글자는 빼고 그린다.
 * - 같은 글과 같은 `seed`는 늘 같은 모양이 된다 (기본 `seed`는 글 자체).
 * - 글꼴은 내려받지 않고 시스템 글꼴 묶음(`RANSOM_FONTS`)을 쓴다. 없는 글꼴은 같은 계열의 기본 글꼴로 바뀐다.
 */

export type Point = readonly [x: number, y: number];

/** 지원하는 글자 (공백 포함) */
export const RANSOM_CHARSET = /[A-Za-z0-9 .,!?&'\-:]/;

/** 글자 하나의 잉크 크기. `ascent`, `descent`는 기준선 위·아래 길이 */
export interface GlyphMetrics {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
}

/** 글꼴 CSS(`font`)와 글자로 잉크 크기를 잰다. 캔버스에서는 `measureText`를 쓴다. */
export type MeasureGlyph = (char: string, font: string) => GlyphMetrics;

export interface RansomOptions {
  /** 기본 글자 크기 (px). 조각마다 0.82~1.14배로 바뀐다. 기본 64 */
  readonly letterSize?: number;
  /** 모양을 정하는 씨앗. 기본은 글 자체 */
  readonly seed?: string | number;
  /** 글자마다 대소문자를 섞는다. 기본 false (적은 그대로) */
  readonly mixCase?: boolean;
  /** 기울기 최대값 (라디안). 기본 0.13 */
  readonly tilt?: number;
  /** 줄 사이 (글자 크기 배수). 기본 1.35 */
  readonly lineHeight?: number;
}

export interface RansomPiece {
  readonly char: string;
  /** 조각 가운데 (배치 좌표) */
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  /** 회전 전 조각 크기 */
  readonly width: number;
  readonly height: number;
  /** 조각 가운데 기준 찢긴 바깥 테두리 (종이 속살이 보이는 흰 가장자리) */
  readonly torn: readonly Point[];
  /** 조각 가운데 기준 색 면 */
  readonly face: readonly Point[];
  readonly paper: string;
  readonly ink: string;
  /** 캔버스 `font` 값 */
  readonly font: string;
  /** 기준선의 y (조각 가운데 기준) */
  readonly baseline: number;
  /** 신문지처럼 옅은 줄 무늬를 깐다 */
  readonly newsprint: boolean;
  /** 종이 얼룩 점의 씨앗 */
  readonly grain: number;
}

export interface RansomLayout {
  /** 그림 전체 크기. 조각은 모두 (0,0)~(width,height) 안에 든다 */
  readonly width: number;
  readonly height: number;
  readonly pieces: readonly RansomPiece[];
  /** 실제로 그린 글 (지원하지 않는 글자를 뺀 뒤) */
  readonly text: string;
}

/** 시스템 글꼴 묶음. `{size}`를 글자 크기로 바꿔 쓴다. */
export const RANSOM_FONTS: readonly string[] = [
  '900 {size}px "Arial Black", "Helvetica Neue", Arial, sans-serif',
  'bold {size}px Georgia, "Times New Roman", serif',
  'italic bold {size}px Georgia, "Times New Roman", serif',
  'bold {size}px "Times New Roman", Times, serif',
  '{size}px Impact, Haettenschweiler, "Arial Narrow", sans-serif',
  'bold {size}px "Courier New", Courier, monospace',
  'bold {size}px "Trebuchet MS", Verdana, sans-serif',
  'italic {size}px "Palatino Linotype", Palatino, "Book Antiqua", serif',
  'bold {size}px Rockwell, "Roboto Slab", "Courier New", serif',
  'bold {size}px Verdana, Geneva, sans-serif',
];

/** 종이 색과 그 위에 어울리는 잉크 색들 */
export const RANSOM_PAPERS: readonly { readonly paper: string; readonly inks: readonly string[] }[] = [
  { paper: '#e8322b', inks: ['#ffffff', '#1a1a1a'] },
  { paper: '#f06fa5', inks: ['#1a1a1a', '#ffffff'] },
  { paper: '#f7931e', inks: ['#1a1a1a', '#ffffff'] },
  { paper: '#ffd400', inks: ['#1a1a1a', '#d7261e'] },
  { paper: '#8dc63f', inks: ['#1a1a1a', '#ffffff'] },
  { paper: '#19b5c9', inks: ['#1a1a1a', '#ffffff'] },
  { paper: '#1f6fd1', inks: ['#ffffff', '#ffd400'] },
  { paper: '#1b2a6b', inks: ['#ffffff'] },
  { paper: '#7b4fa0', inks: ['#ffffff', '#1a1a1a'] },
  { paper: '#1a1a1a', inks: ['#ffffff', '#ffd400', '#f06fa5'] },
  { paper: '#efe6d2', inks: ['#1a1a1a', '#d7261e', '#1b2a6b'] },
  { paper: '#e6e1d7', inks: ['#1a1a1a'] },
  { paper: '#c9a77c', inks: ['#1a1a1a'] },
  { paper: '#f8f6f1', inks: ['#1a1a1a', '#d7261e', '#1f6fd1'] },
];

/** 신문지 무늬를 깔 수 있는 밝은 종이 */
const NEWSPRINT_PAPERS = new Set(['#efe6d2', '#e6e1d7', '#f8f6f1']);

/** 결과가 늘 같은 32비트 난수 (mulberry32) */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 지원하지 않는 글자를 빼고, 공백을 하나로 줄인다. 줄바꿈(`\n`)은 남긴다. */
export function normalizeRansomText(text: string): string {
  return text
    .split('\n')
    .map((line) => [...line].filter((c) => RANSOM_CHARSET.test(c)).join('').replace(/ +/g, ' ').trim())
    .join('\n');
}

/**
 * 직사각형 둘레를 따라 찢긴 테두리를 만든다. 모서리를 조금씩 비틀고, 변을 따라 `step` 간격으로 안팎으로 흔든다.
 * `inset`만큼 안쪽에서 시작한다 (변마다 0~`inset` 사이로 다르게).
 */
export function tornOutline(
  width: number,
  height: number,
  random: () => number,
  { step, jitter, inset }: { step: number; jitter: number; inset: number },
): Point[] {
  const hw = width / 2;
  const hh = height / 2;
  const edgeInset = [0, 1, 2, 3].map(() => inset * (0.3 + random() * 0.7));
  const skew = () => (random() - 0.5) * jitter * 3;
  const corners: Point[] = [
    [-hw + edgeInset[3] + skew(), -hh + edgeInset[0] + skew()],
    [hw - edgeInset[1] + skew(), -hh + edgeInset[0] + skew()],
    [hw - edgeInset[1] + skew(), hh - edgeInset[2] + skew()],
    [-hw + edgeInset[3] + skew(), hh - edgeInset[2] + skew()],
  ];
  const points: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % 4];
    const length = Math.hypot(x1 - x0, y1 - y0);
    const count = Math.max(2, Math.round(length / step));
    // 바깥을 향하는 법선 (시계 방향 둘레, y 아래)
    const nx = (y1 - y0) / length;
    const ny = -(x1 - x0) / length;
    for (let k = 0; k < count; k++) {
      const t = k / count;
      const wobble = k === 0 ? 0 : (random() - 0.5) * 2 * jitter;
      points.push([x0 + (x1 - x0) * t - nx * wobble, y0 + (y1 - y0) * t - ny * wobble]);
    }
  }
  return points;
}

const rotate = ([x, y]: Point, angle: number): Point => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
];

/** 글을 오림 글자 조각으로 배치한다. 줄은 가운데 정렬이다. */
export function layoutRansomText(text: string, measure: MeasureGlyph, options: RansomOptions = {}): RansomLayout {
  const clean = normalizeRansomText(text);
  const size = options.letterSize ?? 64;
  const tilt = options.tilt ?? 0.13;
  const lineHeight = (options.lineHeight ?? 1.35) * size;
  const random = createRandom(hashSeed(options.seed ?? clean));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

  const lines: { pieces: RansomPiece[]; width: number }[] = [];
  for (const line of clean.split('\n')) {
    const pieces: RansomPiece[] = [];
    let cursor = 0;
    for (const raw of line) {
      if (raw === ' ') {
        cursor += size * (0.24 + random() * 0.1);
        continue;
      }
      const char = options.mixCase && random() < 0.4 ? flipCase(raw) : raw;
      const fontSize = size * (0.82 + random() * 0.32);
      const font = pick(RANSOM_FONTS).replace('{size}', fontSize.toFixed(1));
      const glyph = measure(char, font);
      const padX = fontSize * (0.1 + random() * 0.16);
      const padY = fontSize * (0.08 + random() * 0.14);
      const inkHeight = Math.max(glyph.ascent + glyph.descent, fontSize * 0.5);
      // 소문자·문장 부호도 엄지손톱만 한 조각이 되도록 최소 크기를 둔다.
      const width = Math.max(glyph.width + padX * 2, fontSize * (0.62 + random() * 0.18));
      const height = Math.max(inkHeight + padY * 2, fontSize * (0.82 + random() * 0.2));
      const { paper, inks } = pick(RANSOM_PAPERS);
      const rotation = (random() * 2 - 1) * tilt;
      const tear = Math.max(1, size * 0.03);
      const torn = tornOutline(width, height, random, { step: tear * 1.6, jitter: tear * 0.7, inset: 0 });
      const face = tornOutline(width, height, random, { step: tear * 2.2, jitter: tear * 0.5, inset: tear * 1.6 });
      // 조각끼리 살짝 겹치거나 붙는다.
      const gap = size * (random() * 0.06 - 0.05);
      pieces.push({
        char,
        x: cursor + width / 2,
        y: (random() - 0.5) * size * 0.16,
        rotation,
        width,
        height,
        torn,
        face,
        paper,
        ink: pick(inks),
        font,
        // 잉크 상자를 조각 가운데에 둔다.
        baseline: (glyph.ascent - glyph.descent) / 2,
        newsprint: NEWSPRINT_PAPERS.has(paper) && random() < 0.6,
        grain: Math.floor(random() * 2 ** 31),
      });
      cursor += width + gap;
    }
    lines.push({ pieces, width: Math.max(cursor, 0) });
  }

  // 줄마다 가운데 정렬하고 세로로 쌓은 뒤, 회전한 조각까지 감싸는 상자로 옮긴다.
  const maxWidth = Math.max(0, ...lines.map((l) => l.width));
  const placed = lines.flatMap((line, row) =>
    line.pieces.map((p) => ({ ...p, x: p.x + (maxWidth - line.width) / 2, y: p.y + row * lineHeight })),
  );
  if (placed.length === 0) return { width: 0, height: 0, pieces: [], text: clean };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placed) {
    for (const point of p.torn) {
      const [rx, ry] = rotate(point, p.rotation);
      minX = Math.min(minX, p.x + rx);
      maxX = Math.max(maxX, p.x + rx);
      minY = Math.min(minY, p.y + ry);
      maxY = Math.max(maxY, p.y + ry);
    }
  }
  // 그림자 자리
  const pad = size * 0.08;
  return {
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    pieces: placed.map((p) => ({ ...p, x: p.x - minX + pad, y: p.y - minY + pad })),
    text: clean,
  };
}

function flipCase(char: string): string {
  const upper = char.toUpperCase();
  return char === upper ? char.toLowerCase() : upper;
}
