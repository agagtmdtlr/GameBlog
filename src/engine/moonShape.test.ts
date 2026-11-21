import { describe, expect, it } from 'vitest';
import { craterProfile, displaceToMoon, generateMoonFeatures, moonRadiusAt, MOON_SHAPE } from './moonShape';

describe('위성 모양', () => {
  it('같은 씨앗이면 같은 충돌구를 만든다', () => {
    expect(generateMoonFeatures(3)).toEqual(generateMoonFeatures(3));
    const { craters } = generateMoonFeatures();
    expect(craters).toHaveLength(MOON_SHAPE.largeCraters.count + MOON_SHAPE.smallCraters.count);
  });

  it('충돌구는 가운데가 패이고 테두리가 솟는다', () => {
    const crater = { depth: 0.1, innerPit: true };
    expect(craterProfile(0, crater)).toBeLessThan(craterProfile(0.5, crater));
    expect(craterProfile(0.5, crater)).toBeLessThan(0);
    expect(craterProfile(1, crater)).toBeGreaterThan(0);
    expect(Math.abs(craterProfile(2, crater))).toBeLessThan(0.001);
  });

  it('큰 충돌구 중심은 둘레보다 낮다', () => {
    const features = generateMoonFeatures();
    const crater = features.craters[0];
    expect(moonRadiusAt(crater.direction, features)).toBeLessThan(1);
  });

  it('정점을 구에서 크게 벗어나지 않게 민다', () => {
    const positions = new Float32Array(3 * 2000);
    for (let i = 0; i < 2000; i++) {
      const z = (i / 1999) * 2 - 1;
      const phi = i * 2.399963;
      const r = Math.sqrt(1 - z * z);
      positions.set([r * Math.cos(phi), r * Math.sin(phi), z], i * 3);
    }
    displaceToMoon(positions);
    for (let i = 0; i < positions.length; i += 3) {
      const len = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
      expect(len).toBeGreaterThan(0.75);
      expect(len).toBeLessThan(1.25);
    }
  });
});
