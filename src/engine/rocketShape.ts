import { normalize, type Vec3 } from './math';

/**
 * 표면에 세우는 로켓 모형의 모양. 둥근 달걀 몸통에 짧은 다리 네 개, 둥근 창, 옆문, 리벳 줄이 있다.
 * three.js를 쓰지 않는 값과 계산만 둔다. 지오메트리는 `renderer.ts`가 이 값으로 만든다.
 *
 * 좌표는 한 변 1인 상자 안(-0.5~0.5)이다. 바닥(다리 끝)이 y = -0.5이고, 정면(+Z)에 창이 있다.
 * 장면 파일의 `size`가 이 상자를 늘린다.
 */
export const ROCKET_SHAPE = {
  /** 몸통 단면을 나누는 수 */
  profileSegments: 32,
  /** 몸통 둘레를 나누는 수 */
  radialSegments: 48,
  /** 몸통의 가장 넓은 반지름과 그 높이 */
  bodyRadius: 0.4,
  bodyMiddle: 0.0,
  /** 가장 넓은 곳에서 아래 끝, 위 끝까지의 높이. 위가 더 길어 달걀 모양이 된다. */
  bodyBelow: 0.32,
  bodyAbove: 0.5,
  /** 다리: 몸통 축에서의 거리, 굵기, 길이(양 끝 반구 제외), 바깥으로 기운 각도(도) */
  legs: { count: 4, offset: 0.27, radius: 0.1, length: 0.2, tiltDegrees: 22, firstAngleDegrees: 45 },
  /** 창: 몸통의 높이 매개변수(0 아래 끝 ~ 1 위 끝), 둘레 각도(도, 0이 +Z), 유리 반지름, 테 굵기 */
  window: { t: 0.62, angleDegrees: 0, radius: 0.12, rimTube: 0.028 },
  /** 옆문: 위치와 크기(폭, 높이, 두께) */
  hatch: { t: 0.52, angleDegrees: 110, size: [0.2, 0.26, 0.05] as Vec3 },
  /** 리벳: 크기, 가로 줄의 높이 매개변수, 세로 줄 수와 한 줄의 개수 */
  rivets: { radius: 0.016, rings: [0.38, 0.75], ringCount: 28, meridians: 8, meridianCount: 9 },
  /** 창 유리의 색 (선형 RGB). 어두운 청록 */
  glassColor: [0.02, 0.06, 0.07] as Vec3,
  glassRoughness: 0.15,
};

const DEG = Math.PI / 180;
const { bodyRadius, bodyMiddle, bodyBelow, bodyAbove } = ROCKET_SHAPE;
const BOTTOM = bodyMiddle - bodyBelow;

/** 몸통 단면 위의 점 `[반지름, 높이]`. `t`는 0(아래 끝)~1(위 끝)이다. */
export function bodyProfilePoint(t: number): [number, number] {
  const a = t * Math.PI;
  const half = a < Math.PI / 2 ? bodyBelow : bodyAbove;
  return [bodyRadius * Math.sin(a), bodyMiddle - half * Math.cos(a)];
}

/** 몸통 단면. 아래 끝에서 위 끝으로 간다. 양 끝은 반지름 0이라 닫힌다. */
export function bodyProfile(segments = ROCKET_SHAPE.profileSegments): [number, number][] {
  return Array.from({ length: segments + 1 }, (_, i) => bodyProfilePoint(i / segments));
}

/** 몸통 표면의 점과 바깥 법선. `angle`은 +Z에서 +X 쪽으로 잰 둘레 각도(라디안)다. */
export function bodySurface(t: number, angle: number): { position: Vec3; normal: Vec3 } {
  const [r, y] = bodyProfilePoint(t);
  const e = 1e-4;
  const [r0, y0] = bodyProfilePoint(Math.max(0, t - e));
  const [r1, y1] = bodyProfilePoint(Math.min(1, t + e));
  // 단면의 접선 (dr, dy)를 시계 방향으로 돌리면 바깥 법선 (dy, -dr)이다.
  const [nr, ny] = [y1 - y0, -(r1 - r0)];
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  return { position: [r * s, y, r * c], normal: normalize([nr * s, ny, nr * c]) };
}

export interface RocketLeg {
  /** 다리 축의 가운데 */
  center: Vec3;
  /** 다리 축 방향(위쪽). 바깥으로 기울어 있다. */
  axis: Vec3;
  radius: number;
  length: number;
}

/** 몸통 아래의 다리. 끝이 정확히 바닥(y = -0.5)에 닿는다. */
export function rocketLegs(): RocketLeg[] {
  const { count, offset, radius, length, tiltDegrees, firstAngleDegrees } = ROCKET_SHAPE.legs;
  const tilt = tiltDegrees * DEG;
  return Array.from({ length: count }, (_, i) => {
    const angle = (firstAngleDegrees + (360 * i) / count) * DEG;
    const out: Vec3 = [Math.sin(angle), 0, Math.cos(angle)];
    // 축이 바깥으로 기울면 아래 끝이 바깥으로 나간다.
    const axis: Vec3 = [-out[0] * Math.sin(tilt), Math.cos(tilt), -out[2] * Math.sin(tilt)];
    // 기운 캡슐의 가장 낮은 점은 축 끝에서 반지름만큼 아래다.
    const lowest = (length / 2) * Math.cos(tilt) + radius;
    return {
      center: [out[0] * offset, -0.5 + lowest, out[2] * offset],
      axis,
      radius,
      length,
    };
  });
}

/** 표면에 붙는 부품 하나의 자리. `normal`이 부품의 바깥(+Z) 방향이다. */
export interface RocketPart {
  position: Vec3;
  normal: Vec3;
}

export function rocketWindow(): RocketPart {
  const { t, angleDegrees } = ROCKET_SHAPE.window;
  return bodySurface(t, angleDegrees * DEG);
}

export function rocketHatch(): RocketPart {
  const { t, angleDegrees } = ROCKET_SHAPE.hatch;
  return bodySurface(t, angleDegrees * DEG);
}

/** 리벳 중심들. 가로 줄과 세로 줄을 따라 놓고, 창과 옆문을 덮는 것은 뺀다. */
export function rocketRivets(): Vec3[] {
  const { rings, ringCount, meridians, meridianCount } = ROCKET_SHAPE.rivets;
  const spots: [number, number][] = [];
  for (const t of rings) for (let i = 0; i < ringCount; i++) spots.push([t, ((i + 0.5) / ringCount) * 2 * Math.PI]);
  for (let m = 0; m < meridians; m++) {
    const angle = ((m + 0.5) / meridians) * 2 * Math.PI;
    for (let i = 0; i < meridianCount; i++) spots.push([0.2 + (0.72 * i) / (meridianCount - 1), angle]);
  }
  const keepAway = [
    { at: rocketWindow().position, distance: ROCKET_SHAPE.window.radius + ROCKET_SHAPE.window.rimTube + 0.03 },
    { at: rocketHatch().position, distance: ROCKET_SHAPE.hatch.size[1] / 2 + 0.03 },
  ];
  const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return spots
    .map(([t, angle]) => bodySurface(t, angle).position)
    .filter((p) => keepAway.every(({ at, distance }) => dist(p, at) > distance));
}

/** 몸통 아래 끝의 높이. 다리가 몸통을 받치는지 확인할 때 쓴다. */
export const ROCKET_BODY_BOTTOM = BOTTOM;
