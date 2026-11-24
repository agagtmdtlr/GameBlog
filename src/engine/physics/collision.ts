import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from '../math';

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

/**
 * 높낮이가 있는 행성 땅. 중심에서 방향 `dir`(단위 벡터)으로 나간 표면까지의 거리가
 * `radius + heightAt(dir)`이다. `heightAt`이 없으면 반지름 `radius`인 구다.
 */
export interface Ground extends Sphere {
  heightAt?(dir: Vec3): number;
}

/** 방향 `dir`의 표면이 중심에서 떨어진 거리 */
export function groundRadius(ground: Ground, dir: Vec3): number {
  return ground.radius + (ground.heightAt ? ground.heightAt(dir) : 0);
}

/** 법선을 차분으로 구할 때 옮기는 각도 (라디안) */
const NORMAL_STEP = 0.004;

/** 방향 `dir`의 표면에서 바깥을 향하는 단위 법선. 높이의 기울기를 중앙 차분으로 구한다. */
export function groundNormal(ground: Ground, dir: Vec3): Vec3 {
  if (!ground.heightAt) return dir;
  const helper: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = normalize(cross(helper, dir));
  const t2 = cross(dir, t1);
  const r = groundRadius(ground, dir);
  const slope = (t: Vec3): number => {
    const ahead = groundRadius(ground, normalize(add(dir, scale(t, NORMAL_STEP))));
    const behind = groundRadius(ground, normalize(add(dir, scale(t, -NORMAL_STEP))));
    return (ahead - behind) / (2 * NORMAL_STEP * r);
  };
  return normalize(sub(dir, add(scale(t1, slope(t1)), scale(t2, slope(t2)))));
}

/**
 * 움직이는 구와 높낮이가 있는 땅의 충돌. 구 아래 표면을 그 자리의 접평면으로 보고,
 * 구가 그 평면에 닿는 높이까지 중심 바깥 방향(위쪽)으로 밀어낸다. 법선도 위쪽이라
 * 비탈에서 미끄러지지 않고 캐릭터처럼 서 있다. 기울기가 완만하다고 가정한다.
 */
export function sphereVsGround(center: Vec3, radius: number, ground: Ground): Contact | null {
  if (!ground.heightAt) return sphereVsSphere(center, radius, ground);
  const delta = sub(center, ground.center);
  const distance = length(delta);
  const dir: Vec3 = distance > 1e-9 ? scale(delta, 1 / distance) : [0, 1, 0];
  const above = distance - groundRadius(ground, dir);
  if (above >= radius * 2) return null;
  // 기울기가 cos인 평면에 닿는 구의 중심은 표면에서 위쪽으로 radius / cos만큼 떠 있다.
  const cos = Math.max(dot(dir, groundNormal(ground, dir)), 0.5);
  const depth = radius / cos - above;
  if (depth <= 0) return null;
  return { normal: dir, depth };
}

/** 양 끝 `a`, `b`를 잇는 선분에서 `radius`만큼 퍼진 캡슐. `a`와 `b`가 같으면 구다. */
export interface Capsule {
  a: Vec3;
  b: Vec3;
  radius: number;
}

/** 움직이는 구와 고정된 캡슐의 충돌 */
export function sphereVsCapsule(center: Vec3, radius: number, capsule: Capsule): Contact | null {
  const axis = sub(capsule.b, capsule.a);
  const axisLength2 = dot(axis, axis);
  const t = axisLength2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(center, capsule.a), axis) / axisLength2)) : 0;
  return sphereVsSphere(center, radius, { center: add(capsule.a, scale(axis, t)), radius: capsule.radius });
}

/** 캐릭터가 통과할 수 없는 고정 물체 */
export type Obstacle = OrientedBox | Capsule;

/** 움직이는 구와 고정 물체의 충돌 */
export function sphereVsObstacle(center: Vec3, radius: number, obstacle: Obstacle): Contact | null {
  return 'axes' in obstacle ? sphereVsBox(center, radius, obstacle) : sphereVsCapsule(center, radius, obstacle);
}
