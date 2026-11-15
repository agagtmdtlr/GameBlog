import { describe, expect, it } from 'vitest';
import { reflectVelocity, sphereVsSphere, type Sphere } from './collision';
import { FixedStepper } from './fixedStepper';

const PLANET: Sphere = { center: [0, 0, 0], radius: 10 };

describe('구-행성 충돌', () => {
  it('떨어져 있으면 충돌하지 않는다', () => {
    expect(sphereVsSphere([0, 11, 0], 0.5, PLANET)).toBeNull();
  });

  it('겹치면 행성 중심에서 바깥을 향하는 법선과 깊이를 돌려준다', () => {
    const contact = sphereVsSphere([0, 10.3, 0], 0.5, PLANET);
    expect(contact?.normal).toEqual([0, 1, 0]);
    expect(contact?.depth).toBeCloseTo(0.2);
  });

  it('행성의 옆이나 아래에서도 바깥으로 밀어낸다', () => {
    expect(sphereVsSphere([-10.2, 0, 0], 0.5, PLANET)?.normal).toEqual([-1, 0, 0]);
    const below = sphereVsSphere([0, -6, -8], 0.5, PLANET);
    expect(below?.normal[1]).toBeCloseTo(-0.6);
    expect(below?.normal[2]).toBeCloseTo(-0.8);
  });

  it('중심이 겹쳐도 밀어낼 방향을 돌려준다', () => {
    const contact = sphereVsSphere([0, 0, 0], 0.5, PLANET);
    expect(contact?.depth).toBeCloseTo(10.5);
    expect(Math.hypot(...contact!.normal)).toBeCloseTo(1);
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
