import { describe, expect, it } from 'vitest';
import { ATLAS_GUTTER, atlasKey, atlasUv, backToFrontOrder, BILLBOARD_IMAGES, packAtlas, type Billboard } from './billboard';
import { sunRayPositions, sunRaysExtent } from './sunRays';

describe('빌보드 아틀라스', () => {
  const layout = packAtlas();

  it('모든 그림의 프레임마다 칸이 있고 크기가 맞다', () => {
    for (const [image, spec] of Object.entries(BILLBOARD_IMAGES)) {
      for (let frame = 0; frame < spec.frames; frame++) {
        const rect = layout.rects.get(atlasKey(image as keyof typeof BILLBOARD_IMAGES, frame))!;
        expect(rect.width).toBe(spec.size);
        expect(rect.height).toBe(spec.size);
      }
    }
  });

  it('칸은 아틀라스 안에 있고, 여백을 두고 서로 겹치지 않는다', () => {
    const rects = [...layout.rects.values()];
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(ATLAS_GUTTER);
      expect(r.y).toBeGreaterThanOrEqual(ATLAS_GUTTER);
      expect(r.x + r.width + ATLAS_GUTTER).toBeLessThanOrEqual(layout.width);
      expect(r.y + r.height + ATLAS_GUTTER).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const apart =
          a.x + a.width + ATLAS_GUTTER * 2 <= b.x ||
          b.x + b.width + ATLAS_GUTTER * 2 <= a.x ||
          a.y + a.height + ATLAS_GUTTER * 2 <= b.y ||
          b.y + b.height + ATLAS_GUTTER * 2 <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('텍스처 좌표는 칸 안쪽이고 v는 아래가 작다', () => {
    const [u0, v0, u1, v1] = atlasUv(layout, 'disk');
    const rect = layout.rects.get(atlasKey('disk'))!;
    expect(u0).toBeGreaterThan(rect.x / layout.width);
    expect(u1).toBeLessThan((rect.x + rect.width) / layout.width);
    expect(v0).toBeLessThan(v1);
    expect(v1).toBeLessThan(1 - rect.y / layout.height);
    expect(() => atlasUv(layout, 'starFace', 99)).toThrow();
  });

  it('햇살 그림의 칸은 모든 꼭짓점을 담는다', () => {
    const positions = sunRayPositions();
    const extent = sunRaysExtent(positions);
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.abs(positions[i])).toBeLessThan(extent);
      expect(Math.abs(positions[i + 1])).toBeLessThan(extent);
    }
  });
});

describe('빌보드 그리기 순서', () => {
  const at = (z: number): Billboard => ({ image: 'disk', position: [0, 0, z], size: [1, 1], color: [1, 1, 1], toneMapped: false });

  it('카메라에서 먼 것부터 그린다', () => {
    const billboards = [at(-5), at(-50), at(3), at(-20)];
    expect(backToFrontOrder(billboards, [0, 0, 10])).toEqual([1, 3, 0, 2]);
  });
});
