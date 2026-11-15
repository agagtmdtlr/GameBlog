import { add, dot, length, scale, sub, type Vec3 } from '../engine/math';

export interface Sphere {
  center: Vec3;
  radius: number;
}

export interface Contact {
  /** 충돌체에서 구를 향하는 단위 법선 */
  normal: Vec3;
  depth: number;
}

/** 움직이는 구와 고정된 구(행성)의 충돌 */
export function sphereVsSphere(center: Vec3, radius: number, other: Sphere): Contact | null {
  const delta = sub(center, other.center);
  const distance = length(delta);
  const depth = radius + other.radius - distance;
  if (depth <= 0) return null;
  // 중심이 겹치면 방향을 정할 수 없으므로 위로 밀어낸다.
  const normal: Vec3 = distance > 1e-9 ? scale(delta, 1 / distance) : [0, 1, 0];
  return { normal, depth };
}

/**
 * 법선 방향 속도를 반사한다. 충돌 속도가 restThreshold보다 느리면 튕기지 않아
 * 구가 바닥에서 끝없이 미세하게 떨리지 않는다.
 */
export function reflectVelocity(
  velocity: Vec3,
  normal: Vec3,
  restitution: number,
  restThreshold: number,
): Vec3 {
  const normalSpeed = dot(velocity, normal);
  if (normalSpeed >= 0) return velocity;
  const bounce = -normalSpeed > restThreshold ? restitution : 0;
  return add(velocity, scale(normal, -(1 + bounce) * normalSpeed));
}
