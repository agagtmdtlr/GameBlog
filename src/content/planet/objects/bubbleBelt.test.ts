import { describe, expect, it } from 'vitest';
import { dot, length, sub } from '../../../engine/math';
import { BubbleBelt, BUBBLE_BELT, beltBasis } from './bubbleBelt';
import { Moon, MOON } from './moon';
import { SUN } from './sun';
import { PLANET } from '../planet';

/** 카메라가 오를 수 있는 가장 높은 곳 (행성 반지름 + 언덕 + 카메라 거리) 보다 넉넉한 값 */
const CAMERA_REACH = PLANET.radius + 12;
/** 위성의 가장 큰 반지름 (충돌구·바위 덩어리가 ±20%쯤 바꾼다) */
const MOON_REACH = MOON.radius * 1.25;

function sampleOverTime(check: (belt: BubbleBelt) => void): void {
  const belt = new BubbleBelt();
  for (let i = 0; i < 60; i++) {
    check(belt);
    for (let k = 0; k < 120; k++) belt.step(1 / 60);
  }
}

describe('비눗방울 띠', () => {
  it('띠 평면 기저가 직교 단위 벡터다', () => {
    const { u, v } = beltBasis();
    expect(length(u)).toBeCloseTo(1, 6);
    expect(length(v)).toBeCloseTo(1, 6);
    expect(dot(u, v)).toBeCloseTo(0, 6);
    expect(dot(u, BUBBLE_BELT.axis)).toBeCloseTo(0, 6);
  });

  it('같은 씨앗으로 늘 같은 방울을 만든다', () => {
    expect(new BubbleBelt().bubbles()).toEqual(new BubbleBelt().bubbles());
    expect(new BubbleBelt().bubbles()).toHaveLength(BUBBLE_BELT.count);
  });

  it('작은 방울이 큰 방울보다 많다', () => {
    const radii = new BubbleBelt().bubbles().map((b) => b.radius);
    const mid = (BUBBLE_BELT.minRadius + BUBBLE_BELT.maxRadius) / 2;
    expect(radii.filter((r) => r < mid).length).toBeGreaterThan(radii.filter((r) => r >= mid).length * 3);
    expect(Math.max(...radii)).toBeLessThanOrEqual(BUBBLE_BELT.maxRadius * (1 + BUBBLE_BELT.breathe));
  });

  it('떠다니는 동안 카메라, 위성, 해 궤도에 닿지 않는다', () => {
    const moonCenter = new Moon().center;
    sampleOverTime((belt) => {
      for (const b of belt.bubbles()) {
        const fromCenter = length(sub(b.center, PLANET.center));
        expect(fromCenter - b.radius).toBeGreaterThan(CAMERA_REACH);
        expect(fromCenter + b.radius).toBeLessThan(SUN.orbitRadius - SUN.radius);
        expect(length(sub(b.center, moonCenter))).toBeGreaterThan(MOON_REACH + b.radius);
      }
    });
  });

  it('시간이 흐르면 공전하고 둥실거리며, 멈추면 그대로다', () => {
    const belt = new BubbleBelt();
    const before = belt.bubbles();
    expect(belt.bubbles()).toEqual(before);
    for (let i = 0; i < 300; i++) belt.step(1 / 60);
    const after = belt.bubbles();
    const moved = after.filter((b, i) => length(sub(b.center, before[i].center)) > 0.1).length;
    expect(moved).toBe(after.length);
  });
});
