import { describe, expect, it } from 'vitest';
import { dot, length, sub } from './math';
import { bodyProfile, bodySurface, rocketLegs, rocketRivets, rocketWindow, ROCKET_BODY_BOTTOM, ROCKET_SHAPE } from './rocketShape';

describe('로켓 모양', () => {
  it('몸통은 닫힌 달걀 모양이고 한 변 1인 상자 안에 든다', () => {
    const profile = bodyProfile();
    expect(profile[0][0]).toBeCloseTo(0, 9);
    expect(profile[profile.length - 1][0]).toBeCloseTo(0, 9);
    expect(profile[profile.length - 1][1]).toBeCloseTo(0.5, 9);
    for (const [r, y] of profile) {
      expect(r).toBeLessThanOrEqual(0.5);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    // 위쪽이 아래쪽보다 길다.
    expect(ROCKET_SHAPE.bodyAbove).toBeGreaterThan(ROCKET_SHAPE.bodyBelow);
  });

  it('표면 법선은 바깥을 향한다', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const angle of [0, 1, 2, 4]) {
        const { position, normal } = bodySurface(t, angle);
        expect(length(normal)).toBeCloseTo(1, 6);
        expect(dot(normal, sub(position, [0, ROCKET_SHAPE.bodyMiddle, 0]))).toBeGreaterThan(0);
      }
    }
  });

  it('다리 끝이 바닥에 닿고, 몸통 아래로 나와 몸통을 받친다', () => {
    const legs = rocketLegs();
    expect(legs).toHaveLength(ROCKET_SHAPE.legs.count);
    for (const { center, axis, radius, length: len } of legs) {
      const lowEnd = sub(center, axis.map((v) => (v * len) / 2) as [number, number, number]);
      expect(lowEnd[1] - radius).toBeCloseTo(-0.5, 6);
      expect(lowEnd[1] - radius).toBeLessThan(ROCKET_BODY_BOTTOM);
      expect(Math.hypot(lowEnd[0], lowEnd[2]) + radius).toBeLessThanOrEqual(0.5);
    }
  });

  it('창은 정면(+Z)에 있고, 리벳은 창을 덮지 않는다', () => {
    const window = rocketWindow();
    expect(window.normal[2]).toBeGreaterThan(0.8);
    const rivets = rocketRivets();
    expect(rivets.length).toBeGreaterThan(40);
    for (const rivet of rivets) {
      expect(length(sub(rivet, window.position))).toBeGreaterThan(ROCKET_SHAPE.window.radius + ROCKET_SHAPE.window.rimTube);
    }
  });
});
