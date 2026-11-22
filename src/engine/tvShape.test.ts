import { describe, expect, it } from 'vitest';
import { roundedRect, tvDarkBoxes, tvKnobs, tvLegs, tvWoodBoxes, TV_CABINET_BOTTOM, TV_SHAPE } from './tvShape';

const inUnitBox = (v: number) => v >= -0.5 - 1e-9 && v <= 0.5 + 1e-9;

describe('텔레비전 모형', () => {
  it('다리 끝이 바닥에 닿고 위 끝이 몸통 바닥에 붙는다', () => {
    for (const leg of tvLegs()) {
      expect(leg.center[1] - leg.length / 2).toBeCloseTo(-0.5, 9);
      expect(leg.center[1] + leg.length / 2).toBeCloseTo(TV_CABINET_BOTTOM, 9);
    }
  });

  it('나무 몸통과 뚜껑이 한 변 1인 상자 안에 있고 뚜껑 위가 상자 위에 닿는다', () => {
    const [cabinet, lid] = tvWoodBoxes();
    for (const { center, size } of [cabinet, lid]) {
      center.forEach((c, i) => {
        expect(inUnitBox(c - size[i] / 2)).toBe(true);
        expect(inUnitBox(c + size[i] / 2)).toBe(true);
      });
    }
    expect(lid.center[1] + lid.size[1] / 2).toBeCloseTo(0.5, 9);
    expect(cabinet.center[1] - cabinet.size[1] / 2).toBeCloseTo(TV_CABINET_BOTTOM, 9);
  });

  it('화면과 조작판, 스피커가 앞면 안에서 겹치지 않는다', () => {
    const { screen, panel, speaker } = TV_SHAPE;
    const screenRight = screen.x + screen.width / 2 + screen.bezel;
    expect(screen.x - screen.width / 2 - screen.bezel).toBeGreaterThan(-0.5);
    expect(screenRight).toBeLessThan(panel.x - panel.width / 2);
    expect(screenRight).toBeLessThan(speaker.x - speaker.width / 2);
    expect(speaker.y + speaker.height / 2).toBeLessThan(panel.y - panel.height / 2);
    expect(screen.y + screen.height / 2 + screen.bezel).toBeLessThan(0.5 - TV_SHAPE.lidThickness);
    expect(speaker.y - speaker.height / 2).toBeGreaterThan(TV_CABINET_BOTTOM);
    expect(tvDarkBoxes()).toHaveLength(2);
    expect(tvKnobs()).toHaveLength(2);
  });

  it('둥근 모서리 사각형이 주어진 폭과 높이를 채운다', () => {
    const points = roundedRect(0.6, 0.4, 0.1);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    expect(Math.max(...xs)).toBeCloseTo(0.3, 9);
    expect(Math.min(...ys)).toBeCloseTo(-0.2, 9);
  });
});
