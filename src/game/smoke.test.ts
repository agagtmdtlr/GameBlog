import { describe, expect, it } from 'vitest';
import { dot, length, sub } from '../engine/math';
import { puffRadius, SMOKE, SmokeTrail, type SmokeSource } from './smoke';
import { Train, TRAIN } from './train';

const DT = 1 / 120;
const SOURCE: SmokeSource = { position: [0, 20, 0], up: [0, 1, 0], right: [1, 0, 0], forward: [0, 0, -1] };

describe('굴뚝 연기', () => {
  it('퍼프는 부풀었다가 수명 끝에 0으로 줄어든다', () => {
    expect(puffRadius(0)).toBeCloseTo(SMOKE.startRadius, 9);
    const peak = Math.max(...Array.from({ length: 100 }, (_, i) => puffRadius(i / 100)));
    expect(peak).toBeGreaterThan(SMOKE.maxRadius * 0.8);
    expect(peak).toBeLessThanOrEqual(SMOKE.maxRadius);
    expect(puffRadius(0.999)).toBeLessThan(0.01);
    expect(puffRadius(1)).toBe(0);
  });

  it('일정한 간격으로 내보내고 수명이 지나면 사라져 수가 늘지 않는다', () => {
    const smoke = new SmokeTrail();
    for (let i = 0; i < Math.round(10 / DT); i++) smoke.step(DT, SOURCE);
    const expected = SMOKE.lifetime / SMOKE.interval;
    expect(smoke.models().length).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
    expect(smoke.models().length).toBeLessThanOrEqual(Math.ceil(expected) + 1);
  });

  it('퍼프는 굴뚝에서 위로 떠오른다', () => {
    const smoke = new SmokeTrail();
    for (let i = 0; i < Math.round(1 / DT); i++) smoke.step(DT, SOURCE);
    for (const puff of smoke.models()) expect(dot(sub(puff.position, SOURCE.position), SOURCE.up)).toBeGreaterThanOrEqual(0);
    const highest = Math.max(...smoke.models().map((p) => p.position[1] - SOURCE.position[1]));
    expect(highest).toBeGreaterThan(0.5);
  });

  it('달리는 기관차의 굴뚝에서 나와 뒤에 꼬리로 남는다', () => {
    const train = new Train();
    for (let i = 0; i < Math.round(2 / DT); i++) train.step(DT);
    const top = train.chimneyTop()!;
    const puffs = train.smoke.models();
    expect(puffs.length).toBeGreaterThan(5);
    // 가장 새 퍼프는 굴뚝 가까이에 있다.
    const nearest = Math.min(...puffs.map((p) => length(sub(p.position, top.position))));
    expect(nearest).toBeLessThan(TRAIN.speed * SMOKE.interval + 0.3);
    // 오래된 퍼프는 굴뚝보다 뒤쪽에 있다.
    const oldest = puffs[0];
    expect(dot(sub(oldest.position, top.position), top.forward)).toBeLessThan(-2);
  });
});
