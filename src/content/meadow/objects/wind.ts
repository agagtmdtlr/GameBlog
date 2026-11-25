/**
 * 초원에 부는 바람. 방향이 천천히 흔들리고, 세기가 잦아들었다 거세지기를 되풀이한다.
 * 센 바람의 물결(돌풍 띠)이 바람 방향으로 초원을 훑고 지나가며 잔디를 눕힌다.
 * GPU 없이 시간만으로 정하므로 같은 시간이면 늘 같은 바람이다.
 */
export const WIND = {
  /** 바람이 불어 가는 기본 방향 (수평 각도, 라디안. 0이 +X, π/2가 +Z) */
  heading: -2.2,
  /** 방향이 기본 방향에서 오가는 폭과 주기(초) */
  headingSwing: 0.6,
  headingPeriod: 90,
  /** 가장 잔잔할 때와 가장 거셀 때의 세기 (0~1) */
  calm: 0.12,
  peak: 1,
  /** 바람이 불었다 잦아드는 두 겹의 주기(초) */
  cycles: [21, 34] as const,
  /** 첫 화면에서 바람이 불고 있도록 시작 시간을 당긴다. */
  startTime: 5,
  /** 돌풍 띠가 나아가는 빠르기 (단위/초). 바람이 셀수록 빠르다. */
  gustSpeed: [4, 11] as const,
};

/** 렌더러에 넘기는 한 프레임의 바람 */
export interface WindFrame {
  /** 바람이 불어 가는 수평 방향 (x, z 단위 벡터) */
  direction: [number, number];
  /** 0~1 */
  strength: number;
  /** 돌풍 띠가 바람 방향으로 나아간 거리 */
  gustTravel: number;
  /** 잎 떨림에 쓰는 흐른 시간(초) */
  time: number;
}

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** 시간 `t`의 바람 세기 (0~1) */
export function windStrength(t: number): number {
  const [a, b] = WIND.cycles;
  const wave = 0.6 * Math.sin((2 * Math.PI * t) / a) + 0.4 * Math.sin((2 * Math.PI * t) / b + 1.3);
  return WIND.calm + (WIND.peak - WIND.calm) * smoothstep(-0.55, 0.75, wave);
}

/** 시간 `t`의 바람 방향 */
export function windDirection(t: number): [number, number] {
  const angle = WIND.heading + WIND.headingSwing * Math.sin((2 * Math.PI * t) / WIND.headingPeriod);
  return [Math.cos(angle), Math.sin(angle)];
}

export class Wind {
  private time = WIND.startTime;
  private travel = 0;
  private previousTime = WIND.startTime;
  private previousTravel = 0;

  step(dt: number): void {
    this.previousTime = this.time;
    this.previousTravel = this.travel;
    const [slow, fast] = WIND.gustSpeed;
    this.travel += dt * (slow + (fast - slow) * windStrength(this.time));
    this.time += dt;
  }

  /** 지난 단계와 이번 단계 사이(`alpha`)의 바람 */
  frame(alpha: number): WindFrame {
    const time = this.previousTime + (this.time - this.previousTime) * alpha;
    return {
      direction: windDirection(time),
      strength: windStrength(time),
      gustTravel: this.previousTravel + (this.travel - this.previousTravel) * alpha,
      time,
    };
  }
}
