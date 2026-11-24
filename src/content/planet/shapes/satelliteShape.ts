import type { Profile } from './dreamShape';

/** 인공위성 접시 안테나의 모양. three.js를 쓰지 않는다. */
export const SATELLITE_DISH = {
  /** 가장자리가 가운데보다 내려간 깊이 (반지름 1 기준) */
  depth: 0.38,
  /** 접시 껍질의 두께 */
  thickness: 0.06,
  /** 단면을 나누는 수 */
  segments: 16,
};

/**
 * 접시 안테나의 단면. 반지름 1, 오목한 쪽이 -Y를 본다(우산 꼴).
 * 오목면을 가운데에서 가장자리로, 등면을 가장자리에서 가운데로 돌아 닫힌 껍질을 만든다.
 * 회전체가 바깥을 보도록 `moundProfile`과 같은 방향(반시계)으로 돈다.
 */
export function dishProfile(): Profile {
  const { depth, thickness, segments: n } = SATELLITE_DISH;
  const points: Profile = [];
  for (let i = 0; i <= n; i++) {
    const r = i / n;
    points.push([r, -depth * r * r]);
  }
  for (let i = n; i >= 0; i--) {
    const r = i / n;
    points.push([r, thickness - depth * r * r]);
  }
  return points;
}
