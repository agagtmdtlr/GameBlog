import { add, cross, normalize, scale, type Vec3 } from '../engine/math';
import type { BubbleFrame } from '../engine/frame';
import { createRandom } from '../engine/starfield';

/**
 * 행성을 소행성대처럼 감싸고 떠다니는 비눗방울 띠.
 * 방울은 띠의 축을 중심으로 느리게 공전하고, 저마다 위아래로 둥실거리며 조금씩 부풀었다 줄어든다.
 * 충돌은 없다. 카메라가 닿는 높이보다 바깥에 있다.
 */
export const BUBBLE_BELT = {
  /**
   * 띠 평면의 법선. 적도에서 조금 기울어 시작 화면의 지평선 위를 비스듬히 가로지르고,
   * 위성은 띠 평면에서 위쪽으로 충분히 떨어져 있다.
   */
  axis: normalize([-0.2, 0.95, 0.22]),
  count: 240,
  /** 행성 중심에서 띠 평면 위 거리의 범위. 카메라가 올라가는 높이(약 29)보다 바깥이다. */
  innerRadius: 32,
  outerRadius: 44,
  /** 띠 평면에서 벗어나는 높이의 최댓값 */
  thickness: 4,
  /** 방울 반지름 범위. 작은 것이 훨씬 많다. */
  minRadius: 0.18,
  maxRadius: 2.2,
  /** 작은 방울이 몰려 있는 무리의 수와 무리에 속하는 방울의 비율 */
  clusters: 14,
  clusterShare: 0.45,
  clusterSpread: 2.6,
  /** 안쪽 가장자리에서 한 바퀴 공전하는 시간 (초). 바깥일수록 느리다. */
  innerPeriodSeconds: 300,
  /** 둥실거리는 높이와 주기 범위 */
  bobAmplitude: [0.25, 0.9] as const,
  bobPeriodSeconds: [5, 11] as const,
  /** 부풀었다 줄어드는 비율 */
  breathe: 0.04,
  seed: 0xb0b1e,
};

interface BubbleSeed {
  /** 띠 평면 위 각도 (라디안) */
  angle: number;
  /** 띠 평면 위 거리 */
  distance: number;
  /** 띠 평면에서 벗어난 높이 */
  height: number;
  radius: number;
  /** 공전 각속도 (라디안/초) */
  angularSpeed: number;
  bobAmplitude: number;
  bobRate: number;
  phase: number;
  /** 막의 무지개 물결이 흐르는 빠르기 */
  swirlRate: number;
}

/** 띠 평면을 이루는 두 단위 벡터. `axis`와 함께 오른손 기저다. */
export function beltBasis(axis: Vec3 = BUBBLE_BELT.axis): { u: Vec3; v: Vec3 } {
  const helper: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u = normalize(cross(helper, axis));
  return { u, v: cross(axis, u) };
}

function generateSeeds(): BubbleSeed[] {
  const b = BUBBLE_BELT;
  const random = createRandom(b.seed);
  const range = (min: number, max: number) => min + (max - min) * random();
  // 가운데가 짙고 가장자리로 갈수록 옅은 분포 (-1~1)
  const centered = () => (random() + random() + random()) / 1.5 - 1;
  const clusters = Array.from({ length: b.clusters }, () => ({
    angle: range(0, 2 * Math.PI),
    distance: range(b.innerRadius + 2, b.outerRadius - 2),
    height: centered() * b.thickness * 0.5,
  }));

  return Array.from({ length: b.count }, (): BubbleSeed => {
    let angle: number;
    let distance: number;
    let height: number;
    // 크기는 거듭제곱 분포라 작은 방울이 많고 큰 방울은 드물다.
    let radius = b.minRadius + (b.maxRadius - b.minRadius) * Math.pow(random(), 3.2);
    if (random() < b.clusterShare) {
      const c = clusters[Math.floor(random() * clusters.length)];
      angle = c.angle + (centered() * b.clusterSpread) / c.distance;
      distance = c.distance + centered() * b.clusterSpread;
      height = c.height + centered() * b.clusterSpread * 0.6;
      radius = Math.min(radius, 0.9);
    } else {
      angle = range(0, 2 * Math.PI);
      distance = range(b.innerRadius, b.outerRadius);
      height = centered() * b.thickness;
    }
    distance = Math.min(b.outerRadius, Math.max(b.innerRadius, distance));
    height = Math.max(-b.thickness, Math.min(b.thickness, height));
    return {
      angle,
      distance,
      height,
      radius,
      // 케플러처럼 바깥이 느리다.
      angularSpeed: ((2 * Math.PI) / b.innerPeriodSeconds) * Math.pow(b.innerRadius / distance, 1.5),
      bobAmplitude: range(b.bobAmplitude[0], b.bobAmplitude[1]),
      bobRate: (2 * Math.PI) / range(b.bobPeriodSeconds[0], b.bobPeriodSeconds[1]),
      phase: range(0, 2 * Math.PI),
      swirlRate: range(0.04, 0.12) * (random() < 0.5 ? -1 : 1),
    };
  });
}

export class BubbleBelt {
  private readonly seeds = generateSeeds();
  private readonly basis = beltBasis();
  private time = 0;
  private previousTime = 0;

  step(dt: number): void {
    this.previousTime = this.time;
    this.time += dt;
  }

  /** 이번 프레임의 방울. 렌더링 보간을 적용한다. */
  bubbles(alpha = 1): BubbleFrame[] {
    const t = this.previousTime + (this.time - this.previousTime) * alpha;
    const { u, v } = this.basis;
    const axis = BUBBLE_BELT.axis;
    return this.seeds.map((s) => {
      const angle = s.angle + s.angularSpeed * t;
      const bob = s.bobAmplitude * Math.sin(s.bobRate * t + s.phase);
      const sway = 0.3 * s.bobAmplitude * Math.sin(0.7 * s.bobRate * t + 2 * s.phase);
      const distance = s.distance + sway;
      const center = add(
        add(scale(u, Math.cos(angle) * distance), scale(v, Math.sin(angle) * distance)),
        scale(axis, s.height + bob),
      );
      return {
        center,
        radius: s.radius * (1 + BUBBLE_BELT.breathe * Math.sin(1.3 * s.bobRate * t + s.phase)),
        swirl: s.phase + s.swirlRate * t,
      };
    });
  }
}
