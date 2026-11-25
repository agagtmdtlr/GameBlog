import { dot, type Vec3 } from '../../../engine/math';
import { PLANET } from '../planet';
import { BARE_SPOTS, DREAM_PROPS, terrainHeight } from './terrain';

/**
 * 행성을 덮는 잔디밭. 잔디 포기마다 뿌리 자리와 모양 값만 정하고, 휘는 모양은 셰이더가 바람으로 계산한다.
 * 행성을 위도 띠와 경도 칸으로 나눈 셀마다 잔디를 이어 담아, 카메라 둘레의 셀만 골라 그릴 수 있게 한다.
 * GPU 없이 고정 시드로 만들므로 매번 같은 잔디밭이다.
 */
export const GRASS_FIELD = {
  /** 제곱 단위당 잔디 포기 수 */
  density: 64,
  /** 잔디 높이 범위. `tallChance`의 비율은 `tallHeight`로 길게 자란다. */
  height: [0.3, 0.72] as const,
  tallChance: 0.07,
  tallHeight: [0.85, 1.2] as const,
  /** 잎 밑동의 폭 */
  width: [0.05, 0.085] as const,
  /** 선로·표면 객체의 평평한 곳 안쪽 경계에서 잔디가 나기 시작하는 거리와 다 자라는 거리 */
  bareEdge: [-0.6, 1.4] as const,
  /** 지형물 바닥 반지름에 곱하는 잔디 없는 범위 */
  propClear: 0.92,
  /** 셀 한 변의 대략적인 길이 (표면 거리) */
  cellSize: 3,
  /** 뿌리를 땅에 묻는 깊이. 땅 메시는 정점 사이를 곧게 이으므로 뿌리가 뜨지 않게 한다. */
  sink: 0.06,
  seed: 20261125,
};

/** 잔디 한 포기의 값 수: 뿌리 x, y, z, 방향각, 높이, 폭, 고유값(0~1) */
export const BLADE_STRIDE = 7;

export interface GrassCell {
  /** 셀 가운데의 방향 (단위 벡터) */
  center: Vec3;
  /** 가운데에서 가장 먼 모서리까지의 표면 거리 */
  radius: number;
  /** `blades`에서 이 셀의 첫 포기 번호와 포기 수 */
  start: number;
  count: number;
}

export interface GrassField {
  /** 포기마다 `BLADE_STRIDE`개씩 이어 담은 값. 셀 순서대로 놓인다. */
  blades: Float32Array;
  count: number;
  cells: GrassCell[];
}

/** 고정 시드 난수 (mulberry32). 0 이상 1 미만을 돌려준다. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const R = PLANET.radius;

/** 두 단위 방향 사이의 표면 거리 (반지름 `R` 구 위의 호 길이) */
const surfaceDistance = (a: Vec3, b: Vec3): number => R * Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** 잔디를 막는 원 하나. 안쪽 반지름 안은 잔디가 없고, `fade`까지 키가 자란다. */
interface Blocker {
  direction: Vec3;
  inner: number;
  fade: number;
}

const BLOCKERS: readonly Blocker[] = [
  ...BARE_SPOTS.map((spot) => ({
    direction: spot.direction,
    inner: spot.radius + GRASS_FIELD.bareEdge[0],
    fade: GRASS_FIELD.bareEdge[1] - GRASS_FIELD.bareEdge[0],
  })),
  ...DREAM_PROPS.map((prop) => ({ direction: prop.direction, inner: prop.footprint * GRASS_FIELD.propClear, fade: 0.25 })),
];

/** 높이 `z`(위도의 사인), 경도 `lon`(라디안)의 방향 */
const directionAt = (z: number, lon: number): Vec3 => {
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(lon), z, r * Math.sin(lon)];
};

/** 행성 표면을 위도 띠와 경도 칸으로 나눈 셀. 칸은 대략 `cellSize` 크기의 네모다. */
function makeCells(): { cell: GrassCell; z: [number, number]; lon: [number, number] }[] {
  const { cellSize } = GRASS_FIELD;
  const bands = Math.max(2, Math.round((Math.PI * R) / cellSize));
  const cells: { cell: GrassCell; z: [number, number]; lon: [number, number] }[] = [];
  for (let b = 0; b < bands; b++) {
    const lat0 = -Math.PI / 2 + (Math.PI * b) / bands;
    const lat1 = -Math.PI / 2 + (Math.PI * (b + 1)) / bands;
    const latMid = (lat0 + lat1) / 2;
    const segments = Math.max(3, Math.round((2 * Math.PI * R * Math.cos(latMid)) / cellSize));
    for (let s = 0; s < segments; s++) {
      const lon0 = (2 * Math.PI * s) / segments;
      const lon1 = (2 * Math.PI * (s + 1)) / segments;
      const center = directionAt(Math.sin(latMid), (lon0 + lon1) / 2);
      const corners = [
        directionAt(Math.sin(lat0), lon0),
        directionAt(Math.sin(lat0), lon1),
        directionAt(Math.sin(lat1), lon0),
        directionAt(Math.sin(lat1), lon1),
      ];
      const radius = Math.max(...corners.map((corner) => surfaceDistance(center, corner)));
      cells.push({ cell: { center, radius, start: 0, count: 0 }, z: [Math.sin(lat0), Math.sin(lat1)], lon: [lon0, lon1] });
    }
  }
  return cells;
}

/** 방향 `dir`에서 잔디가 자라는 정도 (0이면 없음, 1이면 다 자람). `blockers`는 이 셀 가까이 있는 것만 넘긴다. */
function growth(dir: Vec3, blockers: readonly Blocker[]): number {
  let grow = 1;
  for (const blocker of blockers) {
    const d = surfaceDistance(dir, blocker.direction) - blocker.inner;
    if (d <= 0) return 0;
    if (d < blocker.fade) grow = Math.min(grow, smoothstep(0, blocker.fade, d));
  }
  return grow;
}

/** 행성 잔디밭을 만든다. 수십만 포기라 처음 한 번만 만들어 둔다 (`grassField`). */
export function buildGrassField(): GrassField {
  const { density, height, tallChance, tallHeight, width, sink, seed } = GRASS_FIELD;
  const random = seededRandom(seed);
  const cells = makeCells();
  // 셀 면적은 R² × (z1 - z0) × (경도 폭)이다. 넉넉히 잡아 두고 마지막에 자른다.
  const estimate = Math.ceil(4 * Math.PI * R * R * density * 1.05) + cells.length;
  let blades = new Float32Array(estimate * BLADE_STRIDE);
  let count = 0;

  for (const { cell, z, lon } of cells) {
    cell.start = count;
    const area = R * R * (z[1] - z[0]) * (lon[1] - lon[0]);
    const near = BLOCKERS.filter((b) => surfaceDistance(cell.center, b.direction) < cell.radius + b.inner + b.fade);
    // 소수 부분은 확률로 정해 전체 밀도를 맞춘다.
    const wanted = area * density;
    const n = Math.floor(wanted) + (random() < wanted % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      // 위도 대신 z를 고르게 뽑으면 셀 안에서 면적이 고르게 퍼진다.
      const dir = directionAt(z[0] + (z[1] - z[0]) * random(), lon[0] + (lon[1] - lon[0]) * random());
      const yaw = random() * Math.PI * 2;
      const tall = random() < tallChance;
      const range = tall ? tallHeight : height;
      const h = range[0] + (range[1] - range[0]) * random();
      const w = width[0] + (width[1] - width[0]) * random();
      const unique = random();
      const grow = near.length > 0 ? growth(dir, near) : 1;
      if (grow < 0.15) continue;
      const r = R + terrainHeight(dir) - sink;
      if (count * BLADE_STRIDE >= blades.length) {
        const bigger = new Float32Array(blades.length * 2);
        bigger.set(blades);
        blades = bigger;
      }
      blades.set([dir[0] * r, dir[1] * r, dir[2] * r, yaw, h * grow, w, unique], count * BLADE_STRIDE);
      count++;
    }
    cell.count = count - cell.start;
  }

  return { blades: blades.slice(0, count * BLADE_STRIDE), count, cells: cells.map((c) => c.cell) };
}

let cached: GrassField | undefined;

/** 행성 잔디밭. 처음 부를 때 만든다. */
export function grassField(): GrassField {
  return (cached ??= buildGrassField());
}

/** `around`(행성 중심에서 본 방향)에서 표면 거리 `reach` 안에 걸친 셀들의 번호 */
export function cellsWithin(cells: readonly GrassCell[], around: Vec3, reach: number): number[] {
  const picked: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.count > 0 && surfaceDistance(around, cell.center) < reach + cell.radius) picked.push(i);
  }
  return picked;
}
