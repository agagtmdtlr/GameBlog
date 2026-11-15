import { add, dot, length, normalize, scale, sub, type Vec3 } from '../engine/math';

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

function clampLength(v: Vec3, limit: number): Vec3 {
  const len = length(v);
  return len > limit ? scale(v, limit / len) : v;
}

/** 구 안에 차오르는 물의 상태. 차오름, 출렁임, 물결을 진행한다. */
export class WaterFill {
  /** 0이면 비어 있고 1이면 다 찼다. */
  amount = 0;
  time = 0;
  ripple = 0;

  private target = 0;
  private up: Vec3 = [0, 1, 0];
  /** 수면 법선이 `up`에서 기운 정도. 항상 `up`에 수직이다. */
  private tilt: Vec3 = [0, 0, 0];
  private tiltVelocity: Vec3 = [0, 0, 0];

  setFilled(filled: boolean): void {
    this.target = filled ? 1 : 0;
  }

  /**
   * @param velocityChange 이번 스텝 동안 바뀐 구의 속도
   * @param up 중력의 반대 방향 (단위 벡터)
   */
  update(dt: number, velocityChange: Vec3, up: Vec3 = [0, 1, 0]): void {
    this.time += dt;
    const step = dt / FILL_SECONDS;
    this.amount =
      this.target > this.amount
        ? Math.min(this.target, this.amount + step)
        : Math.max(this.target, this.amount - step);

    // 행성 위를 구르면 위쪽이 계속 바뀐다. 기울기를 새 수평면으로 옮긴 뒤 진행한다.
    this.up = up;
    const horizontal = (v: Vec3): Vec3 => sub(v, scale(up, dot(v, up)));
    const acceleration = clampLength(horizontal(scale(velocityChange, 1 / dt)), MAX_ACCELERATION);
    const targetTilt = scale(acceleration, ACCELERATION_TO_TILT);
    const tilt = horizontal(this.tilt);
    const tiltVelocity = horizontal(this.tiltVelocity);
    const force = sub(
      scale(sub(targetTilt, tilt), SPRING_STIFFNESS),
      scale(tiltVelocity, SPRING_DAMPING),
    );
    this.tiltVelocity = add(tiltVelocity, scale(force, dt));
    this.tilt = clampLength(add(tilt, scale(this.tiltVelocity, dt)), MAX_TILT);

    this.ripple = Math.min(1, this.ripple + length(velocityChange) * IMPULSE_TO_RIPPLE);
    this.ripple *= Math.exp(-RIPPLE_DECAY * dt);
  }

  /** 수면 법선. 구의 회전과 무관하게 중력을 따르고, 가속 방향으로 기운다. */
  get surfaceNormal(): Vec3 {
    return normalize(add(this.up, this.tilt));
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
