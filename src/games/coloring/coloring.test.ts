import { describe, expect, it } from 'vitest';
import {
  CAMERA_RADIUS,
  DOOR,
  doorOpenness,
  doorRegion,
  DOORWAY,
  HOUSE,
  houseParts,
  houseWalls,
  insideWall,
  inRoom,
  partNeighbors,
  ROOM,
  walkerPose,
  WALKERS,
  YARD_RADIUS,
} from './house';
import { ColoringState } from './coloringState';
import { CAMERA_BOUNDS, FreeCamera } from './freeCamera';
import { hslToRgb, PALETTE_SIZE, randomPalette } from './palette';
import { COLORING_RECORDS, emptyColoringStats, type ColoringPlay } from './records';

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

describe('집 배치', () => {
  const parts = houseParts();

  it('바깥에는 하늘·해·문·사람이, 안에는 방과 가구가 있다', () => {
    const names = new Set(parts.map((p) => p.name));
    for (const name of ['sky', 'sun', 'facade', 'door', 'lampHeadLeft', 'person0Head', 'floor', 'tableTop', 'sofa', 'books', 'clock'])
      expect(names).toContain(name);
    expect(names.size).toBe(parts.length);
    expect(parts.filter((p) => p.owner.kind === 'walker' && p.name.endsWith('Head'))).toHaveLength(WALKERS.length);
    expect(parts.filter((p) => p.owner.kind === 'door')).toHaveLength(1);
    expect(parts.filter((p) => p.inside).length).toBeGreaterThan(15);
  });

  it('같은 무리의 조각끼리만 이웃이다', () => {
    const neighbors = partNeighbors(parts);
    parts.forEach((part, i) => {
      for (const n of neighbors[i]) expect(parts[n - 1].group).toBe(part.group);
    });
    const top = parts.findIndex((p) => p.name === 'tableTop');
    expect(neighbors[top]).toContain(parts.findIndex((p) => p.name === 'tableLegs') + 1);
  });

  it('문의 영역 번호는 문 조각을 가리킨다', () => {
    expect(parts[doorRegion(parts) - 1].name).toBe('door');
  });

  it('방 안 가구는 방 안에, 바깥 물건은 건물 밖 마당에 놓인다', () => {
    for (const part of parts) {
      if (part.owner.kind !== 'static' || part.geometry.kind !== 'solids') continue;
      const [x, , z] = part.owner.position;
      if (part.inside) {
        expect(Math.abs(x), part.name).toBeLessThanOrEqual(ROOM.halfX);
        expect(Math.abs(z), part.name).toBeLessThanOrEqual(ROOM.halfZ);
      } else if (x !== 0 || z !== 0) {
        const outside = Math.abs(x) > HOUSE.width / 2 || Math.abs(z) > HOUSE.depth / 2;
        expect(outside, part.name).toBe(true);
        expect(Math.hypot(x, z), part.name).toBeLessThan(YARD_RADIUS);
      }
    }
  });

  it('사람은 건물과 부딪히지 않게 마당을 돈다', () => {
    const walls = houseWalls(false);
    for (let t = 0; t < 80; t += 0.9) {
      for (const walker of WALKERS) {
        const pose = walkerPose(walker, t);
        expect(insideWall(walls, [pose.x, 1, pose.z], 0.5)).toBe(false);
        expect(Math.hypot(pose.x, pose.z)).toBeLessThan(YARD_RADIUS);
        expect(pose.bob).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('문', () => {
  it('칠하기 전에는 닫혀 있고, 칠한 뒤 잠깐 있다가 다 열린다', () => {
    expect(doorOpenness(null, 100)).toBe(0);
    expect(doorOpenness(10, 10 + DOOR.delay * 0.5)).toBe(0);
    const middle = doorOpenness(10, 10 + DOOR.delay + DOOR.seconds / 2);
    expect(middle).toBeGreaterThan(0.2);
    expect(middle).toBeLessThan(1);
    expect(doorOpenness(10, 10 + DOOR.delay + DOOR.seconds)).toBe(1);
    expect(doorOpenness(-Infinity, 0)).toBe(1);
  });

  it('닫힌 문은 막고, 열린 문으로는 지나갈 수 있다', () => {
    const doorway: [number, number, number] = [0, 1.7, HOUSE.depth / 2 - HOUSE.wall / 2];
    expect(insideWall(houseWalls(false), doorway)).toBe(true);
    expect(insideWall(houseWalls(true), doorway)).toBe(false);
    // 문 옆 벽은 늘 막는다.
    expect(insideWall(houseWalls(true), [2, 1.7, doorway[2]])).toBe(true);
  });

  it('드나드는 길은 벽에 닿지 않고, 방 안 자리는 방 안이다', () => {
    const walls = houseWalls(true);
    const path = [DOORWAY.outside, DOORWAY.front, DOORWAY.inside];
    for (let i = 1; i < path.length; i++) {
      for (let k = 0; k <= 50; k++) {
        const a = path[i - 1];
        const b = path[i];
        const p: [number, number, number] = [0, 1, 2].map((axis) => a[axis] + ((b[axis] - a[axis]) * k) / 50) as [number, number, number];
        expect(insideWall(walls, p, CAMERA_RADIUS * 0.9)).toBe(false);
      }
    }
    expect(inRoom(DOORWAY.inside)).toBe(true);
    expect(inRoom(DOORWAY.outside)).toBe(false);
  });
});

describe('자유 시점 카메라', () => {
  it('처음에는 건물 앞 마당에서 건물 쪽(-z)을 본다', () => {
    const camera = new FreeCamera();
    expect(camera.forward[2]).toBeLessThan(-0.9);
    expect(camera.position[2]).toBeGreaterThan(HOUSE.depth / 2);
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

  it('벽에 부딪히면 멈추고, 벽을 따라서는 미끄러진다', () => {
    const walls = houseWalls(false);
    const camera = new FreeCamera({ position: [3, 1.7, 8], yaw: 0, pitch: 0 });
    camera.move(10, 0, 0, walls);
    expect(camera.position[2]).toBeGreaterThanOrEqual(HOUSE.depth / 2 + CAMERA_RADIUS - 1e-9);
    expect(camera.position[2]).toBeLessThan(HOUSE.depth / 2 + CAMERA_RADIUS + 0.5);
    // 비스듬히 밀면 벽을 따라 옆으로 간다.
    camera.yaw = Math.PI / 4;
    const x = camera.position[0];
    camera.move(2, 0, 0, walls);
    expect(camera.position[0]).toBeLessThan(x - 1);
  });

  it('닫힌 문으로는 못 들어가고, 열린 문으로는 들어간다', () => {
    const closed = new FreeCamera({ position: [0, 1.7, 8], yaw: 0, pitch: 0 });
    closed.move(8, 0, 0, houseWalls(false));
    expect(inRoom(closed.position)).toBe(false);
    const open = new FreeCamera({ position: [0, 1.7, 8], yaw: 0, pitch: 0 });
    for (let i = 0; i < 40; i++) open.move(0.2, 0, 0, houseWalls(true));
    expect(inRoom(open.position)).toBe(true);
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

describe('색칠 기록', () => {
  const play = (extra: Partial<ColoringPlay> = {}): ColoringPlay => ({
    cleared: true,
    paints: 80,
    seconds: 120,
    palette: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    colors: [0, 1, 0],
    ...extra,
  });
  const times = { startedAt: 0, endedAt: 1 };

  it('끝난 판을 누적 수치에 더하고 가장 빠른 시간을 고른다', () => {
    let stats = emptyColoringStats();
    stats = COLORING_RECORDS.accumulate(stats, play(), times);
    stats = COLORING_RECORDS.accumulate(stats, play({ cleared: false, seconds: 10, paints: 3 }), times);
    stats = COLORING_RECORDS.accumulate(stats, play({ seconds: 90 }), times);
    expect(stats).toEqual({ plays: 3, clears: 2, paints: 163, fastestClear: 90, totalSeconds: 220 });
  });

  it('색 번호가 색 묶음 밖인 기록은 버린다', () => {
    const migrate = COLORING_RECORDS.migrate!;
    expect(migrate('play', 1, play())).toEqual(play());
    expect(migrate('play', 1, play({ colors: [0, 2] }))).toBeUndefined();
    expect(migrate('progress', 1, { palette: play().palette, colors: [-1, 1], paints: 1, seconds: 2, startedAt: 3 })).toBeTruthy();
    expect(migrate('progress', 1, { palette: [[2, 0, 0]], colors: [0], paints: 1, seconds: 2, startedAt: 3 })).toBeUndefined();
    expect(migrate('stats', 1, { ...emptyColoringStats(), fastestClear: -1 })).toBeUndefined();
  });

  it('칠한 상태를 저장하고 되돌린다', () => {
    const neighbors = [[2], [1, 3], [2]];
    const state = new ColoringState(neighbors, 4, () => 0.3);
    state.paint(2);
    const saved = state.snapshot();
    const again = new ColoringState(neighbors, 4, () => 0.3);
    expect(again.restore(saved)).toBe(true);
    expect(again.filledCount).toBe(1);
    expect(again.colorOf(2)).toBe(state.colorOf(2));
    expect(again.restore([0, 0])).toBe(false);
    expect(again.restore([0, 9, 0])).toBe(false);
    expect(again.filledCount).toBe(1);
  });
});
