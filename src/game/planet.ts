import type { Vec3 } from '../engine/math';
import type { Sphere } from '../physics/collision';

/** 구가 굴러다니는 행성. 중심은 원점이고 중력은 중심을 향한다. */
export const PLANET: Sphere = { center: [0, 0, 0], radius: 18 };

/**
 * 위도와 경도(도)를 행성 중심에서 표면을 향하는 단위 벡터로 바꾼다.
 * 위도 90이 시작 지점(+Y)이고, 경도 180이 시작할 때 바라보는 방향(-Z)이다.
 */
export function surfaceDirection(latitude: number, longitude: number): Vec3 {
  const lat = (latitude * Math.PI) / 180;
  const lon = (longitude * Math.PI) / 180;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}
