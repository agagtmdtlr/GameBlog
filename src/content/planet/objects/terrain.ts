import { add, cross, dot, mat4FromBasis, normalize, scale, type Mat4, type Vec3 } from '../../../engine/math';
import type { MeshKind } from '../../../engine/frame';
import { groundRadius, type Capsule, type Ground } from '../../../engine/physics/collision';
import { PLANET } from '../planet';
import { SURFACE_OBJECTS } from './surfaceScene';
import { TRACK_PATH } from './train';

/**
 * 몽환적인 행성 땅. 완만한 언덕과 잔물결이 있는 높이 함수와, 그 위에 흩어 놓은 둥근 파스텔 지형물이다.
 * 선로, 표면 객체(집·로켓), 시작 지점 둘레는 평평하게(높이 0) 두어 구 위에 놓인 것들이 그대로 맞는다.
 * 모든 값은 고정 시드로 만들므로 매번 같은 모양이다.
 */

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

/** 구 표면에서 고르게 뽑은 방향 */
function randomDirection(random: () => number): Vec3 {
  const z = random() * 2 - 1;
  const phi = random() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(phi), z, r * Math.sin(phi)];
}

const between = (random: () => number, min: number, max: number): number => min + (max - min) * random();

/** 두 단위 방향 사이의 현의 길이 (단위 구 기준). 작은 각에서는 라디안 각도와 거의 같다. */
const chord = (a: Vec3, b: Vec3): number => Math.sqrt(Math.max(0, 2 - 2 * dot(a, b)));

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const TERRAIN_SHAPE = {
  /** 언덕 수. 음수 높이(움푹한 곳)도 섞인다. */
  hillCount: 46,
  /** 언덕 반지름의 범위 (표면 거리) */
  hillWidth: [3, 7.5] as const,
  /** 언덕 높이를 반지름에 대한 비율로 제한해 걸어 오를 수 있게 한다. */
  hillSteepness: 0.3,
  /** 언덕 높이의 상한 */
  maxHillHeight: 1.8,
  /** 움푹한 곳의 비율 */
  dipRatio: 0.18,
  /** 잔물결의 높이 */
  rippleHeight: 0.22,
  /** 선로 둘레에서 높이가 0인 폭과 원래 높이로 돌아오는 폭 (표면 거리, 선로 중심에서) */
  trackFlat: [2.0, 6.0] as const,
  /** 시작 지점 둘레의 평평한 폭 */
  spawnFlat: [3.0, 7.0] as const,
  /** 표면 객체 둘레에 더하는 평평한 여유와 돌아오는 폭 */
  objectFlatMargin: 1.2,
  objectBlend: 4.0,
  seed: 20261122,
};

interface Hill {
  direction: Vec3;
  amplitude: number;
  /** 반지름 (현 길이) */
  width: number;
}

interface FlatSpot {
  direction: Vec3;
  /** 이 안은 높이 0 (현 길이) */
  inner: number;
  /** 이 밖은 원래 높이 (현 길이) */
  outer: number;
}

const R = PLANET.radius;

function makeHills(random: () => number): Hill[] {
  const { hillCount, hillWidth, hillSteepness, maxHillHeight, dipRatio } = TERRAIN_SHAPE;
  return Array.from({ length: hillCount }, () => {
    const direction = randomDirection(random);
    const width = between(random, hillWidth[0], hillWidth[1]);
    const height = Math.min(maxHillHeight, width * hillSteepness) * between(random, 0.45, 1);
    const amplitude = random() < dipRatio ? -height * 0.5 : height;
    return { direction, amplitude, width: width / R };
  });
}

function makeFlatSpots(): FlatSpot[] {
  const { trackFlat, spawnFlat, objectFlatMargin, objectBlend } = TERRAIN_SHAPE;
  const spots: FlatSpot[] = TRACK_PATH.frames(1.2).map((frame) => ({
    direction: frame.up,
    inner: trackFlat[0] / R,
    outer: trackFlat[1] / R,
  }));
  spots.push({ direction: [0, 1, 0], inner: spawnFlat[0] / R, outer: spawnFlat[1] / R });
  for (const o of SURFACE_OBJECTS) {
    const half = Math.hypot(o.size[0], o.size[2]) / 2 + objectFlatMargin;
    spots.push({ direction: normalize(o.box.center), inner: half / R, outer: (half + objectBlend) / R });
  }
  return spots;
}

const random = seededRandom(TERRAIN_SHAPE.seed);
const HILLS = makeHills(random);
const FLAT_SPOTS = makeFlatSpots();

/** 0이면 완전히 평평해야 하는 곳, 1이면 원래 높이 */
function flatness(dir: Vec3): number {
  let mask = 1;
  for (const spot of FLAT_SPOTS) {
    const d = chord(dir, spot.direction);
    if (d >= spot.outer) continue;
    mask = Math.min(mask, smoothstep(spot.inner, spot.outer, d));
    if (mask === 0) return 0;
  }
  return mask;
}

function ripple([x, y, z]: Vec3): number {
  const h = TERRAIN_SHAPE.rippleHeight;
  return (
    h * Math.sin(9 * x + 1.3) * Math.sin(7 * y + 0.4) * Math.sin(8 * z + 2.2) +
    h * 0.5 * Math.sin(17 * x - 0.7 * y + 0.5) * Math.sin(15 * z + 13 * y + 1.1)
  );
}

/** 방향 `dir`(단위 벡터)의 땅 높이. 반지름 `PLANET.radius`에 더한다. */
export function terrainHeight(dir: Vec3): number {
  const mask = flatness(dir);
  if (mask === 0) return 0;
  let h = ripple(dir);
  for (const hill of HILLS) {
    const d = chord(dir, hill.direction);
    if (d >= hill.width) continue;
    const s = 1 - (d * d) / (hill.width * hill.width);
    h += hill.amplitude * s * s;
  }
  return h * mask;
}

/** 캐릭터가 걷고 지형을 그리는 땅 */
export const TERRAIN: Ground = { center: PLANET.center, radius: PLANET.radius, heightAt: terrainHeight };

/** 땅 위 한 자리의 축. `x × y = z`인 오른손 기저이고 `y`가 위쪽이다. */
function surfaceBasis(up: Vec3, spin: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const helper: Vec3 = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const a = normalize(cross(helper, up));
  const b = cross(a, up);
  const x = normalize(add(scale(a, Math.cos(spin)), scale(b, Math.sin(spin))));
  return { x, y: up, z: cross(x, up) };
}

/** sRGB 16진 색을 선형 RGB로 바꾼다. */
function hex(code: string): Vec3 {
  const n = parseInt(code.slice(1), 16);
  const toLinear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return [toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255)];
}

/** 지형물의 파스텔 색 (선형 RGB). 참고 그림의 분홍, 보라, 하늘, 민트, 노랑, 복숭아 */
export const DREAM_PALETTE: readonly Vec3[] = [
  hex('#FF7EB8'),
  hex('#B08CFF'),
  hex('#7FB4FF'),
  hex('#82E3B4'),
  hex('#F4EE7A'),
  hex('#FFAA8C'),
  hex('#C9F36C'),
  hex('#8FE6F0'),
];

/** 지형물의 모양. `mound`는 종 모양 언덕, `pillar`는 끝이 둥근 기둥, `ball`은 반쯤 묻힌 공, `lollipop`은 줄기 위의 공, `pebble`은 작은 장식 공이다. */
export type PropShape = 'mound' | 'pillar' | 'ball' | 'lollipop' | 'pebble';

/** 지형물을 이루는 메시 하나 */
export interface PropPart {
  mesh: MeshKind;
  model: Mat4;
  color: Vec3;
}

export interface DreamProp {
  shape: PropShape;
  /** 행성 중심에서 지형물 바닥을 향하는 방향 */
  direction: Vec3;
  /** 땅에 닿는 바닥의 반지름 (표면 거리) */
  footprint: number;
  parts: PropPart[];
  /** 캐릭터가 통과할 수 없는 부분. 장식 공(`pebble`)은 없다. */
  colliders: Capsule[];
}

export const PROP_LAYOUT = {
  /** 모양별 개수 */
  counts: { mound: 9, pillar: 12, ball: 12, lollipop: 10, pebble: 70 } as Record<PropShape, number>,
  /** 큰 지형물 사이에 남기는 걸을 수 있는 틈 */
  gap: 2.4,
  /** 평평한 곳(선로, 집, 로켓, 시작 지점)의 안쪽 경계에서 더 떨어뜨리는 거리 */
  flatMargin: 1.0,
  seed: 77031,
};

/** 바닥이 땅 아래로 묻히는 깊이. 언덕 비탈에서도 바닥이 뜨지 않게 한다. */
const SINK = 0.35;

function buildProp(shape: PropShape, direction: Vec3, random: () => number): DreamProp {
  const spin = random() * Math.PI * 2;
  const { x, y, z } = surfaceBasis(direction, spin);
  const base = scale(direction, groundRadius(TERRAIN, direction));
  const at = (h: number): Vec3 => add(base, scale(y, h));
  const pick = (): Vec3 => DREAM_PALETTE[Math.floor(random() * DREAM_PALETTE.length)];
  const basis = (origin: Vec3, sx: number, sy: number, sz: number): Mat4 =>
    mat4FromBasis(origin, scale(x, sx), scale(y, sy), scale(z, sz));
  const color = pick();

  switch (shape) {
    case 'mound': {
      // 메시는 y 0~1에 바닥 반지름 0.5이고, 아래로 0.4까지 이어진다.
      const width = between(random, 3.6, 6.2);
      const height = between(random, 2.6, 5.2);
      const radius = width * 0.34;
      const bottom = at(radius - SINK);
      const top = at(Math.max(radius - SINK, height - radius * 0.95));
      return {
        shape,
        direction,
        footprint: width / 2,
        parts: [{ mesh: 'mound', model: basis(at(-SINK), width, height, width), color }],
        colliders: [{ a: bottom, b: top, radius }],
      };
    }
    case 'pillar': {
      // 메시는 y 0~1에 반지름 0.5이고 꼭대기가 둥글다. 아래로 0.3까지 이어진다.
      const width = between(random, 1.2, 2.3);
      const height = between(random, 3.4, 7);
      const radius = width / 2;
      return {
        shape,
        direction,
        footprint: radius,
        parts: [{ mesh: 'pillar', model: basis(at(-SINK), width, height, width), color }],
        colliders: [{ a: at(radius), b: at(height - radius), radius }],
      };
    }
    case 'ball': {
      const radius = between(random, 0.8, 1.7);
      const center = at(radius * 0.7);
      return {
        shape,
        direction,
        footprint: radius,
        parts: [{ mesh: 'sphere', model: basis(center, radius, radius, radius), color }],
        colliders: [{ a: center, b: center, radius }],
      };
    }
    case 'lollipop': {
      // 줄기 위 공은 캐릭터 머리보다 높아 줄기만 막는다.
      const height = between(random, 3.8, 5.4);
      const radius = between(random, 0.6, 1.0);
      const stem = 0.22;
      const stemLength = height - radius * 0.5 + SINK;
      const stemCenter = at(stemLength / 2 - SINK);
      const head = at(height);
      return {
        shape,
        direction,
        footprint: radius,
        parts: [
          // 원기둥은 축이 Z이므로 Z를 위쪽에 맞춘다. 오른손 기저가 되도록 y = 위 × x.
          { mesh: 'cylinder', model: mat4FromBasis(stemCenter, scale(x, stem), scale(cross(y, x), stem), scale(y, stemLength)), color: pick() },
          { mesh: 'sphere', model: basis(head, radius, radius, radius), color },
        ],
        colliders: [{ a: at(0), b: at(height - radius), radius: stem + 0.1 }],
      };
    }
    case 'pebble': {
      const radius = between(random, 0.18, 0.45);
      return {
        shape,
        direction,
        footprint: radius,
        parts: [{ mesh: 'sphere', model: basis(at(radius * 0.25), radius, radius, radius), color }],
        colliders: [],
      };
    }
  }
}

/** 평평한 곳의 안쪽 경계까지 남은 표면 거리. 음수면 그 안이다. */
function clearanceFromFlat(dir: Vec3): number {
  let best = Infinity;
  for (const spot of FLAT_SPOTS) best = Math.min(best, (chord(dir, spot.direction) - spot.inner) * R);
  return best;
}

function placeProps(): DreamProp[] {
  const { counts, gap, flatMargin, seed } = PROP_LAYOUT;
  const rand = seededRandom(seed);
  const props: DreamProp[] = [];
  const order: PropShape[] = ['mound', 'pillar', 'ball', 'lollipop', 'pebble'];
  for (const shape of order) {
    let placed = 0;
    for (let attempt = 0; placed < counts[shape] && attempt < 4000; attempt++) {
      const direction = randomDirection(rand);
      const prop = buildProp(shape, direction, rand);
      const big = shape !== 'pebble';
      if (clearanceFromFlat(direction) < prop.footprint + (big ? flatMargin : 0)) continue;
      const crowded = props.some((other) => {
        const distance = chord(direction, other.direction) * R;
        const needed = prop.footprint + other.footprint + (big && other.shape !== 'pebble' ? gap : 0.2);
        return distance < needed;
      });
      if (crowded) continue;
      props.push(prop);
      placed++;
    }
  }
  return props;
}

/** 땅 위에 흩어 놓은 몽환적인 지형물. 움직이지 않으므로 한 번만 만든다. */
export const DREAM_PROPS: readonly DreamProp[] = placeProps();

/** 캐릭터가 통과할 수 없는 지형물 부분 */
export const PROP_COLLIDERS: readonly Capsule[] = DREAM_PROPS.flatMap((prop) => prop.colliders);
