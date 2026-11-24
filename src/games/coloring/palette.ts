/**
 * 판마다 새로 뽑는 색 묶음. 같은 그림도 플레이할 때마다 다른 색으로 완성된다.
 * 색은 sRGB 0~1 값이다 (화면에 그대로 쓴다).
 */

export type Rgb = readonly [r: number, g: number, b: number];
export type Random = () => number;

/** 색 묶음 분위기. 채도·밝기 범위 */
interface Mood {
  readonly saturation: readonly [number, number];
  readonly lightness: readonly [number, number];
}

const MOODS: readonly Mood[] = [
  // 파스텔
  { saturation: [0.55, 0.8], lightness: [0.76, 0.86] },
  // 선명한 색
  { saturation: [0.7, 0.92], lightness: [0.55, 0.68] },
  // 섞은 색
  { saturation: [0.5, 0.88], lightness: [0.6, 0.82] },
];

/** 한 판의 색 수 */
export const PALETTE_SIZE = 8;

const between = (random: Random, [low, high]: readonly [number, number]) => low + (high - low) * random();

/** HSL(색상 0~360, 채도·밝기 0~1) → sRGB */
export function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const h = (((hue % 360) + 360) % 360) / 30;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + h) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

/**
 * 색 묶음을 뽑는다. 색상환을 고르게 나눈 자리에서 조금씩 흔들고, 분위기에 맞는 채도·밝기를 준다.
 * 선(검정)이 잘 보이도록 아주 어두운 색은 만들지 않는다.
 */
export function randomPalette(random: Random, size = PALETTE_SIZE): Rgb[] {
  const mood = MOODS[Math.floor(random() * MOODS.length)];
  const start = random() * 360;
  const step = 360 / size;
  const colors: Rgb[] = [];
  for (let i = 0; i < size; i++) {
    const hue = start + i * step + (random() - 0.5) * step * 0.5;
    colors.push(hslToRgb(hue, between(random, mood.saturation), between(random, mood.lightness)));
  }
  // 칠하는 순서가 색상환 순서로 보이지 않게 섞는다.
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  return colors;
}
