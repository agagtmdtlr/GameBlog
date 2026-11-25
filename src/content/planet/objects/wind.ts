import { normalize, type Vec3 } from '../../../engine/math';

/**
 * 행성을 감도는 바람. 바람은 행성을 축(`axis`) 둘레로 돌아 흐르고, 세기가 잦아들었다 거세지기를 되풀이한다.
 * 센 바람의 물결(돌풍 띠)이 바람 방향으로 땅을 훑고 지나가며 잔디를 눕힌다.
 * GPU 없이 시간만으로 정하므로 같은 시간이면 늘 같은 바람이다.
 */
export const WIND = {
  /** 바람 축이 행성 둘레를 한 바퀴 도는 시간(초). 축이 돌아 바람 방향이 천천히 바뀐다. */
  axisPeriod: 150,
  /** 바람 축의 위(+Y) 성분. 작을수록 축이 수평에 가까워 시작 지점(+Y)에 바람이 세다. */
  axisLift: 0.3,
  /** 가장 잔잔할 때와 가장 거셀 때의 세기 (0~1) */
  calm: 0.12,
  peak: 1,
  /** 바람이 불었다 잦아드는 두 겹의 주기(초) */
  cycles: [21, 34] as const,
  /** 첫 화면에서 바람이 불고 있도록 시작 시간을 당긴다. */
  startTime: 5,
  /** 돌풍 띠가 축 둘레로 나아가는 빠르기 (라디안/초). 바람이 셀수록 빨라진다. */
  gustSpeed: [0.35, 1.1] as const,
};

/** 렌더러에 넘기는 한 프레임의 바람 */
export interface WindFrame {
  /** 바람이 감도는 축 (단위 벡터). 땅의 바람 방향은 `axis × 위쪽`이다. */
  axis: Vec3;
  /** 0~1 */
  strength: number;
  /** 돌풍 띠의 위상 (라디안). 셰이더가 축 둘레 각도에서 뺀다. */
  gustPhase: number;
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

/** 시간 `t`의 바람 축 */
export function windAxis(t: number): Vec3 {
  const phi = (2 * Math.PI * t) / WIND.axisPeriod;
  return normalize([Math.cos(phi), WIND.axisLift, Math.sin(phi)]);
}

export class Wind {
  private time = WIND.startTime;
  private gustPhase = 0;
  private previousTime = WIND.startTime;
  private previousGustPhase = 0;

  step(dt: number): void {
    this.previousTime = this.time;
    this.previousGustPhase = this.gustPhase;
    const [slow, fast] = WIND.gustSpeed;
    this.gustPhase += dt * (slow + (fast - slow) * windStrength(this.time));
    this.time += dt;
  }

  /** 지난 단계와 이번 단계 사이(`alpha`)의 바람 */
  frame(alpha: number): WindFrame {
    const time = this.previousTime + (this.time - this.previousTime) * alpha;
    return {
      axis: windAxis(time),
      strength: windStrength(time),
      gustPhase: this.previousGustPhase + (this.gustPhase - this.previousGustPhase) * alpha,
      time,
    };
  }
}
