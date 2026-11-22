import type { Vec3 } from './math';
import type { SkinSource } from './skinning';

/**
 * 문어 꼴 외계인의 모양. 단위는 머리 반구의 반지름(1)이고, 원점은 챙 아래 가운데, +Y가 위, +Z가 앞이다.
 * three.js를 쓰지 않고, 렌더러가 이 값으로 지오메트리를 만든다. 자세와 걸음은 `game/alien.ts`가 정한다.
 */

/** [반지름, 높이] 단면. 아래에서 위로 바깥 면을 따라간다. */
export type Profile = [radius: number, y: number][];

export const ALIEN_SHAPE = {
  /** 머리 반구 반지름. 챙은 반구 아래에 둘러 있다. */
  domeRadius: 1,
  /** 챙의 바깥 반지름과 두께 */
  brimRadius: 1.42,
  brimThickness: 0.12,
  /** 눈가리개 띠: 머리 반구보다 조금 큰 구면 위의 둥근 사각형 (각도, 라디안) */
  visor: { radius: 1.05, elevation: 0.42, halfWidth: 0.95, halfHeight: 0.19, corner: 0.12 },
  /** 눈가리개 가운데의 가늘고 긴 틈 */
  slit: { radius: 1.065, elevation: 0.42, halfWidth: 0.66, halfHeight: 0.055 },
  /** 더듬이: 머리 위 자리(방위각, 고도), 줄기 길이·굵기, 끝 공 반지름 */
  antennae: [
    { azimuth: -0.75, elevation: 0.95, tilt: 0.42 },
    { azimuth: 0.55, elevation: 0.98, tilt: 0.3 },
  ],
  antennaLength: 0.95,
  antennaThickness: 0.045,
  antennaBall: 0.12,
  /** 다리(촉수) 하나: 아래(-Y)로 뻗은 끝이 둥근 관. 뼈 마디 수만큼 휜다. */
  tentacle: { length: 1.55, rootRadius: 0.15, tipRadius: 0.06, bones: 5, rings: 40, sides: 14 },
};

/** 머리: 챙 아래 평평한 바닥 → 둥근 챙 끝 → 챙 위 → 반구. */
export function headProfile(): Profile {
  const { domeRadius: R, brimRadius: B, brimThickness: t } = ALIEN_SHAPE;
  const points: Profile = [[0, -0.02], [B - t * 0.5, -0.02]];
  // 챙 끝을 반원으로 둥글린다.
  for (let i = 1; i < 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    points.push([B - t * 0.5 + Math.cos(a) * t * 0.5, -0.02 + t * 0.5 + Math.sin(a) * t * 0.5]);
  }
  points.push([B - t * 0.5, t - 0.02], [R + 0.02, t + 0.01]);
  // 반구. 챙 위에서 시작해 꼭대기에서 닫힌다.
  const start = Math.asin((t + 0.03) / R);
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * (Math.PI / 2 - start);
    points.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  points[points.length - 1] = [0, R];
  return points;
}

/** 구면 위 한 점의 방향. 방위각 0, 고도 0이 앞(+Z)이고 방위각이 늘면 오른쪽(+X)이다. */
export function sphereDirection(azimuth: number, elevation: number): Vec3 {
  return [Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth)];
}

/** 둥근 사각형 윤곽 (방위각, 고도 오프셋). `corner`가 `halfHeight`와 같으면 알약 꼴이다. */
export function roundedRectOutline(halfWidth: number, halfHeight: number, corner: number, cornerSegments = 8): [number, number][] {
  const c = Math.min(corner, halfWidth, halfHeight);
  const centers: [number, number, number][] = [
    [halfWidth - c, halfHeight - c, 0],
    [-(halfWidth - c), halfHeight - c, Math.PI / 2],
    [-(halfWidth - c), -(halfHeight - c), Math.PI],
    [halfWidth - c, -(halfHeight - c), (3 * Math.PI) / 2],
  ];
  const points: [number, number][] = [];
  for (const [cx, cy, start] of centers) {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = start + (i / cornerSegments) * (Math.PI / 2);
      points.push([cx + Math.cos(a) * c, cy + Math.sin(a) * c]);
    }
  }
  // 알약 꼴처럼 모서리 원끼리 맞닿으면 같은 점이 겹치므로 뺀다.
  const unique = points.filter((p, i) => {
    const q = points[(i + points.length - 1) % points.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9;
  });
  // 긴 곧은 변은 구면을 가로지르는 평면 삼각형이 되어 곡면 안으로 파고들므로 잘게 나눈다.
  const step = 0.04;
  const dense: [number, number][] = [];
  unique.forEach((p, i) => {
    const q = unique[(i + 1) % unique.length];
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 0; k < n; k++) dense.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  });
  return dense;
}

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/**
 * 구면에 붙인 볼록한 조각. 윤곽을 가운데에서 바깥으로 여러 겹 줄여 고리를 만들고, 각 점을 구면에 옮긴다.
 * 법선은 구의 바깥 방향이라 곡면이 매끄럽게 칠해진다.
 */
export function spherePatch(outline: readonly [number, number][], radius: number, elevation: number, rings = 10): MeshArrays {
  const n = outline.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const push = (a: number, b: number) => {
    const d = sphereDirection(a, elevation + b);
    positions.push(d[0] * radius, d[1] * radius, d[2] * radius);
    normals.push(d[0], d[1], d[2]);
  };
  push(0, 0);
  for (let k = 1; k <= rings; k++) {
    const f = k / rings;
    for (const [a, b] of outline) push(a * f, b * f);
  }
  // 바깥에서 보아 반시계 방향이 앞면이다.
  // 윤곽은 반시계 방향이다(오른쪽 위 모서리부터).
  for (let i = 0; i < n; i++) indices.push(0, 1 + i, 1 + ((i + 1) % n));
  for (let k = 1; k < rings; k++) {
    const inner = 1 + (k - 1) * n;
    const outer = 1 + k * n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(inner + i, outer + i, outer + j, inner + i, outer + j, inner + j);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

export function visorPatch(): MeshArrays {
  const v = ALIEN_SHAPE.visor;
  return spherePatch(roundedRectOutline(v.halfWidth, v.halfHeight, v.corner), v.radius, v.elevation);
}

export function slitPatch(): MeshArrays {
  const s = ALIEN_SHAPE.slit;
  return spherePatch(roundedRectOutline(s.halfWidth, s.halfHeight, s.halfHeight), s.radius, s.elevation);
}

/** 촉수 뼈 사이 간격. 뼈 i는 뿌리에서 `i * tentacleBoneSpacing()` 아래에 있다. */
export function tentacleBoneSpacing(): number {
  const { length, bones } = ALIEN_SHAPE.tentacle;
  return length / bones;
}

/** 깊이 d(뿌리에서 아래로)의 촉수 반지름. 뿌리에서 끝으로 가늘어진다. */
export function tentacleRadius(d: number): number {
  const { length, rootRadius, tipRadius } = ALIEN_SHAPE.tentacle;
  const t = Math.min(1, Math.max(0, d / length));
  return rootRadius + (tipRadius - rootRadius) * t;
}

/**
 * 촉수의 기본 자세 정점과 뼈 가중치. 뿌리가 원점이고 -Y로 뻗으며 끝은 반구로 닫는다.
 * 정점은 깊이에 따라 이웃한 두 뼈에 선형으로 나눠 붙는다.
 */
export function tentacleSkin(): SkinSource & { indices: Uint32Array } {
  const { length, bones, rings, sides, tipRadius } = ALIEN_SHAPE.tentacle;
  const spacing = tentacleBoneSpacing();
  const positions: number[] = [];
  const normals: number[] = [];
  const boneIndices: number[] = [];
  const boneWeights: number[] = [];
  const indices: number[] = [];

  const weigh = (d: number) => {
    const u = Math.min(bones - 1, d / spacing);
    const i = Math.min(bones - 2, Math.floor(u));
    const f = Math.min(1, u - i);
    boneIndices.push(i, i + 1, 0, 0);
    boneWeights.push(1 - f, f, 0, 0);
  };
  const ring = (d: number, r: number, ny: number) => {
    const scaleN = Math.sqrt(Math.max(0, 1 - ny * ny));
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const cx = Math.sin(a), cz = Math.cos(a);
      positions.push(cx * r, -d, cz * r);
      normals.push(cx * scaleN, ny, cz * scaleN);
      weigh(d);
    }
  };

  for (let k = 0; k <= rings; k++) {
    const d = (k / rings) * length;
    ring(d, tentacleRadius(d), 0);
  }
  const capRings = 5;
  for (let k = 1; k <= capRings; k++) {
    const a = (k / capRings) * (Math.PI / 2);
    ring(length + Math.sin(a) * tipRadius, Math.cos(a) * tipRadius, -Math.sin(a));
  }
  const total = rings + 1 + capRings;
  for (let k = 0; k < total - 1; k++) {
    const a0 = k * (sides + 1);
    const a1 = (k + 1) * (sides + 1);
    for (let s = 0; s < sides; s++) {
      indices.push(a0 + s, a1 + s, a0 + s + 1, a0 + s + 1, a1 + s, a1 + s + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    boneIndices: new Uint8Array(boneIndices),
    boneWeights: new Float32Array(boneWeights),
    indices: new Uint32Array(indices),
  };
}
