import { add, dot, normalize, scale, sub, type Vec3 } from '../engine/math';
import { reflectVelocity, sphereVsSphere, type Sphere } from '../physics/collision';
import { CHARACTER_SCALE } from './walker';

/**
 * 충돌 구의 반지름. 다리가 몸을 받치는 높이이기도 하다.
 * 구의 중심이 캐릭터 몸의 중심이고, 표면에서 이만큼 떠 있다.
 */
export const PLAYER_RADIUS = 0.88 * CHARACTER_SCALE;

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
  grounded = false;

  private groundGrace = 0;

  constructor(spawn: Vec3) {
    this.position = spawn;
    this.previousPosition = spawn;
  }

  /** @param ground 캐릭터가 걸어 다니는 행성. 중력은 그 중심을 향한다. */
  step(dt: number, command: MoveCommand, ground: Sphere): void {
    this.previousPosition = this.position;

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
  }

  private resolveCollision(ground: Sphere): void {
    const contact = sphereVsSphere(this.position, PLAYER_RADIUS, ground);
    this.grounded = contact !== null;
    if (!contact) return;
    this.position = add(this.position, scale(contact.normal, contact.depth));
    this.velocity = reflectVelocity(this.velocity, contact.normal, RESTITUTION, REST_THRESHOLD);
  }
}
