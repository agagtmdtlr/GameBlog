import type { CameraView } from '../../../engine/frame';
import { add, cross, dot, normalize, scale, sub, type Vec3 } from '../../../engine/math';

/** 카메라를 향해 서는 해 빌보드의 축. 모두 단위 벡터다. */
export interface BillboardBasis {
  /** 화면 오른쪽 */
  x: Vec3;
  /** 화면 위쪽 */
  y: Vec3;
  /** 해에서 카메라를 향하는 방향 (앞면) */
  z: Vec3;
}

export type BillboardView = Pick<CameraView, 'position' | 'up'>;

/**
 * 해 빌보드(햇살, 눈)가 함께 쓰는 축. 앞면이 카메라를 향하고 위쪽은 화면 위쪽에 맞춘다.
 * 그래서 카메라가 돌아도 빌보드는 화면 위에서 돌지 않는다.
 * `shaders/billboard.vert`가 빌보드를 세우는 축과 같아야 눈이 해 얼굴 위 제자리에 놓인다.
 */
export function sunBillboardBasis(sunPosition: Vec3, view: BillboardView): BillboardBasis {
  const z = normalize(sub(view.position, sunPosition));
  // 화면 위쪽이 시선과 나란한 드문 경우에는 다른 축을 쓴다.
  let x = cross(view.up, z);
  if (Math.hypot(x[0], x[1], x[2]) < 1e-4) x = cross(Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1], z);
  x = normalize(x);
  return { x, y: cross(z, x), z };
}

/**
 * 해 얼굴의 눈. 값은 해 반지름을 1로 둔 빌보드 평면 위의 값이다.
 * 흰자와 검은자는 따로 그린다. 흰자는 얼굴에 고정이고, 검은자는 흰자 안에서 캐릭터 쪽으로 움직인다.
 */
export const SUN_FACE = {
  /** 두 눈 중심의 가로 간격의 절반과 높이 */
  eyeSpacing: 0.36,
  eyeHeight: 0.14,
  /** 흰자 타원의 가로·세로 반지름 */
  whiteRadius: [0.24, 0.32] as [number, number],
  /** 검은자 원의 반지름 */
  pupilRadius: 0.13,
  /** 검은자와 흰자 테두리 사이에 남기는 여백 */
  pupilMargin: 0.025,
  /** 해 중심에서 카메라 쪽으로 띄우는 거리. 해 구면(1)보다 앞이라 구에 가리지 않는다. */
  whiteDepth: 1.03,
  pupilDepth: 1.06,
};

/** 흰자 색 (선형 RGB). 톤 매핑 뒤에 흰색에 가깝게 보이도록 1보다 밝게 둔다. */
export const SUN_EYE_WHITE_EMISSIVE: Vec3 = [2.2, 2.2, 2.1];
/** 검은자 색 (선형 RGB) */
export const SUN_PUPIL_COLOR: Vec3 = [0.005, 0.005, 0.005];

export interface SunEye {
  /** 흰자 가운데의 월드 위치. 크기는 `SUN_FACE.whiteRadius`에 해 반지름을 곱한 타원이다. */
  white: Vec3;
  /** 검은자 가운데의 월드 위치. 크기는 `SUN_FACE.pupilRadius`에 해 반지름을 곱한 원이다. */
  pupil: Vec3;
  /** 흰자 중심에서 검은자 중심까지의 평면 위 거리 (해 반지름 단위). 테스트용 */
  pupilOffset: [number, number];
}

/**
 * 검은자가 흰자 안에서 움직일 거리. 해에서 대상을 향하는 방향을 빌보드 평면에 투영한다.
 * 대상이 화면 안쪽(해와 카메라를 잇는 선)에 가까울수록 가운데에 온다. 흰자 밖으로 나가지 않는다.
 */
export function pupilOffset(basis: BillboardBasis, sunPosition: Vec3, target: Vec3): [number, number] {
  const toTarget = sub(target, sunPosition);
  const distance = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);
  if (distance < 1e-6) return [0, 0];
  const dir = scale(toTarget, 1 / distance);
  const u = dot(dir, basis.x);
  const v = dot(dir, basis.y);
  const [rx, ry] = SUN_FACE.whiteRadius;
  const range = SUN_FACE.pupilRadius + SUN_FACE.pupilMargin;
  // (u, v)는 단위 원 안에 있으므로 타원 반지름을 곱하면 검은자가 흰자 안에 머문다.
  return [u * (rx - range), v * (ry - range)];
}

/** 해 얼굴의 두 눈 [왼쪽, 오른쪽]. `target`은 검은자가 바라볼 곳(캐릭터)이다. */
export function sunEyes(sunPosition: Vec3, radius: number, basis: BillboardBasis, target: Vec3): SunEye[] {
  const { eyeSpacing, eyeHeight, whiteDepth, pupilDepth } = SUN_FACE;
  const offset = pupilOffset(basis, sunPosition, target);
  const at = (u: number, v: number, depth: number): Vec3 =>
    add(sunPosition, scale(add(add(scale(basis.x, u), scale(basis.y, v)), scale(basis.z, depth)), radius));
  return [-eyeSpacing, eyeSpacing].map((u) => ({
    white: at(u, eyeHeight, whiteDepth),
    pupil: at(u + offset[0], eyeHeight + offset[1], pupilDepth),
    pupilOffset: offset,
  }));
}
