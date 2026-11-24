import { dot, type Vec3 } from '../../../engine/math';
import { createRandom } from '../../../engine/random';

/**
 * 충돌구가 패인 바위 위성의 모양. 단위 구 위의 방향마다 반지름 배율을 정한다.
 * three.js를 쓰지 않고, 렌더러가 이 함수로 구 정점을 밀어 지오메트리를 만든다.
 */
export const MOON_SHAPE = {
  /** 같은 모양이 나오도록 고정한 난수 씨앗 */
  seed: 0x4d00,
  /** 크게 눈에 띄는 충돌구 수와 각반지름 범위 (라디안) */
  largeCraters: { count: 4, minRadius: 0.38, maxRadius: 0.55 },
  /** 작은 충돌구 수와 각반지름 범위 (라디안) */
  smallCraters: { count: 22, minRadius: 0.1, maxRadius: 0.24 },
  /** 충돌구 깊이와 각반지름의 비 */
  depthRatio: 0.32,
  /** 테두리 높이와 깊이의 비 */
  rimRatio: 0.45,
  /** 가장자리를 울퉁불퉁하게 만드는 바위 덩어리 수 */
  lumpCount: 14,
};

export interface Crater {
  /** 구 중심에서 충돌구 중심을 향하는 단위 벡터 */
  direction: Vec3;
  /** 테두리까지의 각반지름 (라디안) */
  radius: number;
  /** 바닥 깊이 (반지름 배율) */
  depth: number;
  /** 가운데에 한 번 더 패인 구덩이가 있다. 큰 충돌구만 */
  innerPit: boolean;
}

export interface Lump {
  direction: Vec3;
  radius: number;
  height: number;
}

export interface MoonFeatures {
  craters: Crater[];
  lumps: Lump[];
}

function randomDirection(random: () => number): Vec3 {
  const z = random() * 2 - 1;
  const phi = random() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(phi), r * Math.sin(phi), z];
}

/** 씨앗으로 충돌구와 바위 덩어리를 만든다. 같은 씨앗이면 같은 결과다. */
export function generateMoonFeatures(seed = MOON_SHAPE.seed): MoonFeatures {
  const random = createRandom(seed);
  const craters: Crater[] = [];
  const addCraters = ({ count, minRadius, maxRadius }: typeof MOON_SHAPE.largeCraters, innerPit: boolean) => {
    for (let i = 0; i < count; i++) {
      const radius = minRadius + (maxRadius - minRadius) * random();
      craters.push({ direction: randomDirection(random), radius, depth: radius * MOON_SHAPE.depthRatio, innerPit });
    }
  };
  addCraters(MOON_SHAPE.largeCraters, true);
  addCraters(MOON_SHAPE.smallCraters, false);

  const lumps: Lump[] = [];
  for (let i = 0; i < MOON_SHAPE.lumpCount; i++) {
    lumps.push({ direction: randomDirection(random), radius: 0.18 + 0.2 * random(), height: 0.05 + 0.07 * random() });
  }
  return { craters, lumps };
}

/**
 * 충돌구 하나의 높이. `t`는 중심에서의 각거리를 각반지름으로 나눈 값이다.
 * 안쪽은 그릇처럼 패이고, 테두리(t = 1)는 솟고, 바깥으로 갈수록 평평해진다.
 */
export function craterProfile(t: number, crater: Pick<Crater, 'depth' | 'innerPit'>): number {
  const { depth, innerPit } = crater;
  const rim = depth * MOON_SHAPE.rimRatio * Math.exp(-(((t - 1) / 0.28) ** 2));
  if (t >= 1) return rim;
  // 바닥은 평평하게 눌러 충돌구답게 만든다.
  const bowl = -depth * Math.min(1, 1.25 * (1 - t * t));
  const pit = innerPit && t < 0.35 ? -depth * 0.6 * (1 - (t / 0.35) ** 2) : 0;
  return bowl + rim + pit;
}

/** 단위 방향의 반지름 배율. 1이 기본 구다. */
export function moonRadiusAt(direction: Vec3, features: MoonFeatures): number {
  let h = 0;
  for (const lump of features.lumps) {
    const angle = Math.acos(Math.min(1, Math.max(-1, dot(direction, lump.direction))));
    if (angle < lump.radius) h += lump.height * 0.5 * (1 + Math.cos((Math.PI * angle) / lump.radius));
  }
  for (const crater of features.craters) {
    const angle = Math.acos(Math.min(1, Math.max(-1, dot(direction, crater.direction))));
    const t = angle / crater.radius;
    if (t < 2) h += craterProfile(t, crater);
  }
  return 1 + h;
}

/** 단위 구 정점 배열(x, y, z 반복)을 위성 모양으로 민다. 제자리에서 바꾼다. */
export function displaceToMoon(positions: Float32Array, features = generateMoonFeatures()): void {
  for (let i = 0; i < positions.length; i += 3) {
    const len = Math.hypot(positions[i], positions[i + 1], positions[i + 2]) || 1;
    const dir: Vec3 = [positions[i] / len, positions[i + 1] / len, positions[i + 2] / len];
    const r = moonRadiusAt(dir, features);
    positions[i] = dir[0] * r;
    positions[i + 1] = dir[1] * r;
    positions[i + 2] = dir[2] * r;
  }
}
