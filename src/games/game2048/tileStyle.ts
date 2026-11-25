/** 타일 종이 색. 2부터 2048까지 차례로 따뜻한 색에서 차가운 색으로 돈다. 그 뒤로는 진한 남색 */
const COLORS = [
  '#fff3c4', // 2
  '#ffe08a', // 4
  '#ffc27a', // 8
  '#ff9e80', // 16
  '#ff8fab', // 32
  '#f59ad8', // 64
  '#c9a2f5', // 128
  '#9fb6ff', // 256
  '#86d6f2', // 512
  '#8ee3c0', // 1024
  '#b6ec7a', // 2048
];
const BEYOND = '#3d3a6b';

export interface TileStyle {
  readonly background: string;
  /** 글자 색 */
  readonly color: string;
  /** 칸 크기에 대한 글자 크기 비율 */
  readonly fontScale: number;
}

/** `value` 타일의 색과 글자 크기 */
export function tileStyle(value: number): TileStyle {
  const index = Math.round(Math.log2(value)) - 1;
  const background = COLORS[index] ?? BEYOND;
  const digits = String(value).length;
  return {
    background,
    color: background === BEYOND ? '#fff8e6' : '#2a221e',
    fontScale: [0.5, 0.5, 0.42, 0.34, 0.27][digits] ?? 0.22,
  };
}
