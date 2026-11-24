/**
 * 선 그림을 칠할 수 있는 영역으로 나눈다. DOM 없이 픽셀 배열만 다루므로 테스트할 수 있다.
 *
 * 1. 선이 아닌 픽셀을 4방향으로 이어 덩어리를 만든다.
 * 2. 그림 가장자리에 닿은 덩어리(액자 바깥)는 칠할 수 없는 곳(0)이 된다.
 * 3. `minArea`보다 작은 덩어리(선이 겹쳐 생긴 틈)는 선으로 합친다.
 * 4. 남은 덩어리에 1부터 번호를 매기고, 선 너머로 맞닿은 이웃을 찾는다.
 * 5. 선 픽셀에 가장 가까운 영역 번호를 채운다. 선 위를 눌러도 가까운 영역이 칠해지고, 선 아래 바탕색도 정해진다.
 */

export interface RegionInfo {
  /** 선을 채우기 전 픽셀 수 */
  readonly area: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** 선 너머로 맞닿은 영역 번호 */
  readonly neighbors: readonly number[];
}

export interface RegionMap {
  readonly width: number;
  readonly height: number;
  /** 픽셀마다 영역 번호(1부터). 0은 칠할 수 없는 곳(액자 바깥). 선 픽셀은 가장 가까운 영역 번호 */
  readonly labels: Uint16Array;
  /** 선 픽셀이면 1 (선으로 합친 작은 틈 포함) */
  readonly ink: Uint8Array;
  /** `regions[n - 1]`이 영역 n */
  readonly regions: readonly RegionInfo[];
}

export interface LabelOptions {
  /** 이보다 작은 덩어리는 선으로 합친다 (픽셀 수) */
  readonly minArea: number;
  /** 이웃을 찾을 때 건너보는 거리 (픽셀). 선 굵기보다 조금 크게 */
  readonly neighborReach: number;
}

/** 칠할 수 있는 영역 번호의 최대값 (텍스처에 16비트로 넣는다) */
export const MAX_REGIONS = 65535;

const OUTSIDE = -1;

export function labelRegions(inkMask: Uint8Array, width: number, height: number, options: LabelOptions): RegionMap {
  const total = width * height;
  if (inkMask.length !== total) throw new Error('선 마스크 크기가 그림 크기와 다릅니다');
  const ink = Uint8Array.from(inkMask);
  // 덩어리 번호 (0: 아직, -1: 바깥, 그 밖: 임시 번호)
  const component = new Int32Array(total);
  const queue = new Int32Array(total);
  interface Blob {
    area: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    border: boolean;
    seed: number;
  }
  const blobs: Blob[] = [];

  for (let start = 0; start < total; start++) {
    if (ink[start] || component[start] !== 0) continue;
    const id = blobs.length + 1;
    const blob: Blob = { area: 0, minX: width, minY: height, maxX: -1, maxY: -1, border: false, seed: start };
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    component[start] = id;
    while (head < tail) {
      const p = queue[head++];
      const x = p % width;
      const y = (p - x) / width;
      blob.area++;
      if (x < blob.minX) blob.minX = x;
      if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y;
      if (y > blob.maxY) blob.maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) blob.border = true;
      if (x > 0 && !ink[p - 1] && component[p - 1] === 0) (component[p - 1] = id), (queue[tail++] = p - 1);
      if (x < width - 1 && !ink[p + 1] && component[p + 1] === 0) (component[p + 1] = id), (queue[tail++] = p + 1);
      if (y > 0 && !ink[p - width] && component[p - width] === 0) (component[p - width] = id), (queue[tail++] = p - width);
      if (y < height - 1 && !ink[p + width] && component[p + width] === 0)
        (component[p + width] = id), (queue[tail++] = p + width);
    }
    blobs.push(blob);
  }

  // 임시 번호 → 최종 번호 (0: 선으로 합침, -1: 바깥)
  const finalId = new Int32Array(blobs.length + 1);
  const kept: Blob[] = [];
  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    if (blob.border) finalId[i + 1] = OUTSIDE;
    else if (blob.area < options.minArea) finalId[i + 1] = 0;
    else {
      kept.push(blob);
      finalId[i + 1] = kept.length;
    }
  }
  if (kept.length > MAX_REGIONS) throw new Error(`영역이 너무 많습니다: ${kept.length}`);

  const labels = new Uint16Array(total);
  const outside = new Uint8Array(total);
  for (let p = 0; p < total; p++) {
    const c = component[p];
    if (c === 0) continue;
    const id = finalId[c];
    if (id === OUTSIDE) outside[p] = 1;
    else if (id === 0) ink[p] = 1;
    else labels[p] = id;
  }

  // 선 너머 이웃: 가로·세로로 `reach`만큼 건너 본 픽셀이 다른 영역이면 맞닿았다고 본다.
  const neighborSets = kept.map(() => new Set<number>());
  const reach = Math.max(1, Math.round(options.neighborReach));
  const link = (a: number, b: number) => {
    if (a === 0 || b === 0 || a === b) return;
    neighborSets[a - 1].add(b);
    neighborSets[b - 1].add(a);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = labels[y * width + x];
      if (a === 0) continue;
      if (x + reach < width) link(a, labels[y * width + x + reach]);
      if (y + reach < height) link(a, labels[(y + reach) * width + x]);
    }
  }

  // 선 픽셀에 가까운 영역 번호를 번져 채운다 (여러 출발점 너비 우선 탐색).
  let head = 0;
  let tail = 0;
  for (let p = 0; p < total; p++) if (labels[p] !== 0) queue[tail++] = p;
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const id = labels[p];
    const spread = (q: number) => {
      if (labels[q] === 0 && ink[q] && !outside[q]) {
        labels[q] = id;
        queue[tail++] = q;
      }
    };
    if (x > 0) spread(p - 1);
    if (x < width - 1) spread(p + 1);
    if (p >= width) spread(p - width);
    if (p < total - width) spread(p + width);
  }

  return {
    width,
    height,
    labels,
    ink,
    regions: kept.map((blob, i) => ({
      area: blob.area,
      minX: blob.minX,
      minY: blob.minY,
      maxX: blob.maxX,
      maxY: blob.maxY,
      neighbors: [...neighborSets[i]].sort((a, b) => a - b),
    })),
  };
}

/** 픽셀 좌표의 영역 번호. 그림 밖이나 액자 바깥이면 0 */
export function regionAt(map: RegionMap, x: number, y: number): number {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= map.width || py >= map.height) return 0;
  return map.labels[py * map.width + px];
}
