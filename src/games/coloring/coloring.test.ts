import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  CARS,
  carPose,
  cityParts,
  LOOP,
  lampPoses,
  loopLength,
  loopPose,
  outward,
  partNeighbors,
  ROAD_HALF_WIDTH,
  SIDEWALK_WIDTH,
  walkerPose,
  WALKERS,
} from './city';
import { ColoringState } from './coloringState';
import { CAMERA_BOUNDS, FreeCamera } from './freeCamera';
import { hslToRgb, PALETTE_SIZE, randomPalette } from './palette';

/** 같은 씨앗이면 같은 수를 내는 난수 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('순환 도로', () => {
  const length = loopLength();

  it('한 바퀴 돌면 제자리이고, 길을 따라 끊기지 않는다', () => {
    const start = loopPose(0, 2);
    const end = loopPose(length, 2);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.z).toBeCloseTo(start.z, 6);
    const steps = 2000;
    for (let i = 0; i < steps; i++) {
      const a = loopPose((i / steps) * length);
      const b = loopPose(((i + 1) / steps) * length);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(length / steps, 4);
    }
  });

  it('나아가는 방향은 다음 자리를 가리키고, 바깥쪽은 그 오른쪽이다', () => {
    for (let s = 0; s < length; s += 7.3) {
      const a = loopPose(s);
      const b = loopPose(s + 0.01);
      const heading = Math.atan2(-(b.z - a.z), b.x - a.x);
      expect(Math.cos(heading - a.heading)).toBeCloseTo(1, 4);
      // 바깥쪽 자리는 가운데(원점)에서 더 멀다.
      const [ox, oz] = outward(a.heading);
      expect(Math.hypot(a.x + ox, a.z + oz)).toBeGreaterThan(Math.hypot(a.x, a.z));
    }
  });

  it('위에서 보면 반시계로 돈다 (+x → -z)', () => {
    expect(loopPose(0).x).toBeCloseTo(0);
    expect(loopPose(0).z).toBeCloseTo(LOOP.halfZ);
    const quarter = loopPose(length / 4);
    expect(quarter.x).toBeGreaterThan(0);
    expect(quarter.z).toBeLessThan(0);
  });
});

describe('도시 배치', () => {
  const parts = cityParts();

  it('칠할 조각에 하늘, 해, 차, 가로등, 사람이 모두 있다', () => {
    const shapes = new Set(parts.map((p) => p.shape));
    for (const shape of ['sky', 'sun', 'road', 'carBody', 'lampHead', 'personBody'] as const) expect(shapes).toContain(shape);
    expect(parts.filter((p) => p.shape === 'carBody')).toHaveLength(CARS.length);
    expect(parts.filter((p) => p.shape === 'personHead')).toHaveLength(WALKERS.length);
  });

  it('같은 무리의 조각끼리만 이웃이다', () => {
    const neighbors = partNeighbors(parts);
    parts.forEach((part, i) => {
      for (const n of neighbors[i]) expect(parts[n - 1].group).toBe(part.group);
    });
    const body = parts.findIndex((p) => p.shape === 'carBody');
    expect(neighbors[body]).toContain(body + 2);
  });

  it('차는 도로 위, 사람은 인도 위에 있다', () => {
    for (let t = 0; t < 60; t += 1.7) {
      for (const car of CARS) {
        const lane = car.lane;
        expect(Math.abs(lane)).toBeLessThan(ROAD_HALF_WIDTH - 1);
        expect(Number.isFinite(carPose(car, t).x)).toBe(true);
      }
      for (const walker of WALKERS) {
        const edge = Math.abs(walker.offset);
        expect(edge).toBeGreaterThan(ROAD_HALF_WIDTH + 0.3);
        expect(edge).toBeLessThan(ROAD_HALF_WIDTH + SIDEWALK_WIDTH - 0.3);
        expect(walkerPose(walker, t).bob).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('같은 차선의 차는 서로 떨어져 달린다', () => {
    for (let t = 0; t < 40; t += 0.5) {
      for (let i = 0; i < CARS.length; i++) {
        for (let j = i + 1; j < CARS.length; j++) {
          if (CARS[i].lane !== CARS[j].lane) continue;
          const a = carPose(CARS[i], t);
          const b = carPose(CARS[j], t);
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(8);
        }
      }
    }
  });

  it('건물은 인도 바깥에 있다', () => {
    const length = loopLength();
    const outer = ROAD_HALF_WIDTH + SIDEWALK_WIDTH;
    for (const { position, size } of BUILDINGS) {
      for (let s = 0; s < length; s += 1) {
        const edge = loopPose(s, outer);
        const inX = Math.abs(edge.x - position[0]) < size[0] / 2;
        const inZ = Math.abs(edge.z - position[2]) < size[2] / 2;
        expect(inX && inZ, `건물 ${position}`).toBe(false);
      }
    }
  });

  it('가로등은 고르게 놓인다', () => {
    const lamps = lampPoses();
    expect(lamps.length).toBeGreaterThan(3);
    for (const lamp of lamps) expect(Number.isFinite(lamp.heading)).toBe(true);
  });
});

describe('자유 시점 카메라', () => {
  it('처음에는 해 쪽(-z)을 본다', () => {
    const camera = new FreeCamera();
    expect(camera.forward[2]).toBeLessThan(-0.9);
  });

  it('왼쪽으로 돌면 -x 쪽을 보고, 고개는 거의 수직까지만 든다', () => {
    const camera = new FreeCamera({ position: [0, 5, 0], yaw: 0, pitch: 0 });
    camera.look(Math.PI / 2, 0);
    expect(camera.forward[0]).toBeCloseTo(-1);
    camera.look(0, 10);
    expect(camera.forward[1]).toBeLessThan(1);
    expect(camera.forward[1]).toBeGreaterThan(0.99);
  });

  it('보는 방향으로 움직이고, 범위 밖으로는 나가지 못한다', () => {
    const camera = new FreeCamera({ position: [0, 5, 0], yaw: 0, pitch: 0 });
    camera.move(10, 0, 0);
    expect(camera.position[2]).toBeCloseTo(-10);
    camera.move(0, 3, 0);
    expect(camera.position[0]).toBeCloseTo(3);
    camera.move(0, 0, -100);
    expect(camera.position[1]).toBe(CAMERA_BOUNDS.minY);
    camera.move(1000, 0, 0);
    expect(Math.hypot(camera.position[0], camera.position[2])).toBeCloseTo(CAMERA_BOUNDS.radius);
  });
});

describe('색칠 상태', () => {
  // 1-2-3 이 줄로 이웃한 세 조각
  const neighbors = [[2], [1, 3], [2]];

  it('모든 조각을 칠하면 완성이다', () => {
    const state = new ColoringState(neighbors, 4, seeded(1));
    expect(state.isComplete).toBe(false);
    state.paint(1);
    state.paint(1);
    expect(state.filledCount).toBe(1);
    state.paint(2);
    state.paint(3);
    expect(state.isComplete).toBe(true);
    expect(state.unfilledRegions()).toEqual([]);
  });

  it('다시 누르면 다른 색이고, 이웃과 같은 색은 피한다', () => {
    const state = new ColoringState(neighbors, 3, seeded(7));
    for (let i = 0; i < 50; i++) {
      const region = 1 + (i % 3);
      const before = state.colorOf(region);
      const color = state.paint(region);
      expect(color).not.toBe(before);
      for (const n of neighbors[region - 1]) expect(color).not.toBe(state.colorOf(n));
    }
  });

  it('피할 색이 모자라면 지금 색만 피한다', () => {
    const state = new ColoringState([[2, 3], [1, 3], [1, 2]], 2, seeded(3));
    state.paint(2);
    state.paint(3);
    const before = state.colorOf(1);
    expect(state.paint(1)).not.toBe(before);
  });
});

describe('색 묶음', () => {
  it('판마다 다른 색을 0~1 범위로 뽑는다', () => {
    const a = randomPalette(seeded(1));
    const b = randomPalette(seeded(2));
    expect(a).toHaveLength(PALETTE_SIZE);
    expect(a).not.toEqual(b);
    for (const color of [...a, ...b]) for (const c of color) expect(c).toBeGreaterThanOrEqual(0), expect(c).toBeLessThanOrEqual(1);
  });

  it('너무 어두운 색은 없다 (선이 보이도록)', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const [r, g, b] of randomPalette(seeded(seed))) expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeGreaterThan(0.2);
    }
  });

  it('HSL을 sRGB로 바꾼다', () => {
    expect(hslToRgb(0, 1, 0.5).map((c) => +c.toFixed(3))).toEqual([1, 0, 0]);
    expect(hslToRgb(120, 1, 0.5).map((c) => +c.toFixed(3))).toEqual([0, 1, 0]);
    expect(hslToRgb(240, 0, 1).map((c) => +c.toFixed(3))).toEqual([1, 1, 1]);
  });
});
