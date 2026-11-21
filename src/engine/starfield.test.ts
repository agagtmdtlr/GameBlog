import { describe, expect, it } from 'vitest';
import { placeStars, STAR_FACES, STARFIELD, starOutline } from './starfield';

describe('별 빌보드', () => {
  it('같은 씨앗이면 같은 자리에 놓는다', () => {
    expect(placeStars()).toEqual(placeStars());
    expect(placeStars()).toHaveLength(STARFIELD.count);
  });

  it('모든 별이 해 궤도 바깥의 정해진 껍질 안에 있다', () => {
    for (const star of placeStars()) {
      const distance = Math.hypot(...star.position);
      expect(distance).toBeGreaterThanOrEqual(STARFIELD.minDistance - 1e-6);
      expect(distance).toBeLessThanOrEqual(STARFIELD.maxDistance + 1e-6);
      expect(star.size).toBeGreaterThanOrEqual(STARFIELD.minSize);
      expect(star.size).toBeLessThanOrEqual(STARFIELD.maxSize);
      expect(Math.abs(star.tilt)).toBeLessThanOrEqual(STARFIELD.maxTilt);
      expect(STAR_FACES[star.face]).toBeDefined();
    }
  });

  it('별 모양은 위를 향한 꼭짓점부터 바깥과 안쪽을 번갈아 둔다', () => {
    const points = starOutline(0, 0, 10, 4);
    expect(points).toHaveLength(10);
    expect(points[0][0]).toBeCloseTo(0);
    expect(points[0][1]).toBeCloseTo(-10);
    points.forEach(([x, y], i) => expect(Math.hypot(x, y)).toBeCloseTo(i % 2 === 0 ? 10 : 4));
  });
});
