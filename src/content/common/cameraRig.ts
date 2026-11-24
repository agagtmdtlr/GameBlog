import type { CameraView } from '../../engine/frame';
import {
  add,
  clamp,
  cross,
  dot,
  lerp,
  normalize,
  quatFromAxisAngle,
  quatRotateVec3,
  scale,
  sub,
  type Vec3,
} from '../../engine/math';
import { groundRadius, type Ground } from '../../engine/physics/collision';

const DISTANCE = 10;
const MIN_PITCH = 0.1;
const MAX_PITCH = 1.25;
const LOOK_SENSITIVITY = 0.0025;
const FOLLOW_RATE = 9;
const TARGET_HEIGHT = 0.6;
const FOV_Y = (55 * Math.PI) / 180;
/** 카메라가 언덕 속으로 들어가지 않도록 땅에서 띄우는 최소 높이 */
const GROUND_CLEARANCE = 0.8;

/**
 * 구를 따라가는 3인칭 궤도 카메라.
 * 행성 위에서는 위쪽이 위치마다 다르므로, 좌우 각도 대신 표면에 접하는 진행 방향을 들고 다닌다.
 */
export class CameraRig {
  pitch = 0.42;
  private target: Vec3;
  /** 대상이 있는 곳의 위쪽 (행성 중심에서 바깥으로) */
  private up: Vec3;
  /** 카메라가 바라보는 수평 방향. 항상 `up`에 수직이다. */
  private heading: Vec3;

  /**
   * @param center 행성의 중심
   * @param ground 높낮이가 있는 땅. 주면 카메라가 땅 속으로 들어가지 않게 띄운다.
   */
  constructor(
    initialTarget: Vec3,
    private readonly center: Vec3,
    private readonly ground?: Ground,
  ) {
    this.target = initialTarget;
    this.up = normalize(sub(initialTarget, center));
    this.heading = this.tangent([0, 0, -1]);
  }

  get forward(): Vec3 {
    return this.heading;
  }

  get right(): Vec3 {
    return cross(this.heading, this.up);
  }

  get position(): Vec3 {
    const offset = add(
      scale(this.heading, -Math.cos(this.pitch)),
      scale(this.up, Math.sin(this.pitch)),
    );
    const position = add(this.lookTarget, scale(offset, DISTANCE));
    if (!this.ground) return position;
    const fromCenter = sub(position, this.center);
    const dir = normalize(fromCenter);
    const lowest = groundRadius(this.ground, dir) + GROUND_CLEARANCE;
    const distance = Math.hypot(fromCenter[0], fromCenter[1], fromCenter[2]);
    return distance >= lowest ? position : add(this.center, scale(dir, lowest));
  }

  private get lookTarget(): Vec3 {
    return add(this.target, scale(this.up, TARGET_HEIGHT));
  }

  applyLook(deltaX: number, deltaY: number): void {
    const turn = quatFromAxisAngle(this.up, -deltaX * LOOK_SENSITIVITY);
    this.heading = this.tangent(quatRotateVec3(turn, this.heading));
    this.pitch = clamp(this.pitch + deltaY * LOOK_SENSITIVITY, MIN_PITCH, MAX_PITCH);
  }

  /** 프레임 시간에 무관한 지수 감쇠로 대상을 따라간다. */
  follow(target: Vec3, frameSeconds: number): void {
    this.target = lerp(this.target, target, 1 - Math.exp(-FOLLOW_RATE * frameSeconds));
    // 위쪽이 바뀐 만큼 진행 방향을 새 접평면으로 옮긴다. 극점 같은 특이점이 없다.
    this.up = normalize(sub(this.target, this.center));
    this.heading = this.tangent(this.heading);
  }

  /** 벡터에서 `up` 성분을 빼고 정규화한다. */
  private tangent(v: Vec3): Vec3 {
    return normalize(sub(v, scale(this.up, dot(v, this.up))));
  }

  /** 렌더러가 카메라를 놓는 데 쓰는 값 */
  get view(): CameraView {
    return {
      position: this.position,
      target: this.lookTarget,
      up: this.up,
      fovY: FOV_Y,
      near: 0.1,
      far: 400,
    };
  }
}
