import type { Vec3 } from '../../../engine/math';
import type { Ground } from '../../../engine/physics/collision';

/**
 * 잔디로 덮인 넓은 분지. 아주 큰 구(반지름 `curvature`)의 꼭대기를 땅으로 써서 캐릭터 물리와 카메라를 그대로 쓰고,
 * 멀리서는 땅이 살짝 휘어 지평선이 생긴다. 높이는 수평 좌표 (x, z)의 함수이고, 같은 함수를 잔디 셰이더가 GLSL로 쓴다
 * (`graphics/terrainGlsl.ts`가 아래 값으로 GLSL을 만든다).
 */
export const MEADOW = {
  /** 땅으로 쓰는 구의 반지름. 중심은 (0, -curvature, 0)이라 원점이 땅 위 시작 지점이다. */
  curvature: 4000,
  /** 완만한 언덕을 만드는 평면 물결: [높이, x 파수, z 파수, 위상] */
  waves: [
    [1.5, 0.041, 0.018, 0.3],
    [1.2, -0.022, 0.047, 1.7],
    [0.7, 0.083, -0.061, 2.4],
    [0.5, 0.05, 0.11, 0.9],
    [0.3, -0.16, 0.12, 4.1],
    [0.18, 0.21, 0.27, 2.2],
  ] as const,
  /** 분지 가장자리: 중심에서 `start`부터 `end`까지 `height`만큼 솟는다. */
  rim: { start: 95, end: 175, height: 16 },
  /** 캐릭터가 갈 수 있는 수평 반지름 */
  bound: 150,
  /** 땅 메시가 덮는 수평 반지름과 한 변의 칸 수 */
  extent: 260,
  segments: 260,
};

export const MEADOW_CENTER: Vec3 = [0, -MEADOW.curvature, 0];

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** 수평 좌표 (x, z)의 땅 높이 (구 표면 위로) */
export function meadowHeight(x: number, z: number): number {
  let h = 0;
  for (const [amplitude, kx, kz, phase] of MEADOW.waves) h += amplitude * Math.sin(kx * x + kz * z + phase);
  const { start, end, height } = MEADOW.rim;
  const s = smoothstep(start, end, Math.hypot(x, z));
  return h + height * s * s;
}

/** 캐릭터가 걷는 땅. 방향의 수평 성분에 구 반지름을 곱해 수평 좌표로 쓴다. */
export const MEADOW_GROUND: Ground = {
  center: MEADOW_CENTER,
  radius: MEADOW.curvature,
  heightAt: (dir) => meadowHeight(dir[0] * MEADOW.curvature, dir[2] * MEADOW.curvature),
};

/**
 * 수평 좌표 (x, z) 땅 위의 점. 위쪽으로 `lift`만큼 띄운다.
 * 큰 구에서 빼기를 하면 자릿수를 잃으므로 `R(s - 1) = -Rq / (1 + s)`로 푼다 (셰이더도 같다).
 */
export function meadowPoint(x: number, z: number, lift = 0): Vec3 {
  const R = MEADOW.curvature;
  const q = (x * x + z * z) / (R * R);
  const s = Math.sqrt(Math.max(0, 1 - q));
  const h = meadowHeight(x, z) + lift;
  return [x * (1 + h / R), h * s - (R * q) / (1 + s), z * (1 + h / R)];
}

/** 수평 반지름 `bound` 밖으로 나간 위치를 안으로 되돌린다. 되돌렸으면 바깥 방향(수평 단위 벡터)을 준다. */
export function keepInside(position: Vec3, bound = MEADOW.bound): { position: Vec3; outward: Vec3 } | null {
  const r = Math.hypot(position[0], position[2]);
  if (r <= bound) return null;
  const k = bound / r;
  return { position: [position[0] * k, position[1], position[2] * k], outward: [position[0] / r, 0, position[2] / r] };
}
