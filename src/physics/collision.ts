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

/** 방향이 있는 상자. 축은 정규직교이고, 각 축 방향으로 `halfExtents`만큼 퍼져 있다. */
export interface OrientedBox {
  center: Vec3;
  axes: readonly [Vec3, Vec3, Vec3];
  halfExtents: Vec3;
}

/** 움직이는 구와 고정된 상자의 충돌. 구의 중심이 상자 안에 있으면 가장 얕은 면으로 밀어낸다. */
export function sphereVsBox(center: Vec3, radius: number, box: OrientedBox): Contact | null {
  const delta = sub(center, box.center);
  const [ax, ay, az] = box.axes;
  const local: Vec3 = [dot(delta, ax), dot(delta, ay), dot(delta, az)];
  const clamp = (i: number): number => Math.max(-box.halfExtents[i], Math.min(box.halfExtents[i], local[i]));
  const clamped: Vec3 = [clamp(0), clamp(1), clamp(2)];
  const inside = clamped.every((v, i) => v === local[i]);

  if (!inside) {
    const offset = box.axes.reduce<Vec3>((sum, axis, i) => add(sum, scale(axis, local[i] - clamped[i])), [0, 0, 0]);
    const distance = length(offset);
    if (distance >= radius) return null;
    return { normal: scale(offset, 1 / distance), depth: radius - distance };
  }

  let axisIndex = 0;
  let shallowest = Infinity;
  for (let i = 0; i < 3; i++) {
    const toFace = box.halfExtents[i] - Math.abs(local[i]);
    if (toFace < shallowest) {
      shallowest = toFace;
      axisIndex = i;
    }
  }
  const sign = local[axisIndex] < 0 ? -1 : 1;
  return { normal: scale(box.axes[axisIndex], sign), depth: shallowest + radius };
}
