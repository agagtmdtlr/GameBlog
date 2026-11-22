import { add, lerp, scale, type Vec3 } from '../engine/math';

/**
 * 기차 굴뚝에서 피어오르는 연기. 일정한 간격으로 작은 구름 공(퍼프)을 내보내고,
 * 퍼프는 내보낸 자리(월드)에 남아 위로 떠오르며 커졌다가 줄어들어 사라진다.
 * 기차가 앞으로 가므로 퍼프가 뒤에 남아 연기 꼬리가 된다.
 */
export const SMOKE = {
  /** 퍼프를 내보내는 간격 (초) */
  interval: 0.14,
  /** 퍼프 하나가 사는 시간 (초) */
  lifetime: 1.8,
  /** 처음과 가장 클 때의 반지름 */
  startRadius: 0.1,
  maxRadius: 0.42,
  /** 처음에 떠오르는 빠르기와 그 감쇠 (1/초) */
  riseSpeed: 1.6,
  drag: 1.4,
  /** 퍼프마다 옆으로 흩어지는 빠르기 */
  wobble: 0.35,
  /** 수명의 마지막 이 비율 동안 줄어들어 사라진다. */
  shrinkFraction: 0.3,
  /** 연기 색 (선형 RGB). 밝은 회색 */
  color: [0.78, 0.78, 0.8] as Vec3,
  roughness: 1,
};

/** 퍼프를 내보내는 자리와 방향 */
export interface SmokeSource {
  position: Vec3;
  /** 표면 바깥 방향. 퍼프가 이쪽으로 떠오른다. */
  up: Vec3;
  right: Vec3;
  forward: Vec3;
}

interface Puff {
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  age: number;
}

/** 그릴 퍼프 하나 */
export interface PuffModel {
  position: Vec3;
  radius: number;
}

/** 퍼프 반지름. `t`는 수명에 대한 나이 비율(0~1)이다. 빨리 부풀었다가 끝에서 0으로 줄어든다. */
export function puffRadius(t: number): number {
  if (t <= 0) return SMOKE.startRadius;
  if (t >= 1) return 0;
  const grow = 1 - (1 - t) ** 3;
  const fade = Math.min(1, (1 - t) / SMOKE.shrinkFraction);
  return (SMOKE.startRadius + (SMOKE.maxRadius - SMOKE.startRadius) * grow) * fade;
}

export class SmokeTrail {
  private puffs: Puff[] = [];
  private timer = 0;
  private emitted = 0;
  private lastDt = 0;

  /** 퍼프를 움직이고, 간격이 차면 `source`에서 새 퍼프를 내보낸다. */
  step(dt: number, source: SmokeSource): void {
    this.lastDt = dt;
    const damping = Math.exp(-SMOKE.drag * dt);
    for (const puff of this.puffs) {
      puff.previousPosition = puff.position;
      puff.velocity = scale(puff.velocity, damping);
      puff.position = add(puff.position, scale(puff.velocity, dt));
      puff.age += dt;
    }
    this.puffs = this.puffs.filter((puff) => puff.age < SMOKE.lifetime);

    this.timer += dt;
    while (this.timer >= SMOKE.interval) {
      this.timer -= SMOKE.interval;
      this.emit(source);
    }
  }

  private emit({ position, up, right, forward }: SmokeSource): void {
    // 황금각만큼씩 돌려 퍼프마다 흩어지는 방향이 고르게 다르다. 무작위가 아니라 늘 같은 모양이다.
    const angle = this.emitted++ * 2.39996;
    const side = add(scale(right, Math.cos(angle) * SMOKE.wobble), scale(forward, Math.sin(angle) * SMOKE.wobble));
    this.puffs.push({
      position,
      previousPosition: position,
      velocity: add(scale(up, SMOKE.riseSpeed), side),
      age: 0,
    });
  }

  /** 살아 있는 퍼프의 자리와 크기. 렌더링 보간을 적용한다. */
  models(alpha = 1): PuffModel[] {
    const back = this.lastDt * (1 - alpha);
    return this.puffs.map((puff) => ({
      position: lerp(puff.previousPosition, puff.position, alpha),
      radius: puffRadius(Math.max(0, puff.age - back) / SMOKE.lifetime),
    }));
  }
}
