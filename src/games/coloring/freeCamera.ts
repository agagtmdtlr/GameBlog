import type { Vec3 } from './city';

/**
 * 자유 시점 카메라의 상태 (three.js 없음). 고개 돌리기(yaw, pitch)와 이동만 다룬다.
 * yaw 0이면 -z(해 쪽)를 본다. pitch가 양수면 위를 본다.
 */

/** 이동할 수 있는 범위 */
export const CAMERA_BOUNDS = { radius: 140, minY: 1.2, maxY: 70 } as const;
const MAX_PITCH = (85 * Math.PI) / 180;

export interface CameraPose {
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
}

export const START_POSE: CameraPose = { position: [0, 9, 46], yaw: 0, pitch: -0.12 };

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
   * 범위를 벗어나면 가장자리에 멈춘다.
   */
  move(forward: number, strafe: number, up: number): void {
    const [fx, fy, fz] = this.forward;
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const p = this.position;
    p[0] += fx * forward + rx * strafe;
    p[1] += fy * forward + up;
    p[2] += fz * forward + rz * strafe;
    p[1] = Math.max(CAMERA_BOUNDS.minY, Math.min(CAMERA_BOUNDS.maxY, p[1]));
    const distance = Math.hypot(p[0], p[2]);
    if (distance > CAMERA_BOUNDS.radius) {
      p[0] *= CAMERA_BOUNDS.radius / distance;
      p[2] *= CAMERA_BOUNDS.radius / distance;
    }
  }
}
