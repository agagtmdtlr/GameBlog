import type { Quat, Vec3 } from '../../../engine/math';
import { meadowPoint } from './meadowTerrain';

/**
 * 초원 하늘에 떠 있는 텔레비전들. 마그리트의 「골콩드」처럼 같은 모양이 격자를 이루며 허공에 떠 있다.
 * 미리 정한 자리는 없다. 플레이어 둘레의 하늘을 수평 칸으로 나누고, 플레이어가 다가와 칸이 스폰 반경에 들면
 * 그 칸 번호의 해시로 자리·높이·크기·회전을 정해 스폰하고, 멀어지면 없앤다.
 * 같은 칸은 늘 같은 텔레비전이 되므로 돌아와도 하늘이 그대로다. 먼 것은 안개가 가린다.
 * GPU와 DOM에 의존하지 않는다.
 */
export const SKY_TVS = {
  /** 하늘 칸 한 변의 길이 (수평) */
  cellSize: 17,
  /** 칸을 겹쳐 놓는 층. 층마다 땅 위 높이 범위와 칸을 어긋나게 둘 몫(칸 크기 단위)이 다르다. */
  layers: [
    { altitude: [7, 16] as const, offset: [0, 0] as const },
    { altitude: [20, 34] as const, offset: [0.5, 0.5] as const },
    { altitude: [40, 58] as const, offset: [0.25, 0.75] as const },
  ],
  /** 칸에 텔레비전이 있을 확률 */
  fill: 0.82,
  /** 칸 가운데에서 흩어지는 폭 (칸 크기 단위, ±) */
  jitter: 0.28,
  /** 텔레비전 크기 (한 변) */
  size: [2.4, 4.6] as const,
  /** 기울기의 최대 각 (라디안). 대부분은 거의 똑바로 서 있다. */
  maxTilt: 0.18,
  /** 플레이어에서 이 수평 거리 안의 칸에 스폰하고, `despawnRadius` 밖으로 나가면 없앤다. 안개 끝(125)보다 넉넉히 멀다. */
  spawnRadius: 165,
  despawnRadius: 180,
  /** 스폰된 텔레비전이 0에서 제 크기로 커지는 시간(초) */
  growSeconds: 1.6,
  seed: 1898,
};

export interface SkyTv {
  /** 칸 번호 (층, x, z) */
  key: string;
  /** 화면 가운데가 아닌, 텔레비전 상자의 가운데 */
  position: Vec3;
  rotation: Quat;
  size: number;
  /** 나무 색에 곱하는 값 (0.8~1.15) */
  tint: number;
  /** 둥실거림 위상 (라디안) */
  phase: number;
  /** 스폰된 시각 (초) */
  spawnedAt: number;
}

/** 정수 칸 번호에서 0 이상 1 미만의 수 여러 개 (고정 시드) */
function cellRandom(layer: number, ix: number, iz: number): () => number {
  let a = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(layer + 1, 0x9e3779b1) ^ SKY_TVS.seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 축 `axis`(단위 벡터) 둘레로 `angle`만큼 도는 사원수 */
function axisAngle([x, y, z]: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

function multiply([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * 칸 하나의 텔레비전. 칸이 비었으면 null. 같은 칸이면 늘 같은 값이다.
 * 칸의 수평 가운데는 `(ix + offset + 0.5) × cellSize`이다.
 */
export function skyTvAt(layer: number, ix: number, iz: number, spawnedAt = 0): SkyTv | null {
  const { cellSize, layers, fill, jitter, size, maxTilt } = SKY_TVS;
  const spec = layers[layer];
  const random = cellRandom(layer, ix, iz);
  if (random() >= fill) return null;
  const x = (ix + spec.offset[0] + 0.5 + (random() * 2 - 1) * jitter) * cellSize;
  const z = (iz + spec.offset[1] + 0.5 + (random() * 2 - 1) * jitter) * cellSize;
  const altitude = spec.altitude[0] + (spec.altitude[1] - spec.altitude[0]) * random();
  const s = size[0] + (size[1] - size[0]) * random();
  const yaw = random() * Math.PI * 2;
  // 기울기는 제곱해 작은 쪽에 몰리게 한다.
  const tilt = maxTilt * random() ** 2;
  const tiltAxis = random() * Math.PI * 2;
  const rotation = multiply(axisAngle([Math.cos(tiltAxis), 0, Math.sin(tiltAxis)], tilt), axisAngle([0, 1, 0], yaw));
  return {
    key: `${layer}:${ix}:${iz}`,
    position: meadowPoint(x, z, altitude),
    rotation,
    size: s,
    tint: 0.8 + 0.35 * random(),
    phase: random() * Math.PI * 2,
    spawnedAt,
  };
}

/** 플레이어 둘레 하늘의 텔레비전들. `update`가 플레이어 위치로 스폰하고 없앤다. */
export class SkyTvField {
  private readonly active = new Map<string, SkyTv>();
  /** 칸이 비었다고 정해진 것도 기억해 다시 계산하지 않는다. */
  private readonly empty = new Set<string>();

  /** 지금 떠 있는 텔레비전 */
  get tvs(): IterableIterator<SkyTv> {
    return this.active.values();
  }

  get count(): number {
    return this.active.size;
  }

  /**
   * 플레이어 위치 `(x, z)`로 스폰 반경 안의 칸을 채우고, 없앨 반경 밖의 텔레비전을 없앤다.
   * `time`은 스폰 시각으로 남는다. 스폰한 수와 없앤 수를 돌려준다.
   */
  update(player: Vec3, time: number): { spawned: number; despawned: number } {
    const { cellSize, layers, spawnRadius, despawnRadius } = SKY_TVS;
    const [px, , pz] = player;
    let despawned = 0;
    for (const [key, tv] of this.active) {
      if (Math.hypot(tv.position[0] - px, tv.position[2] - pz) > despawnRadius) {
        this.active.delete(key);
        despawned++;
      }
    }
    for (const key of this.empty) {
      const [layer, ix, iz] = key.split(':').map(Number);
      const { offset } = layers[layer];
      const cx = (ix + offset[0] + 0.5) * cellSize;
      const cz = (iz + offset[1] + 0.5) * cellSize;
      if (Math.hypot(cx - px, cz - pz) > despawnRadius + cellSize) this.empty.delete(key);
    }

    let spawned = 0;
    const reach = Math.ceil(spawnRadius / cellSize) + 1;
    layers.forEach(({ offset }, layer) => {
      const baseX = Math.floor(px / cellSize - offset[0]);
      const baseZ = Math.floor(pz / cellSize - offset[1]);
      for (let ix = baseX - reach; ix <= baseX + reach; ix++) {
        for (let iz = baseZ - reach; iz <= baseZ + reach; iz++) {
          const key = `${layer}:${ix}:${iz}`;
          if (this.active.has(key) || this.empty.has(key)) continue;
          const cx = (ix + offset[0] + 0.5) * cellSize;
          const cz = (iz + offset[1] + 0.5) * cellSize;
          if (Math.hypot(cx - px, cz - pz) > spawnRadius) continue;
          const tv = skyTvAt(layer, ix, iz, time);
          if (!tv) {
            this.empty.add(key);
            continue;
          }
          this.active.set(key, tv);
          spawned++;
        }
      }
    });
    return { spawned, despawned };
  }
}

/** 스폰된 지 `age`초인 텔레비전의 크기 비율 (0→1, 조금 넘쳤다 돌아온다) */
export function growScale(age: number): number {
  const t = Math.max(0, Math.min(1, age / SKY_TVS.growSeconds));
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}
