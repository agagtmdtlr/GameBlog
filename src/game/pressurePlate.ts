import { clamp, dot, length, scale, sub, type Vec3 } from '../engine/math';

const SPRING_STIFFNESS = 260;
const SPRING_DAMPING = 18;
/** 구의 바닥이 발판 면에서 이 거리 안에 있을 때만 닿은 것으로 본다. */
const CONTACT_HEIGHT = 0.2;

/**
 * 발판의 상태. 구가 발판을 완전히 벗어나야 다시 작동하므로
 * 경계에서 구르거나 제자리에서 튀어도 반복 작동하지 않는다.
 */
export class PressurePlate {
  /** 0(올라옴) ~ 1(눌림) */
  depression = 0;
  private springVelocity = 0;
  private armed = true;

  /**
   * @param center 발판 면의 중심
   * @param normal 발판이 바라보는 방향 (단위 벡터)
   */
  constructor(
    readonly center: Vec3,
    readonly normal: Vec3,
    readonly radius: number,
  ) {}

  /** @returns 이번 스텝에서 작동했으면 true */
  update(dt: number, sphereCenter: Vec3, sphereRadius: number): boolean {
    const local = sub(sphereCenter, this.center);
    const height = dot(local, this.normal);
    const distance = length(sub(local, scale(this.normal, height)));
    // 높이를 양쪽으로 제한해, 행성 반대편의 구가 발판 축 위에 있어도 닿은 것으로 보지 않는다.
    const touching =
      distance < this.radius && Math.abs(height - sphereRadius) < CONTACT_HEIGHT;

    if (distance > this.radius + sphereRadius) this.armed = true;
    const activated = touching && this.armed;
    if (activated) this.armed = false;

    const target = touching ? 1 : 0;
    const force = SPRING_STIFFNESS * (target - this.depression) - SPRING_DAMPING * this.springVelocity;
    this.springVelocity += force * dt;
    this.depression = clamp(this.depression + this.springVelocity * dt, 0, 1);
    if (this.depression === 0 || this.depression === 1) this.springVelocity = 0;
    return activated;
  }
}
