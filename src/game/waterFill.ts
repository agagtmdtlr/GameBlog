import { length, normalize, type Vec3 } from '../engine/math';

const FILL_SECONDS = 1.1;
const FADE_PORTION = 0.35;
const EMPTY_LEVEL = -1.05;
const FULL_LEVEL = 0.12;

// 가속도를 수면 기울기로 바꾸는 스프링. 약하게 감쇠해 멈춘 뒤에도 잠시 출렁인다.
const ACCELERATION_TO_TILT = 0.024;
const MAX_ACCELERATION = 60;
const MAX_TILT = 0.6;
const SPRING_STIFFNESS = 110;
const SPRING_DAMPING = 3.8;

const IMPULSE_TO_RIPPLE = 0.05;
const RIPPLE_DECAY = 2.5;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/** 구 안에 차오르는 물의 상태. 차오름, 출렁임, 물결을 진행한다. */
export class WaterFill {
  /** 0이면 비어 있고 1이면 다 찼다. */
  amount = 0;
  time = 0;
  ripple = 0;

  private target = 0;
  private tiltX = 0;
  private tiltZ = 0;
  private tiltVelocityX = 0;
  private tiltVelocityZ = 0;

  setFilled(filled: boolean): void {
    this.target = filled ? 1 : 0;
  }

  /** @param velocityChange 이번 스텝 동안 바뀐 구의 속도 */
  update(dt: number, velocityChange: Vec3): void {
    this.time += dt;
    const step = dt / FILL_SECONDS;
    this.amount =
      this.target > this.amount
        ? Math.min(this.target, this.amount + step)
        : Math.max(this.target, this.amount - step);

    const targetTiltX = clamp(velocityChange[0] / dt, MAX_ACCELERATION) * ACCELERATION_TO_TILT;
    const targetTiltZ = clamp(velocityChange[2] / dt, MAX_ACCELERATION) * ACCELERATION_TO_TILT;
    this.tiltVelocityX +=
      (SPRING_STIFFNESS * (targetTiltX - this.tiltX) - SPRING_DAMPING * this.tiltVelocityX) * dt;
    this.tiltVelocityZ +=
      (SPRING_STIFFNESS * (targetTiltZ - this.tiltZ) - SPRING_DAMPING * this.tiltVelocityZ) * dt;
    this.tiltX = clamp(this.tiltX + this.tiltVelocityX * dt, MAX_TILT);
    this.tiltZ = clamp(this.tiltZ + this.tiltVelocityZ * dt, MAX_TILT);

    this.ripple = Math.min(1, this.ripple + length(velocityChange) * IMPULSE_TO_RIPPLE);
    this.ripple *= Math.exp(-RIPPLE_DECAY * dt);
  }

  /** 수면 법선. 구의 회전과 무관하게 중력을 따르고, 가속 방향으로 기운다. */
  get surfaceNormal(): Vec3 {
    return normalize([this.tiltX, 1, this.tiltZ]);
  }

  /** 수면 높이 (구 반지름 기준, -1이 바닥) */
  get level(): number {
    return EMPTY_LEVEL + (FULL_LEVEL - EMPTY_LEVEL) * smoothstep(0, 1, this.amount);
  }

  /** 불투명한 구에서 투명한 구로 넘어가는 정도 */
  get opacity(): number {
    return smoothstep(0, FADE_PORTION, this.amount);
  }
}
