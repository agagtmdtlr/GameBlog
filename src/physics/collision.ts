import { add, clamp, dot, length, scale, sub, type Vec3 } from '../engine/math';

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export interface Contact {
  /** 상자에서 구를 향하는 단위 법선 */
  normal: Vec3;
  depth: number;
}

export function sphereVsAabb(center: Vec3, radius: number, box: AABB): Contact | null {
  const closest: Vec3 = [
    clamp(center[0], box.min[0], box.max[0]),
    clamp(center[1], box.min[1], box.max[1]),
    clamp(center[2], box.min[2], box.max[2]),
  ];
  const delta = sub(center, closest);
  const distance = length(delta);
  if (distance >= radius) return null;
  if (distance > 0) return { normal: scale(delta, 1 / distance), depth: radius - distance };
  return resolveCenterInside(center, radius, box);
}

/** 중심이 상자 안에 들어간 경우 가장 가까운 면으로 밀어낸다. */
function resolveCenterInside(center: Vec3, radius: number, box: AABB): Contact {
  let bestDistance = Infinity;
  let normal: Vec3 = [0, 1, 0];
  for (let axis = 0; axis < 3; axis++) {
    const toMax = box.max[axis] - center[axis];
    const toMin = center[axis] - box.min[axis];
    if (toMax < bestDistance) {
      bestDistance = toMax;
      normal = axisNormal(axis, 1);
    }
    if (toMin < bestDistance) {
      bestDistance = toMin;
      normal = axisNormal(axis, -1);
    }
  }
  return { normal, depth: bestDistance + radius };
}

function axisNormal(axis: number, sign: number): Vec3 {
  return [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0];
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
