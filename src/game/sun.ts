import { add, cross, normalize, scale, type Vec3 } from '../engine/math';

/** 행성 둘레를 도는 해. 직사광의 방향은 항상 행성 중심에서 해를 향한다. */
export const SUN = {
  /** 행성 중심에서 해까지의 거리 */
  orbitRadius: 70,
  /** 해 구체의 반지름 */
  radius: 4,
  /** 한 바퀴 도는 데 걸리는 시간 (초) */
  periodSeconds: 120,
};

/**
 * 해의 색 (선형 RGB). 빛을 받지 않고 스스로 빛나는 주황색이다.
 * 셰이더의 ACES 톤 매핑이 밝은 값을 눌러 노랗게 만들므로 세기를 1 가까이로 둔다.
 */
export const SUN_EMISSIVE: Vec3 = [1.2, 0.18, 0.01];
/** 해 궤적 고리의 색 (선형 RGB). 해보다 어두운 주황색이다. */
export const SUN_ORBIT_EMISSIVE: Vec3 = [0.35, 0.07, 0.006];

/** 행성 중심을 도는 해. 궤도는 시작 방향과 시작 지점(+Y) 위를 지나는 대원이다. */
export class Sun {
  /** 시작할 때 해가 있는 방향 */
  readonly start: Vec3;
  /** 궤도면 안에서 `start`와 직교하고, 해가 나아가는 쪽의 방향 */
  readonly ahead: Vec3;
  /** 궤도면의 법선. `start`, `ahead`와 함께 오른손 좌표계를 이룬다. */
  readonly axis: Vec3;
  private angle = 0;
  private previousAngle = 0;

  constructor(startDirection: Vec3) {
    this.start = normalize(startDirection);
    // 시작 방향에서 +Y(시작 지점의 머리 위)를 향해 떠오르도록 돈다.
    const up: Vec3 = [0, 1, 0];
    this.axis = normalize(cross(this.start, up));
    this.ahead = cross(this.axis, this.start);
  }

  step(dt: number): void {
    this.previousAngle = this.angle;
    this.angle = (this.angle + (2 * Math.PI * dt) / SUN.periodSeconds) % (2 * Math.PI);
    // 한 바퀴를 넘어 각도가 0으로 돌아가면 보간이 거꾸로 돌지 않도록 이전 각도도 함께 당긴다.
    if (this.angle < this.previousAngle) this.previousAngle -= 2 * Math.PI;
  }

  /** 행성 중심에서 해를 향하는 단위 벡터. 직사광의 방향이다. */
  direction(alpha = 1): Vec3 {
    const angle = this.previousAngle + (this.angle - this.previousAngle) * alpha;
    return normalize(add(scale(this.start, Math.cos(angle)), scale(this.ahead, Math.sin(angle))));
  }

  /** 해 구체의 중심 */
  position(alpha = 1): Vec3 {
    return scale(this.direction(alpha), SUN.orbitRadius);
  }
}
