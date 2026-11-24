import { describe, expect, it } from 'vitest';
import { type GlyphMetrics, layoutRansomText, normalizeRansomText, type Point } from './ransomLayout';

/** 글꼴 크기에 비례하는 가짜 잉크 상자 */
const measure = (char: string, font: string): GlyphMetrics => {
  const size = Number(/([\d.]+)px/.exec(font)?.[1]);
  const lower = char === char.toLowerCase();
  return { width: size * 0.6, ascent: size * (lower ? 0.5 : 0.7), descent: char === 'g' ? size * 0.2 : 0 };
};

const rotate = ([x, y]: Point, a: number): Point => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

describe('오림 글자 배치', () => {
  it('영어가 아닌 글자는 빼고, 공백을 하나로 줄인다', () => {
    expect(normalizeRansomText('Game  블로그 Blog!')).toBe('Game Blog!');
    expect(normalizeRansomText(' Hi\nthere ')).toBe('Hi\nthere');
  });

  it('공백을 뺀 글자마다 조각이 하나씩 생긴다', () => {
    const layout = layoutRansomText('Game Blog', measure);
    expect(layout.pieces.map((p) => p.char).join('')).toBe('GameBlog');
    expect(layout.text).toBe('Game Blog');
  });

  it('같은 글은 늘 같은 모양이고, seed가 다르면 달라진다', () => {
    const a = layoutRansomText('Game Blog', measure);
    expect(layoutRansomText('Game Blog', measure)).toEqual(a);
    expect(layoutRansomText('Game Blog', measure, { seed: 7 })).not.toEqual(a);
  });

  it('회전한 조각이 모두 그림 안에 든다', () => {
    const layout = layoutRansomText('Hello\nWorld 2026', measure, { letterSize: 50 });
    for (const piece of layout.pieces) {
      for (const point of piece.torn) {
        const [x, y] = rotate(point, piece.rotation);
        expect(piece.x + x).toBeGreaterThanOrEqual(0);
        expect(piece.y + y).toBeGreaterThanOrEqual(0);
        expect(piece.x + x).toBeLessThanOrEqual(layout.width);
        expect(piece.y + y).toBeLessThanOrEqual(layout.height);
      }
    }
  });

  it('조각은 왼쪽에서 오른쪽으로 이어지고, 여러 줄은 아래로 쌓인다', () => {
    const one = layoutRansomText('ABCD', measure).pieces;
    for (let i = 1; i < one.length; i++) expect(one[i].x).toBeGreaterThan(one[i - 1].x);
    const two = layoutRansomText('AB\nCD', measure, { letterSize: 40 }).pieces;
    expect(two[2].y).toBeGreaterThan(two[0].y + 30);
  });

  it('색 면은 찢긴 가장자리 안쪽에 있고, 잉크 상자가 조각 가운데에 온다', () => {
    for (const piece of layoutRansomText('Gg', measure).pieces) {
      const maxFace = Math.max(...piece.face.map(([x]) => Math.abs(x)));
      expect(maxFace).toBeLessThan(piece.width / 2 + 3);
      const glyph = measure(piece.char, piece.font);
      // 잉크 위끝과 아래끝이 조각 가운데를 사이에 두고 같은 거리
      expect(piece.baseline - glyph.ascent).toBeCloseTo(-(piece.baseline + glyph.descent));
    }
  });

  it('지원하는 글자가 없으면 빈 배치다', () => {
    expect(layoutRansomText('한글만', measure)).toMatchObject({ width: 0, height: 0, pieces: [] });
  });
});
