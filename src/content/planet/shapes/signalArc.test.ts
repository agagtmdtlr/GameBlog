import { describe, expect, it } from 'vitest';
import { SIGNAL_ARC, signalArcFrame, signalArcOutline, signalArcThickness } from './signalArc';

describe('신호 물결 호', () => {
  it('프레임이 뒤로 갈수록 가늘어진다', () => {
    for (let f = 1; f < SIGNAL_ARC.frames; f++) expect(signalArcThickness(f)).toBeLessThan(signalArcThickness(f - 1));
    expect(signalArcThickness(SIGNAL_ARC.frames - 1)).toBeGreaterThan(0);
  });

  it('퍼진 정도에 맞는 프레임을 고르고 범위를 넘지 않는다', () => {
    expect(signalArcFrame(0)).toBe(0);
    expect(signalArcFrame(0.999)).toBe(SIGNAL_ARC.frames - 1);
    expect(signalArcFrame(1.5)).toBe(SIGNAL_ARC.frames - 1);
    expect(signalArcFrame(-1)).toBe(0);
  });

  it('외곽선은 칸 안, 가운데 위쪽에 있고 좌우 대칭이다', () => {
    for (let f = 0; f < SIGNAL_ARC.frames; f++) {
      const outline = signalArcOutline(f);
      for (const [x, y] of outline) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(SIGNAL_ARC.radius + 1e-9);
        expect(y).toBeGreaterThan(0);
      }
      const xs = outline.map(([x]) => x);
      expect(Math.max(...xs)).toBeCloseTo(-Math.min(...xs), 9);
    }
  });
});
