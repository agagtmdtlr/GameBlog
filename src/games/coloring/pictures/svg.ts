/**
 * 색칠 그림을 SVG 글로 짓는 도우미. 좌표는 1000 × 1000 칸이다.
 *
 * - 모양은 흰 면에 검은 선으로 그린다. 뒤에서 앞 순서로 그리면 앞 모양이 뒤 모양을 가려 겹친 선이 생기지 않는다.
 * - 칠할 영역은 선으로 닫힌 흰 면이다. 눈동자처럼 칠하지 않을 곳은 검게 채운다 (`dot`, `inked`).
 * - 모양 안을 나누는 선은 `divided`로 그 모양 안에만 그린다.
 * - 아주 작은 흰 면은 놀이에서 선으로 합쳐지므로, 영역은 30 × 30칸 이상으로 그린다.
 */

export type Pt = readonly [number, number];

export const PICTURE_SIZE = 1000;
const LINE_WIDTH = 8;
const FRAME_INSET = 40;
const FRAME_WIDTH = 16;
const FRAME_RADIUS = 28;

const num = (value: number) => Number(value.toFixed(2));
const xy = ([x, y]: Pt) => `${num(x)},${num(y)}`;

type Attrs = Readonly<Record<string, string | number>>;
const attrText = (attrs: Attrs) =>
  Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${typeof value === 'number' ? num(value) : value}"`)
    .join('');

/** 흰 면과 검은 선으로 그리는 경로 */
export const path = (d: string, attrs: Attrs = {}) => `<path d="${d}"${attrText(attrs)}/>`;

/** 면 없이 선만 (입, 무늬) */
export const line = (d: string) => path(d, { fill: 'none' });

/** 검게 채운 모양 (코, 부리) */
export const inked = (d: string) => path(d, { fill: '#000' });

export const polygonD = (points: readonly Pt[]) => `M${points.map(xy).join(' L')} Z`;

export const ellipseD = (cx: number, cy: number, rx: number, ry: number, rotation = 0) => {
  const a = (rotation * Math.PI) / 180;
  const p = (t: number): Pt => [cx + rx * Math.cos(t) * Math.cos(a) - ry * Math.sin(t) * Math.sin(a), cy + rx * Math.cos(t) * Math.sin(a) + ry * Math.sin(t) * Math.cos(a)];
  const r = `${num(rx)} ${num(ry)} ${num(rotation)}`;
  return `M${xy(p(0))} A${r} 1 1 ${xy(p(Math.PI))} A${r} 1 1 ${xy(p(0))} Z`;
};

export const circleD = (cx: number, cy: number, r: number) => ellipseD(cx, cy, r, r);

/** 검은 점 (눈) */
export const dot = (cx: number, cy: number, r = 9) => inked(circleD(cx, cy, r));

/** 꼭짓점이 `n`개인 별 */
export function starPoints(cx: number, cy: number, outer: number, inner: number, n: number, rotation = -90): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rotation + (i * 180) / n) * Math.PI) / 180;
    points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return points;
}

/** 둘레가 동글동글 부푼 구름·덤불 모양 */
export function scallopD(cx: number, cy: number, rx: number, ry: number, bumps: number, start = 0): string {
  const points: Pt[] = [];
  for (let i = 0; i < bumps; i++) {
    const a = start + (i / bumps) * Math.PI * 2;
    points.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  let d = `M${xy(points[0])}`;
  for (let i = 0; i < bumps; i++) {
    const a = points[i];
    const b = points[(i + 1) % bumps];
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.62;
    d += ` A${num(r)} ${num(r)} 0 0 1 ${xy(b)}`;
  }
  return `${d} Z`;
}

/** 점들을 부드럽게 잇는 닫힌 곡선 (Catmull-Rom) */
export function blobD(points: readonly Pt[]): string {
  const n = points.length;
  const at = (i: number) => points[(i + n) % n];
  let d = `M${xy(points[0])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${xy(c1)} ${xy(c2)} ${xy(p2)}`;
  }
  return `${d} Z`;
}

/** 하트 */
export function heartD(cx: number, cy: number, size: number): string {
  const s = size / 2;
  return `M${xy([cx, cy + s])} C${xy([cx - s * 1.6, cy - s * 0.2])} ${xy([cx - s * 0.7, cy - s * 1.3])} ${xy([cx, cy - s * 0.45])} C${xy([cx + s * 0.7, cy - s * 1.3])} ${xy([cx + s * 1.6, cy - s * 0.2])} ${xy([cx, cy + s])} Z`;
}

let clipCount = 0;

/** 모양을 그리고, 그 안에만 `lines`로 나누는 선을 긋는다. 선은 모양 밖으로 뻗어도 잘린다. */
export function divided(d: string, lines: readonly string[]): string {
  const id = `cut${clipCount++}`;
  return [
    `<clipPath id="${id}"><path d="${d}"/></clipPath>`,
    path(d),
    `<g clip-path="url(#${id})" fill="none">${lines.map((l) => `<path d="${l}"/>`).join('')}</g>`,
    path(d, { fill: 'none' }),
  ].join('');
}

/** 액자 안에 그림 조각들을 넣은 SVG 문서. 액자 바깥은 투명하다. */
export function pictureSvg(parts: readonly string[]): string {
  const inner = PICTURE_SIZE - FRAME_INSET * 2;
  const frame = `x="${FRAME_INSET}" y="${FRAME_INSET}" width="${inner}" height="${inner}" rx="${FRAME_RADIUS}"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PICTURE_SIZE} ${PICTURE_SIZE}" width="${PICTURE_SIZE}" height="${PICTURE_SIZE}">`,
    `<clipPath id="frame"><rect ${frame}/></clipPath>`,
    `<g fill="#fff" stroke="#000" stroke-width="${LINE_WIDTH}" stroke-linejoin="round" stroke-linecap="round">`,
    `<g clip-path="url(#frame)"><rect ${frame}/>${parts.join('')}</g>`,
    `<rect ${frame} fill="none" stroke-width="${FRAME_WIDTH}"/>`,
    '</g></svg>',
  ].join('');
}
