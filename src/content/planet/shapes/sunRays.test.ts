import { describe, expect, it } from 'vitest';
import { SUN_RAYS, sunRayPositions } from './sunRays';

describe('해 햇살 모양', () => {
  const positions = sunRayPositions();
  const triangles = Array.from({ length: positions.length / 9 }, (_, i) => {
    const p = positions.subarray(i * 9, i * 9 + 9);
    return [
      [p[0], p[1]],
      [p[3], p[4]],
      [p[6], p[7]],
    ];
  });

  it('정해진 수의 삼각형이 평면 위에 있다', () => {
    expect(triangles).toHaveLength(SUN_RAYS.count);
    for (let i = 2; i < positions.length; i += 3) expect(positions[i]).toBe(0);
  });

  it('모든 삼각형이 +Z에서 보아 반시계 방향이라 앞면이 카메라를 향한다', () => {
    for (const [a, b, c] of triangles) {
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      expect(area).toBeGreaterThan(0);
    }
  });

  it('해 원반과 겹치지 않고 바깥으로 뻗는다', () => {
    for (const [right, apex, left] of triangles) {
      for (const [x, y] of [right, apex, left]) expect(Math.hypot(x, y)).toBeGreaterThan(1.02);
      expect(Math.hypot(apex[0], apex[1])).toBeGreaterThan(Math.hypot(right[0], right[1]) + 0.3);
    }
  });

  it('같은 씨앗이면 같은 모양이다', () => {
    expect(sunRayPositions()).toEqual(positions);
  });
});
