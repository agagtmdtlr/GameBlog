import { describe, expect, it } from 'vitest';
import { atlasKey, packAtlas } from '../../../engine/render/billboard';
import { sunRayPositions, sunRaysExtent } from '../shapes/sunRays';
import { PLANET_BILLBOARD_IMAGES } from './billboardImages';

describe('행성 빌보드 그림', () => {
  it('모든 그림의 프레임마다 아틀라스 칸이 있다', () => {
    const layout = packAtlas(PLANET_BILLBOARD_IMAGES);
    for (const [image, spec] of Object.entries(PLANET_BILLBOARD_IMAGES)) {
      for (let frame = 0; frame < spec.frames; frame++) {
        expect(layout.rects.get(atlasKey(image, frame))?.width).toBe(spec.size);
      }
    }
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
