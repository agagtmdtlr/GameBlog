import { normalize, sub, type Vec3 } from '../../../engine/math';
import { meadowPoint } from './meadowTerrain';

/**
 * 초원 하늘 곳곳에 치는 번개. 몇 초마다 플레이어 둘레 하늘 한 곳에서 번개가 치고,
 * 그 순간 번개 쪽에서 센 빛이 비쳐 잔디·텔레비전·캐릭터가 함께 번쩍인다 (`MeadowWorld.environment`).
 * 어떤 번개는 구름 속에서만 번쩍이고(줄기 없음), 어떤 번개는 갈라진 줄기가 땅까지 내리꽂힌다.
 * 언제 어디에 칠지는 고정 시드와 번개 번호로 정하므로 같은 시드면 늘 같은 번개다. GPU와 DOM에 의존하지 않는다.
 */
export const LIGHTNING = {
  /** 번개 사이의 시간(초) 범위 */
  interval: [4, 12] as const,
  /** 첫 번개까지의 시간(초) */
  firstDelay: 2.5,
  /** 플레이어에서 번개까지의 수평 거리 범위 */
  distance: [60, 150] as const,
  /** 번개가 시작하는 구름 높이 범위 (땅 위) */
  cloudHeight: [55, 80] as const,
  /** 줄기가 땅까지 내리꽂힐 확률. 나머지는 구름 속에서만 번쩍인다. */
  boltChance: 0.65,
  /** 줄기를 나누는 마디 수와, 마디마다 옆으로 꺾이는 폭(마디 길이 단위) */
  segments: 16,
  zigzag: 0.55,
  /** 곁가지 수 범위와 곁가지 길이(줄기 대비) */
  branches: [1, 4] as const,
  branchLength: [0.2, 0.45] as const,
  /** 한 번개 안에서 번쩍이는 횟수 범위와, 번쩍임 하나가 잦아드는 시간 상수(초) */
  pulses: [2, 4] as const,
  pulseDecay: 0.07,
  /** 번개가 끝난 것으로 치는 시간(초) */
  duration: 0.9,
  /** 번개 빛의 색 (선형 RGB, 푸른 흰빛) */
  color: [0.78, 0.84, 1.0] as Vec3,
  /** 가장 밝을 때 더하는 빛: 직사광, 앰비언트, 하늘·안개 색(sRGB) */
  lightBoost: 4.5,
  ambientBoost: 0.55,
  backgroundBoost: 0.22,
  /** 가장 밝을 때 빛 방향이 번개 쪽으로 기우는 몫 */
  directionPull: 0.75,
  seed: 1752,
};

export interface LightningStrike {
  /** 친 시각 (초) */
  time: number;
  /** 구름 속 번쩍임의 가운데 (줄기가 시작하는 곳) */
  cloud: Vec3;
  /** 땅까지 내리꽂히는 줄기의 점들. 구름 속 번쩍임이면 비었다. */
  bolt: Vec3[];
  /** 줄기에서 갈라진 곁가지들 */
  branches: Vec3[][];
  /** 번쩍임들: 친 뒤 몇 초에, 얼마나 세게 (첫 번쩍임이 1) */
  pulses: { offset: number; strength: number }[];
}

/** 0 이상 1 미만의 수를 차례로 내는 고정 시드 난수 (mulberry32) */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: () => number, [lo, hi]: readonly [number, number]): number => lo + (hi - lo) * r();

/** 지그재그로 꺾이며 `from`에서 `to`로 가는 점들 */
function jagged(r: () => number, from: Vec3, to: Vec3, segments: number): Vec3[] {
  const points: Vec3[] = [from];
  const k = (LIGHTNING.zigzag * Math.hypot(...sub(to, from))) / segments;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    points.push([
      from[0] + (to[0] - from[0]) * t + (r() * 2 - 1) * k,
      from[1] + (to[1] - from[1]) * t + (r() * 2 - 1) * k * 0.4,
      from[2] + (to[2] - from[2]) * t + (r() * 2 - 1) * k,
    ]);
  }
  points.push(to);
  return points;
}

/** `index`번째 번개. 시드와 번호로 정해지고, 시각 `time`에 플레이어 `player` 둘레에 친다. */
export function lightningStrike(index: number, time: number, player: Vec3): LightningStrike {
  const r = random(Math.imul(index + 1, 0x9e3779b1) ^ LIGHTNING.seed);
  const angle = r() * Math.PI * 2;
  const distance = between(r, LIGHTNING.distance);
  const x = player[0] + Math.cos(angle) * distance;
  const z = player[2] + Math.sin(angle) * distance;
  const cloud = meadowPoint(x, z, between(r, LIGHTNING.cloudHeight));

  const pulseCount = Math.floor(between(r, [LIGHTNING.pulses[0], LIGHTNING.pulses[1] + 1]));
  const pulses = [{ offset: 0, strength: 1 }];
  let offset = 0;
  for (let i = 1; i < pulseCount; i++) {
    offset += 0.06 + r() * 0.14;
    pulses.push({ offset, strength: 0.35 + 0.6 * r() });
  }

  if (r() >= LIGHTNING.boltChance) return { time, cloud, bolt: [], branches: [], pulses };

  // 땅에 닿는 곳은 구름 바로 아래에서 조금 비껴 난다.
  const drift = distance * 0.12;
  const ground = meadowPoint(x + (r() * 2 - 1) * drift, z + (r() * 2 - 1) * drift, 0);
  const bolt = jagged(r, cloud, ground, LIGHTNING.segments);
  const boltLength = Math.hypot(...sub(ground, cloud));
  const branches: Vec3[][] = [];
  const branchCount = Math.floor(between(r, [LIGHTNING.branches[0], LIGHTNING.branches[1] + 1]));
  for (let i = 0; i < branchCount; i++) {
    // 곁가지는 줄기 위쪽 절반에서 갈라져 비스듬히 아래로 뻗는다.
    const start = bolt[1 + Math.floor(r() * (LIGHTNING.segments / 2))];
    const length = boltLength * between(r, LIGHTNING.branchLength) * 0.7;
    const a = r() * Math.PI * 2;
    const end: Vec3 = [start[0] + Math.cos(a) * length, start[1] - length, start[2] + Math.sin(a) * length];
    branches.push(jagged(r, start, end, 6));
  }
  return { time, cloud, bolt, branches, pulses };
}

/** 번개 `strike`의 시각 `time` 때 밝기 (0 이상, 첫 번쩍임의 꼭대기가 1) */
export function strikeFlash(strike: LightningStrike, time: number): number {
  const age = time - strike.time;
  if (age < 0 || age > LIGHTNING.duration) return 0;
  let flash = 0;
  for (const { offset, strength } of strike.pulses) {
    if (age >= offset) flash = Math.max(flash, strength * Math.exp(-(age - offset) / LIGHTNING.pulseDecay));
  }
  return flash;
}

/** 씬 시간에 맞춰 번개를 친다. `MeadowWorld`가 고정 단계마다 부른다. */
export class Lightning {
  private index = 0;
  private nextTime: number = LIGHTNING.firstDelay;
  /** 마지막으로 친 번개. 끝났어도 다음 번개가 칠 때까지 남는다. */
  current: LightningStrike | undefined;

  step(time: number, player: Vec3): void {
    if (time < this.nextTime) return;
    this.current = lightningStrike(this.index, this.nextTime, player);
    const r = random(Math.imul(this.index + 7, 0x85ebca6b) ^ LIGHTNING.seed);
    this.nextTime += between(r, LIGHTNING.interval);
    this.index++;
  }

  /** 시각 `time` 때 번개 밝기 (0이면 번개가 없다) */
  flash(time: number): number {
    return this.current ? strikeFlash(this.current, time) : 0;
  }

  /** `from`에서 지금 번개의 구름 쪽을 향하는 단위 벡터 */
  direction(from: Vec3): Vec3 | undefined {
    return this.current ? normalize(sub(this.current.cloud, from)) : undefined;
  }
}
