import {
  add,
  cross,
  length,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  QUAT_IDENTITY,
  scale,
  type Quat,
  type Vec3,
} from '../engine/math';
import { reflectVelocity, sphereVsAabb, type AABB } from '../physics/collision';

export const PLAYER_RADIUS = 0.65;

const GROUND_ACCELERATION = 26;
const AIR_ACCELERATION = 9;
const GROUND_DRAG = 2.4;
const AIR_DRAG = 0.25;
const GRAVITY = 22;
const JUMP_SPEED = 8.4;
const RESTITUTION = 0.45;
const REST_THRESHOLD = 2.0;
const JUMP_GRACE_SECONDS = 0.1;
const GROUND_NORMAL_MIN_Y = 0.7;

export interface MoveCommand {
  /** 월드 기준 이동 방향. 크기는 1 이하 */
  direction: Vec3;
  jumpPressed: boolean;
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
  private coyoteTime = 0;
  private jumpBuffer = 0;

  constructor(private readonly spawn: Vec3) {
    this.position = spawn;
    this.previousPosition = spawn;
  }

  respawn(): void {
    this.position = this.spawn;
    this.previousPosition = this.spawn;
    this.velocity = [0, 0, 0];
    this.angularVelocity = [0, 0, 0];
    this.coyoteTime = 0;
    this.jumpBuffer = 0;
    this.grounded = false;
  }

  step(dt: number, command: MoveCommand, colliders: readonly AABB[]): void {
    this.previousPosition = this.position;
    this.previousOrientation = this.orientation;

    const onGround = this.coyoteTime > 0;
    const acceleration = onGround ? GROUND_ACCELERATION : AIR_ACCELERATION;
    const drag = onGround ? GROUND_DRAG : AIR_DRAG;
    const damping = Math.max(0, 1 - drag * dt);
    let [vx, vy, vz] = this.velocity;
    vx = (vx + command.direction[0] * acceleration * dt) * damping;
    vz = (vz + command.direction[2] * acceleration * dt) * damping;
    vy -= GRAVITY * dt;

    if (command.jumpPressed) this.jumpBuffer = JUMP_GRACE_SECONDS;
    if (this.jumpBuffer > 0 && this.coyoteTime > 0) {
      vy = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyoteTime = 0;
    }

    this.velocity = [vx, vy, vz];
    this.position = add(this.position, scale(this.velocity, dt));
    this.resolveCollisions(colliders);

    this.coyoteTime = this.grounded ? JUMP_GRACE_SECONDS : Math.max(0, this.coyoteTime - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.integrateRotation(dt);
  }

  private resolveCollisions(colliders: readonly AABB[]): void {
    this.grounded = false;
    for (const box of colliders) {
      const contact = sphereVsAabb(this.position, PLAYER_RADIUS, box);
      if (!contact) continue;
      this.position = add(this.position, scale(contact.normal, contact.depth));
      this.velocity = reflectVelocity(this.velocity, contact.normal, RESTITUTION, REST_THRESHOLD);
      if (contact.normal[1] > GROUND_NORMAL_MIN_Y) this.grounded = true;
    }
  }

  private integrateRotation(dt: number): void {
    if (this.grounded) {
      // 미끄러짐 없는 구름: 각속도 = (접촉 법선 x 속도) / 반지름
      this.angularVelocity = scale(cross([0, 1, 0], this.velocity), 1 / PLAYER_RADIUS);
    }
    const speed = length(this.angularVelocity);
    if (speed < 1e-5) return;
    const axis = scale(this.angularVelocity, 1 / speed);
    const delta = quatFromAxisAngle(axis, speed * dt);
    this.orientation = quatNormalize(quatMultiply(delta, this.orientation));
  }
}
