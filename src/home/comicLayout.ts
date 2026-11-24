/**
 * 메인 페이지 코믹 프레임의 컷 배치. DOM 없이 계산하므로 테스트할 수 있다.
 *
 * 컷 모양은 틈 없이 맞닿은 볼록 다각형으로 적고(`ComicLayout.cuts`), 컷 사이 여백(`gutter`)은
 * 각 컷을 안쪽으로 `gutter / 2`씩 줄여서 만든다. 그래서 컷을 옮기거나 나눌 때 맞닿은 꼭짓점만 맞추면 된다.
 */

export type Point = readonly [x: number, y: number];

export interface ComicCutShape {
  /** 콘텐츠 파일(`contents.json`)에서 이 컷을 가리키는 이름 */
  readonly id: string;
  /** 페이지 안쪽 영역(0..width, 0..height) 좌표의 볼록 다각형. 이웃 컷과 변을 함께 쓴다 */
  readonly points: readonly Point[];
}

export interface ComicLayout {
  /** 컷이 놓이는 안쪽 영역의 크기 (임의 단위) */
  readonly width: number;
  readonly height: number;
  /** 종이 가장자리와 컷 영역 사이 여백 */
  readonly margin: number;
  /** 컷 사이 여백 */
  readonly gutter: number;
  /** 컷 영역 위에 두는 제목 띠의 높이 */
  readonly header: number;
  readonly cuts: readonly ComicCutShape[];
}

/**
 * 기본 페이지: 세 줄, 컷 여덟 개 (2026-11-24 사용자가 보여 준 코믹 프레임 그림).
 *
 * ```
 * ┌──────────┬────┐  a b
 * ├───────┬──┴────┤  c d   가운데 줄은 기울어진 선 셋으로 네 컷
 * │      ╱ ╲      │  e f
 * ├──────────┬────┤  g h
 * └──────────┴────┘
 * ```
 */
export const COMIC_LAYOUT: ComicLayout = {
  width: 100,
  height: 150,
  margin: 3,
  gutter: 2,
  header: 20,
  cuts: [
    { id: 'a', points: [[0, 0], [66, 0], [66, 44], [0, 44]] },
    { id: 'b', points: [[66, 0], [100, 0], [100, 44], [66, 44]] },
    // 가운데 줄을 가로지르는 긴 사선 (0, 60) → (100, 94) 위에 (25, 68.5), (50, 77)이 놓인다.
    { id: 'c', points: [[0, 44], [56, 44], [50, 77], [0, 60]] },
    { id: 'd', points: [[56, 44], [100, 44], [100, 94], [50, 77]] },
    { id: 'e', points: [[0, 60], [25, 68.5], [48, 112], [0, 112]] },
    { id: 'f', points: [[25, 68.5], [100, 94], [100, 112], [48, 112]] },
    { id: 'g', points: [[0, 112], [64, 112], [67.4, 150], [0, 150]] },
    { id: 'h', points: [[64, 112], [100, 112], [100, 150], [67.4, 150]] },
  ],
};

export interface PlacedCut {
  readonly id: string;
  /** 종이 전체(여백 포함) 좌표의 컷 다각형. 여백만큼 줄인 뒤다 */
  readonly points: readonly Point[];
  /** `points`를 감싸는 상자 */
  readonly box: Box;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacedPage {
  readonly width: number;
  readonly height: number;
  /** 컷 영역 위의 제목 자리 (종이 좌표) */
  readonly header: Box;
  readonly cuts: readonly PlacedCut[];
}

/** 다각형의 부호 있는 넓이. y가 아래로 커지는 화면 좌표에서 시계 방향이면 양수 */
export function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

/** 모든 꼭짓점에서 같은 방향으로 꺾이면 볼록하다 */
export function isConvex(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % n];
    const [cx, cy] = points[(i + 2) % n];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return sign !== 0;
}

/** 볼록 다각형의 각 변을 안쪽으로 `distance`만큼 밀고, 이웃한 변끼리 만나는 점을 새 꼭짓점으로 삼는다. */
export function insetPolygon(points: readonly Point[], distance: number): Point[] {
  const n = points.length;
  const orientation = Math.sign(signedArea(points));
  // 변마다 안쪽을 향하는 단위 법선과 민 직선 위의 한 점
  const lines = points.map(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % n];
    const length = Math.hypot(x1 - x0, y1 - y0);
    const nx = (-(y1 - y0) / length) * orientation;
    const ny = ((x1 - x0) / length) * orientation;
    return { px: x0 + nx * distance, py: y0 + ny * distance, dx: x1 - x0, dy: y1 - y0 };
  });
  return lines.map((line, i) => {
    const prev = lines[(i - 1 + n) % n];
    const denominator = prev.dx * line.dy - prev.dy * line.dx;
    const t = ((line.px - prev.px) * line.dy - (line.py - prev.py) * line.dx) / denominator;
    return [prev.px + prev.dx * t, prev.py + prev.dy * t] as Point;
  });
}

/** 늘이지 않은 종이의 가로/세로 비율 */
export function naturalAspect(layout: ComicLayout): number {
  return (layout.width + layout.margin * 2) / (layout.height + layout.header + layout.margin * 2);
}

/** 화면이 종이보다 세로로 길 때 종이를 늘이는 한계 (가로/세로) */
export const MIN_PAGE_ASPECT = 0.42;

/** 늘인 세로 길이 가운데 제목 띠가 가져가는 몫. 나머지는 컷 영역이 가져간다 */
export const HEADER_SHARE = 0.15;

/**
 * 배치를 종이 좌표로 옮기고 컷 사이 여백을 낸다. 컷 영역은 바깥 여백과 제목 띠 아래에 놓인다.
 *
 * `aspect`(가로/세로)를 주면 종이를 그 비율에 맞춰 세로로 늘인다 (휴대폰처럼 세로로 긴 화면을 채우려고).
 * 늘인 길이는 제목 띠와 컷 영역이 `HEADER_SHARE`로 나누고, 컷은 세로로 늘인 뒤에 여백을 내므로 여백 두께는 그대로다.
 * 원래 비율보다 넓은 비율은 무시하고, `MIN_PAGE_ASPECT`보다 좁게는 늘이지 않는다.
 */
export function placeCuts(layout: ComicLayout, aspect = naturalAspect(layout)): PlacedPage {
  const width = layout.width + layout.margin * 2;
  const target = Math.min(Math.max(aspect, MIN_PAGE_ASPECT), naturalAspect(layout));
  const extra = width / target - width / naturalAspect(layout);
  const headerHeight = layout.header + extra * HEADER_SHARE;
  const cutsHeight = layout.height + extra * (1 - HEADER_SHARE);
  const stretch = cutsHeight / layout.height;
  const top = layout.margin + headerHeight;
  const cuts = layout.cuts.map((cut) => {
    const shifted = cut.points.map(([x, y]) => [x + layout.margin, y * stretch + top] as Point);
    const points = insetPolygon(shifted, layout.gutter / 2);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { id: cut.id, points, box: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y } };
  });
  const header = { x: layout.margin, y: layout.margin, width: layout.width, height: headerHeight };
  return { width, height: top + cutsHeight + layout.margin, header, cuts };
}
