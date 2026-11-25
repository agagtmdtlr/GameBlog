import { describe, expect, it } from 'vitest';
import { dot, length, normalize, type Vec3 } from '../../../engine/math';
import { PLANET } from '../planet';
import { BLADE_STRIDE, buildGrassField, cellsWithin, GRASS_FIELD, grassField } from './grass';
import { BARE_SPOTS, DREAM_PROPS, terrainHeight } from './terrain';
import { Wind, windAxis, windStrength, WIND } from './wind';

const R = PLANET.radius;
const surfaceDistance = (a: Vec3, b: Vec3): number => R * Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

function rootOf(blades: Float32Array, i: number): Vec3 {
  const o = i * BLADE_STRIDE;
  return [blades[o], blades[o + 1], blades[o + 2]];
}

describe('잔디밭', () => {
  const field = grassField();

  it('행성을 빽빽하게 덮는다', () => {
    const area = 4 * Math.PI * R * R;
    expect(field.count).toBeGreaterThan(area * GRASS_FIELD.density * 0.8);
    expect(field.blades.length).toBe(field.count * BLADE_STRIDE);
  });

  it('같은 시드로 늘 같은 잔디밭을 만든다', () => {
    const again = buildGrassField();
    expect(again.count).toBe(field.count);
    expect(again.blades.subarray(0, 700)).toEqual(field.blades.subarray(0, 700));
  });

  it('셀이 포기를 빈틈없이 순서대로 나눠 담는다', () => {
    let next = 0;
    for (const cell of field.cells) {
      expect(cell.start).toBe(next);
      next += cell.count;
    }
    expect(next).toBe(field.count);
  });

  it('뿌리가 땅 높이에 있고 자기 셀 안에 있다', () => {
    for (const cell of field.cells) {
      for (let i = cell.start; i < cell.start + cell.count; i += 97) {
        const root = rootOf(field.blades, i);
        const dir = normalize(root);
        expect(length(root) - (R + terrainHeight(dir))).toBeCloseTo(-GRASS_FIELD.sink, 3);
        expect(surfaceDistance(dir, cell.center)).toBeLessThanOrEqual(cell.radius + 1e-6);
      }
    }
  });

  it('선로·표면 객체 자리와 큰 지형물 아래에는 잔디가 없다', () => {
    const bigProps = DREAM_PROPS.filter((p) => p.shape !== 'pebble');
    let violations = 0;
    for (let i = 0; i < field.count; i += 29) {
      const dir = normalize(rootOf(field.blades, i));
      for (const spot of BARE_SPOTS) {
        if (surfaceDistance(dir, spot.direction) <= spot.radius + GRASS_FIELD.bareEdge[0]) violations++;
      }
      for (const prop of bigProps) {
        if (surfaceDistance(dir, prop.direction) <= prop.footprint * GRASS_FIELD.propClear) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('키와 폭이 정한 범위 안이다', () => {
    for (let i = 0; i < field.count; i += 11) {
      const o = i * BLADE_STRIDE;
      expect(field.blades[o + 4]).toBeGreaterThan(0);
      expect(field.blades[o + 4]).toBeLessThanOrEqual(GRASS_FIELD.tallHeight[1]);
      expect(field.blades[o + 5]).toBeGreaterThanOrEqual(GRASS_FIELD.width[0]);
      expect(field.blades[o + 6]).toBeLessThan(1);
    }
  });

  it('시작 지점에도 잔디가 있고, 그 둘레 셀을 고를 수 있다', () => {
    const picked = cellsWithin(field.cells, [0, 1, 0], 12);
    expect(picked.length).toBeGreaterThan(0);
    const blades = picked.reduce((sum, i) => sum + field.cells[i].count, 0);
    expect(blades).toBeGreaterThan(1000);
    // 행성 반대편 셀은 고르지 않는다.
    for (const i of picked) expect(field.cells[i].center[1]).toBeGreaterThan(0);
  });
});

describe('바람', () => {
  it('세기가 잔잔함과 거셈 사이를 오간다', () => {
    let min = 1;
    let max = 0;
    for (let t = 0; t < 200; t += 0.25) {
      const s = windStrength(t);
      min = Math.min(min, s);
      max = Math.max(max, s);
    }
    expect(min).toBeCloseTo(WIND.calm, 2);
    expect(max).toBeGreaterThan(0.95);
  });

  it('축은 단위 벡터이고 시작 지점(+Y)에서 바람이 분다', () => {
    for (let t = 0; t < WIND.axisPeriod; t += 7) {
      const axis = windAxis(t);
      expect(length(axis)).toBeCloseTo(1, 6);
      expect(Math.abs(axis[1])).toBeLessThan(0.5);
    }
  });

  it('첫 화면에서 바람이 불고, 돌풍 띠가 앞으로 나아간다', () => {
    const wind = new Wind();
    expect(wind.frame(1).strength).toBeGreaterThan(0.5);
    const before = wind.frame(1).gustPhase;
    for (let i = 0; i < 120; i++) wind.step(1 / 120);
    const after = wind.frame(1);
    expect(after.gustPhase).toBeGreaterThan(before);
    expect(after.time).toBeCloseTo(WIND.startTime + 1, 6);
    // 사이 값은 지난 단계와 이번 단계 사이다.
    const half = wind.frame(0.5);
    expect(half.time).toBeLessThan(after.time);
  });
});
