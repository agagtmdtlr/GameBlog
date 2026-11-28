import { insideWall, type Box, type Vec3 } from './house';

/**
 * 자유 시점 카메라의 상태 (three.js 없음). 고개 돌리기(yaw, pitch)와 이동만 다룬다.
 * yaw 0이면 -z(건물 쪽)를 본다. pitch가 양수면 위를 본다.
 */

/** 이동할 수 있는 범위: 건물 둘레 마당 조금 너머까지 */
export const CAMERA_BOUNDS = { radius: 30, minY: 1.2, maxY: 18 } as const;
const MAX_PITCH = (85 * Math.PI) / 180;
/** 벽이 있을 때 한 번에 움직이는 가장 긴 거리 (m). 가장 얇은 벽(두께 + 카메라 몸 지름)보다 짧아야 한다. */
const MAX_STEP = 0.2;

export interface CameraPose {
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
}

export const START_POSE: CameraPose = { position: [0, 3, 19], yaw: 0, pitch: -0.06 };

export class FreeCamera {
  position: [number, number, number];
  yaw: number;
  pitch: number;

  constructor(pose: CameraPose = START_POSE) {
    this.position = [...pose.position];
    this.yaw = pose.yaw;
    this.pitch = pose.pitch;
  }

  /** 보는 방향 단위 벡터 */
  get forward(): Vec3 {
    const c = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * c, Math.sin(this.pitch), -Math.cos(this.yaw) * c];
  }

  /** 고개를 돌린다 (라디안). 왼쪽·위가 양수 (three.js 카메라 rotation.y, rotation.x와 같은 뜻) */
  look(yaw: number, pitch: number): void {
    this.yaw += yaw;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + pitch));
  }

  /**
   * 움직인다 (미터). `forward`는 보는 방향(위아래 기울기 포함), `strafe`는 오른쪽, `up`은 곧장 위.
   * 범위를 벗어나면 가장자리에 멈추고, `walls`에 부딪히면 그 축으로는 나아가지 않는다 (벽을 따라 미끄러진다).
   */
  move(forward: number, strafe: number, up: number, walls: readonly Box[] = []): void {
    const [fx, fy, fz] = this.forward;
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const delta: Vec3 = [fx * forward + rx * strafe, fy * forward + up, fz * forward + rz * strafe];
    const p = this.position;
    // 한 번에 멀리 가면(휠, 두 손가락) 얇은 벽을 건너뛰므로 잘게 나눠 움직인다.
    const steps = walls.length === 0 ? 1 : Math.max(1, Math.ceil(Math.hypot(...delta) / MAX_STEP));
    for (let step = 0; step < steps; step++) {
      for (let axis = 0; axis < 3; axis++) {
        const before = p[axis];
        p[axis] += delta[axis] / steps;
        if (axis === 1) p[1] = Math.max(CAMERA_BOUNDS.minY, Math.min(CAMERA_BOUNDS.maxY, p[1]));
        // 이미 벽 안이면(문이 닫히는 순간 같은) 빠져나가는 움직임은 막지 않는다.
        if (delta[axis] !== 0 && insideWall(walls, p) && !insideWall(walls, withAxis(p, axis, before))) p[axis] = before;
      }
    }
    const distance = Math.hypot(p[0], p[2]);
    if (distance > CAMERA_BOUNDS.radius) {
      p[0] *= CAMERA_BOUNDS.radius / distance;
      p[2] *= CAMERA_BOUNDS.radius / distance;
    }
  }
}

function withAxis(p: Vec3, axis: number, value: number): Vec3 {
  const copy: [number, number, number] = [...p];
  copy[axis] = value;
  return copy;
}
