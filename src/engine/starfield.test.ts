import { describe, expect, it } from 'vitest';
import { generateStars, projectToFace } from './starfield';
import type { Vec3 } from './math';

describe('별 하늘', () => {
  it('같은 씨앗이면 같은 별을 만든다', () => {
    expect(generateStars(20, 7)).toEqual(generateStars(20, 7));
    for (const star of generateStars(200, 7)) {
      expect(Math.hypot(...star.direction)).toBeCloseTo(1, 6);
      expect(star.magnitude).toBeGreaterThanOrEqual(0);
      expect(star.magnitude).toBeLessThan(1);
    }
  });

  it('면 중심은 WebGL 큐브맵 축 방향이다', () => {
    const axes: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    axes.forEach((axis, face) => {
      const p = projectToFace(axis, face);
      expect(p?.s).toBeCloseTo(0.5);
      expect(p?.t).toBeCloseTo(0.5);
      expect(p?.scale).toBeCloseTo(1);
      // 반대 방향은 그 면에 그리지 않는다.
      expect(projectToFace([-axis[0], -axis[1], -axis[2]], face)).toBeNull();
    });
  });

  it('WebGL 규약대로 +X 면의 s는 -Z, t는 -Y 쪽으로 커진다', () => {
    const p = projectToFace([1, -0.5, -0.5], 0)!;
    expect(p.s).toBeCloseTo(0.75);
    expect(p.t).toBeCloseTo(0.75);
  });

  it('모서리 위 방향은 이웃한 두 면의 같은 가장자리에 놓인다', () => {
    // +X와 +Z 사이 모서리: +X 면의 s = 0, +Z 면의 s = 1
    const edge: Vec3 = [Math.SQRT1_2, 0.2, Math.SQRT1_2];
    const onX = projectToFace(edge, 0)!;
    const onZ = projectToFace(edge, 4)!;
    expect(onX.s).toBeCloseTo(0);
    expect(onZ.s).toBeCloseTo(1);
    expect(onX.t).toBeCloseTo(onZ.t);
  });
});
