import {
  add,
  clamp,
  lerp,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  scale,
  type Mat4,
  type Vec3,
} from '../engine/math';

const DISTANCE = 10;
const MIN_PITCH = 0.1;
const MAX_PITCH = 1.25;
const LOOK_SENSITIVITY = 0.0025;
const FOLLOW_RATE = 9;
const TARGET_HEIGHT = 0.6;
const FOV_Y = (55 * Math.PI) / 180;

/** 구를 따라가는 3인칭 궤도 카메라 */
export class CameraRig {
  yaw = 0;
  pitch = 0.42;
  private target: Vec3;

  constructor(initialTarget: Vec3) {
    this.target = initialTarget;
  }

  get forward(): Vec3 {
    return [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
  }

  get right(): Vec3 {
    return [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
  }

  get position(): Vec3 {
    const cosPitch = Math.cos(this.pitch);
    const offset: Vec3 = [
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    ];
    return add(this.lookTarget, scale(offset, DISTANCE));
  }

  private get lookTarget(): Vec3 {
    return add(this.target, [0, TARGET_HEIGHT, 0]);
  }

  applyLook(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * LOOK_SENSITIVITY;
    this.pitch = clamp(this.pitch + deltaY * LOOK_SENSITIVITY, MIN_PITCH, MAX_PITCH);
  }

  /** 프레임 시간에 무관한 지수 감쇠로 대상을 따라간다. */
  follow(target: Vec3, frameSeconds: number): void {
    this.target = lerp(this.target, target, 1 - Math.exp(-FOLLOW_RATE * frameSeconds));
  }

  viewProjection(aspect: number): Mat4 {
    const view = mat4LookAt(this.position, this.lookTarget, [0, 1, 0]);
    return mat4Multiply(mat4Perspective(FOV_Y, aspect, 0.1, 400), view);
  }
}
