import type { Vec3 } from '../engine/math';
import type { OrientedBox } from '../physics/collision';
import { surfaceBox, type SurfaceSpot } from './house';
import { MOON } from './moon';

const [mx, my, mz] = MOON.direction;

/**
 * 로켓이 놓일 자리. 지금은 로켓 모델 대신 정육면체로 자리만 표시한다.
 * 위성 바로 아래 표면에 있어, 로켓이 위성을 향해 곧게 서게 된다.
 * 위치는 `MOON.direction`에서 계산하므로 위성을 옮기면 따라간다.
 */
export const ROCKET: SurfaceSpot = {
  latitude: (Math.asin(my) * 180) / Math.PI,
  longitude: (Math.atan2(mx, mz) * 180) / Math.PI,
  size: [2.4, 2.4, 2.4] as Vec3,
  sink: 0.1,
};

/** 로켓 자리 상자. 그리기와 충돌에 같은 값을 쓴다. */
export function rocketBox(): OrientedBox {
  return surfaceBox(ROCKET);
}
