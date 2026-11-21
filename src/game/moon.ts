import { mat4FromTRS, normalize, quatFromAxisAngle, scale, type Mat4, type Vec3 } from '../engine/math';

/**
 * 행성 주변 하늘에 떠 있는 바위 위성. 충돌구가 패여 있고, 제자리에서 자전만 한다.
 * 모양은 `engine/moonShape.ts`가 정한다.
 */
export const MOON = {
  /**
   * 행성 중심에서 위성을 향하는 방향. 시작 시점의 왼쪽 위 하늘이고,
   * 해의 궤도면에서 멀리 떨어져 있어 해와 겹치지 않는다.
   */
  direction: normalize([-0.4, 0.5, -0.77]),
  /** 행성 중심에서 위성 중심까지의 거리 */
  distance: 40,
  /** 위성의 기본 반지름. 충돌구와 바위 덩어리가 ±15%쯤 바꾼다. */
  radius: 5,
  /** 자전축. 조금 기울어 있다. */
  spinAxis: normalize([0.25, 1, 0.15]),
  /** 한 바퀴 자전하는 데 걸리는 시간 (초) */
  spinPeriodSeconds: 90,
};

/** 위성 표면의 색 (선형 RGB). 행성보다 어두운 회색 */
export const MOON_COLOR: Vec3 = [0.3, 0.3, 0.31];
export const MOON_ROUGHNESS = 0.95;

export class Moon {
  readonly center: Vec3 = scale(MOON.direction, MOON.distance);
  private angle = 0;
  private previousAngle = 0;

  step(dt: number): void {
    this.previousAngle = this.angle;
    this.angle = (this.angle + (2 * Math.PI * dt) / MOON.spinPeriodSeconds) % (2 * Math.PI);
    if (this.angle < this.previousAngle) this.previousAngle -= 2 * Math.PI;
  }

  /** 자전 각도 (라디안). 렌더링 보간을 적용한다. */
  spin(alpha = 1): number {
    return this.previousAngle + (this.angle - this.previousAngle) * alpha;
  }

  /** 위성 메시(`moon`, 반지름 1 기준)의 모델 행렬 */
  model(alpha = 1): Mat4 {
    const r = MOON.radius;
    return mat4FromTRS(this.center, quatFromAxisAngle(MOON.spinAxis, this.spin(alpha)), [r, r, r]);
  }
}
