import { describe, expect, it } from 'vitest';
import { reflectVelocity, sphereVsAabb, type AABB } from './collision';
import { FixedStepper } from './fixedStepper';

const BOX: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };

describe('구-상자 충돌', () => {
  it('떨어져 있으면 충돌하지 않는다', () => {
    expect(sphereVsAabb([0, 3, 0], 0.5, BOX)).toBeNull();
  });

  it('면과 겹치면 면의 법선과 깊이를 돌려준다', () => {
    const contact = sphereVsAabb([0, 1.3, 0], 0.5, BOX);
    expect(contact?.normal).toEqual([0, 1, 0]);
    expect(contact?.depth).toBeCloseTo(0.2);
  });

  it('모서리에서는 대각선 방향으로 밀어낸다', () => {
    const contact = sphereVsAabb([1.2, 1.2, 0], 0.5, BOX);
    expect(contact?.normal[0]).toBeCloseTo(Math.SQRT1_2);
    expect(contact?.normal[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it('중심이 상자 안이면 가장 가까운 면 밖으로 밀어낸다', () => {
    const contact = sphereVsAabb([0.9, 0, 0], 0.5, BOX);
    expect(contact?.normal).toEqual([1, 0, 0]);
    expect(contact?.depth).toBeCloseTo(0.6);
  });
});

describe('충돌 반응', () => {
  it('빠른 충돌은 반발 계수만큼 튕긴다', () => {
    expect(reflectVelocity([1, -10, 0], [0, 1, 0], 0.5, 2)).toEqual([1, 5, 0]);
  });

  it('느린 충돌은 튕기지 않고 멈춘다', () => {
    expect(reflectVelocity([1, -1, 0], [0, 1, 0], 0.5, 2)).toEqual([1, 0, 0]);
  });

  it('멀어지는 속도는 그대로 둔다', () => {
    expect(reflectVelocity([0, 3, 0], [0, 1, 0], 0.5, 2)).toEqual([0, 3, 0]);
  });
});

describe('고정 시간 간격', () => {
  it('누적된 시간만큼 스텝을 실행하고 나머지를 보간 비율로 돌려준다', () => {
    const stepper = new FixedStepper(0.01, 0.1);
    let steps = 0;
    const alpha = stepper.advance(0.035, () => steps++);
    expect(steps).toBe(3);
    expect(alpha).toBeCloseTo(0.5);
  });

  it('긴 프레임은 최대 시간까지만 계산한다', () => {
    const stepper = new FixedStepper(0.01, 0.1);
    let steps = 0;
    stepper.advance(60, () => steps++);
    expect(steps).toBeLessThanOrEqual(10);
  });
});
