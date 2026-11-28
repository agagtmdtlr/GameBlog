import type { Vec3 } from '../../../engine/math';
import type { Ground } from '../../../engine/physics/collision';

/**
 * 잔디로 덮인 넓은 분지. 아주 큰 구(반지름 `curvature`)의 꼭대기를 땅으로 써서 캐릭터 물리와 카메라를 그대로 쓰고,
 * 멀리서는 땅이 살짝 휘어 지평선이 생긴다. 높이는 수평 좌표 (x, z)의 함수이고, 같은 함수를 잔디·땅 셰이더가 GLSL로 쓴다
 * (`graphics/terrainGlsl.ts`가 아래 값으로 GLSL을 만든다).
 * 땅은 바다처럼 너울이 굽이치며 흘러간다 (`swells`, 2026-11-28 사용자 요청). 너울은 시간의 함수라, 캐릭터가 걷는 땅은
 * 시간을 가진 `MeadowGround`이고 셰이더는 같은 시간(`uSwellTime`)을 받는다.
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
  /**
   * 땅을 바다처럼 굽이치게 하는 너울: [높이, 파장, 나아가는 방향(수평 각도, 라디안), 빠르기(단위/초), 위상].
   * 방향이 다른 셋을 겹쳐 물마루가 끊임없이 모양을 바꾸며 지나간다.
   */
  swells: [
    [1.8, 48, 0.5, 5, 0],
    [1.0, 29, 2.3, 4, 1.9],
    [0.5, 17, -1.0, 3, 4.2],
  ] as const,
  /** 분지 가장자리: 중심에서 `start`부터 `end`까지 `height`만큼 솟는다. */
  rim: { start: 95, end: 175, height: 16 },
  /** 캐릭터가 갈 수 있는 수평 반지름 */
  bound: 150,
};

export const MEADOW_CENTER: Vec3 = [0, -MEADOW.curvature, 0];

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** 수평 좌표 (x, z), 시각 `time`(초)의 너울 높이 */
export function meadowSwell(x: number, z: number, time: number): number {
  let h = 0;
  for (const [amplitude, wavelength, heading, speed, phase] of MEADOW.swells) {
    const k = (2 * Math.PI) / wavelength;
    h += amplitude * Math.sin(k * (Math.cos(heading) * x + Math.sin(heading) * z - speed * time) + phase);
  }
  return h;
}

/** 수평 좌표 (x, z)의 너울 없는 땅 높이 (구 표면 위로). 하늘 텔레비전과 번개는 이 높이를 기준으로 뜬다. */
export function meadowHeight(x: number, z: number): number {
  let h = 0;
  for (const [amplitude, kx, kz, phase] of MEADOW.waves) h += amplitude * Math.sin(kx * x + kz * z + phase);
  const { start, end, height } = MEADOW.rim;
  const s = smoothstep(start, end, Math.hypot(x, z));
  return h + height * s * s;
}

/** 너울 없는 땅. 방향의 수평 성분에 구 반지름을 곱해 수평 좌표로 쓴다. */
export const MEADOW_GROUND: Ground = {
  center: MEADOW_CENTER,
  radius: MEADOW.curvature,
  heightAt: (dir) => meadowHeight(dir[0] * MEADOW.curvature, dir[2] * MEADOW.curvature),
};

/**
 * 캐릭터가 걷는 땅. 너울이 굽이치므로 시각(`time`)을 가진다. `MeadowWorld`가 고정 단계마다 시각을 맞춘다.
 * 방향의 수평 성분에 구 반지름을 곱해 수평 좌표로 쓴다.
 */
export class MeadowGround implements Ground {
  readonly center = MEADOW_CENTER;
  readonly radius = MEADOW.curvature;
  time = 0;

  heightAt(dir: Vec3): number {
    const x = dir[0] * MEADOW.curvature;
    const z = dir[2] * MEADOW.curvature;
    return meadowHeight(x, z) + meadowSwell(x, z, this.time);
  }
}

/**
 * 수평 좌표 (x, z) 땅 위의 점. 위쪽으로 `lift`만큼 띄운다. `time`을 주면 그 시각의 너울 위, 안 주면 너울 없는 땅 위다.
 * 큰 구에서 빼기를 하면 자릿수를 잃으므로 `R(s - 1) = -Rq / (1 + s)`로 푼다 (셰이더도 같다).
 */
export function meadowPoint(x: number, z: number, lift = 0, time?: number): Vec3 {
  const R = MEADOW.curvature;
  const q = (x * x + z * z) / (R * R);
  const s = Math.sqrt(Math.max(0, 1 - q));
  const h = meadowHeight(x, z) + (time === undefined ? 0 : meadowSwell(x, z, time)) + lift;
  return [x * (1 + h / R), h * s - (R * q) / (1 + s), z * (1 + h / R)];
}

/** 수평 반지름 `bound` 밖으로 나간 위치를 안으로 되돌린다. 되돌렸으면 바깥 방향(수평 단위 벡터)을 준다. */
export function keepInside(position: Vec3, bound = MEADOW.bound): { position: Vec3; outward: Vec3 } | null {
  const r = Math.hypot(position[0], position[2]);
  if (r <= bound) return null;
  const k = bound / r;
  return { position: [position[0] * k, position[1], position[2] * k], outward: [position[0] / r, 0, position[2] / r] };
}
