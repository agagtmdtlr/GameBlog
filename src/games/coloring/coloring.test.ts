import { describe, expect, it } from 'vitest';
import { ColoringState } from './coloringState';
import { hslToRgb, PALETTE_SIZE, randomPalette } from './palette';
import { PICTURES } from './pictures';
import { labelRegions, regionAt } from './regions';

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

/** 글자 그림으로 선 마스크를 만든다. `#`이 선이다. */
function mask(rows: string[]): { ink: Uint8Array; width: number; height: number } {
  const width = rows[0].length;
  const ink = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => [...row].forEach((c, x) => (ink[y * width + x] = c === '#' ? 1 : 0)));
  return { ink, width, height: rows.length };
}

describe('영역 나누기', () => {
  // 바깥 테두리 안에 세로선으로 나뉜 두 칸, 오른쪽 칸 안에 1픽셀 틈
  const picture = mask([
    '..........',
    '.########.',
    '.#...#...#',
    '.#...#.#.#',
    '.#...#...#',
    '.########.',
    '..........',
  ]);
  const map = labelRegions(picture.ink, picture.width, picture.height, { minArea: 2, neighborReach: 2 });

  it('액자 바깥은 영역이 아니고, 닫힌 칸마다 영역이 하나다', () => {
    expect(map.regions.length).toBe(2);
    expect(regionAt(map, 0, 0)).toBe(0);
    expect(regionAt(map, 2, 3)).not.toBe(regionAt(map, 6, 3));
    expect(regionAt(map, 2, 3)).toBeGreaterThan(0);
  });

  it('작은 틈은 선으로 합친다', () => {
    // 오른쪽 칸은 가운데 선(7,3)이 있지만 둘레로 이어져 한 영역이다. 넓이는 3 × 3 - 1
    const right = map.regions[regionAt(map, 6, 2) - 1];
    expect(right.area).toBe(8);
    const tiny = mask(['#####', '#.#.#', '#####', '#...#', '#####']);
    const tinyMap = labelRegions(tiny.ink, 5, 5, { minArea: 2, neighborReach: 2 });
    expect(tinyMap.regions.length).toBe(1);
    expect(tinyMap.ink[1 * 5 + 1]).toBe(1);
  });

  it('선 너머의 칸을 이웃으로 찾는다', () => {
    const left = regionAt(map, 2, 3);
    const right = regionAt(map, 6, 3);
    expect(map.regions[left - 1].neighbors).toEqual([right]);
    expect(map.regions[right - 1].neighbors).toEqual([left]);
  });

  it('선 픽셀은 가까운 영역 번호를 가지고, 바깥에는 번지지 않는다', () => {
    expect(regionAt(map, 1, 3)).toBe(regionAt(map, 2, 3));
    expect(regionAt(map, 7, 3)).toBe(regionAt(map, 6, 3));
    expect(regionAt(map, 0, 3)).toBe(0);
    expect(regionAt(map, -1, 3)).toBe(0);
  });
});

describe('색칠 상태', () => {
  // 1-2-3 이 줄로 이웃한 세 영역
  const neighbors = [[2], [1, 3], [2]];

  it('모든 영역을 칠하면 완성이다', () => {
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

describe('색칠 그림', () => {
  it('그림 id가 겹치지 않고, 1000칸 SVG 문서다', () => {
    expect(new Set(PICTURES.map((p) => p.id)).size).toBe(PICTURES.length);
    for (const picture of PICTURES) {
      expect(picture.svg.startsWith('<svg'), picture.id).toBe(true);
      expect(picture.svg, picture.id).toContain('viewBox="0 0 1000 1000"');
      expect(picture.svg, picture.id).not.toMatch(/NaN|undefined/);
    }
  });
});
