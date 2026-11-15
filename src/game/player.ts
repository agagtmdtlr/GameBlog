import {
  add,
  cross,
  dot,
  length,
  normalize,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  QUAT_IDENTITY,
  scale,
  sub,
  type Quat,
  type Vec3,
} from '../engine/math';
import { reflectVelocity, sphereVsSphere, type Sphere } from '../physics/collision';

export const PLAYER_RADIUS = 0.65;

const GROUND_ACCELERATION = 26;
const AIR_ACCELERATION = 9;
const GROUND_DRAG = 2.4;
const AIR_DRAG = 0.25;
const GRAVITY = 22;
const RESTITUTION = 0.45;
const REST_THRESHOLD = 2.0;
/** 바닥에서 잠깐 떠도(튕김, 가장자리) 지면 가속과 감쇠를 유지하는 시간 */
const GROUND_GRACE_SECONDS = 0.1;

export interface MoveCommand {
  /** 월드 기준 이동 방향. 크기는 1 이하. 표면에 접하는 성분만 쓰인다. */
  direction: Vec3;
}

export class Player {
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3 = [0, 0, 0];
  orientation: Quat = QUAT_IDENTITY;
  previousOrientation: Quat = QUAT_IDENTITY;
  grounded = false;

  /** 공중에서도 회전이 이어지도록 마지막 각속도를 기억한다. */
  private angularVelocity: Vec3 = [0, 0, 0];
  private groundGrace = 0;

  /** 마지막으로 닿은 표면의 법선. 구르는 회전축을 정한다. */
  private groundNormal: Vec3 = [0, 1, 0];

  constructor(spawn: Vec3) {
    this.position = spawn;
    this.previousPosition = spawn;
  }

  /** @param ground 구가 굴러다니는 행성. 중력은 그 중심을 향한다. */
  step(dt: number, command: MoveCommand, ground: Sphere): void {
    this.previousPosition = this.position;
    this.previousOrientation = this.orientation;

    const onGround = this.groundGrace > 0;
    const acceleration = onGround ? GROUND_ACCELERATION : AIR_ACCELERATION;
    const drag = onGround ? GROUND_DRAG : AIR_DRAG;
    const damping = Math.max(0, 1 - drag * dt);

    // 속도를 행성 중심 방향(수직)과 표면에 접하는 방향(수평)으로 나눠 다룬다.
    const up = normalize(sub(this.position, ground.center));
    const tangent = (v: Vec3): Vec3 => sub(v, scale(up, dot(v, up)));
    const vertical = dot(this.velocity, up) - GRAVITY * dt;
    const horizontal = scale(
      add(tangent(this.velocity), scale(tangent(command.direction), acceleration * dt)),
      damping,
    );

    this.velocity = add(horizontal, scale(up, vertical));
    this.position = add(this.position, scale(this.velocity, dt));
    this.resolveCollision(ground);

    this.groundGrace = this.grounded ? GROUND_GRACE_SECONDS : Math.max(0, this.groundGrace - dt);
    this.integrateRotation(dt);
  }

  private resolveCollision(ground: Sphere): void {
    const contact = sphereVsSphere(this.position, PLAYER_RADIUS, ground);
    this.grounded = contact !== null;
    if (!contact) return;
    this.position = add(this.position, scale(contact.normal, contact.depth));
    this.velocity = reflectVelocity(this.velocity, contact.normal, RESTITUTION, REST_THRESHOLD);
    this.groundNormal = contact.normal;
  }

  private integrateRotation(dt: number): void {
    if (this.grounded) {
      // 미끄러짐 없는 구름: 각속도 = (접촉 법선 x 속도) / 반지름
      this.angularVelocity = scale(cross(this.groundNormal, this.velocity), 1 / PLAYER_RADIUS);
    }
    const speed = length(this.angularVelocity);
    if (speed < 1e-5) return;
    const axis = scale(this.angularVelocity, 1 / speed);
    const delta = quatFromAxisAngle(axis, speed * dt);
    this.orientation = quatNormalize(quatMultiply(delta, this.orientation));
  }
}
