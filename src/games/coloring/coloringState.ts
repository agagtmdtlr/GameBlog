import type { Random } from './palette';

/**
 * 색칠 놀이 한 판의 상태. 영역을 누르면 그 판의 색 묶음에서 무작위로 고른 색이 칠해진다.
 * 이미 칠한 영역을 다시 누르면 다른 색으로 바뀐다. 모든 영역을 칠하면 완성이다.
 */
export class ColoringState {
  /** 영역 n의 색 번호 (`colors[n - 1]`). 칠하지 않았으면 -1 */
  private readonly colors: Int16Array;
  private filled = 0;

  constructor(
    /** 영역 n의 이웃 (`neighbors[n - 1]`) */
    private readonly neighbors: readonly (readonly number[])[],
    /** 색 묶음의 색 수 */
    private readonly paletteSize: number,
    private readonly random: Random,
  ) {
    if (paletteSize < 2) throw new Error('색이 두 가지 이상이어야 합니다');
    this.colors = new Int16Array(neighbors.length).fill(-1);
  }

  get regionCount(): number {
    return this.colors.length;
  }

  get filledCount(): number {
    return this.filled;
  }

  get isComplete(): boolean {
    return this.filled === this.colors.length;
  }

  /** 영역 n의 색 번호. 칠하지 않았으면 -1 */
  colorOf(region: number): number {
    return this.colors[region - 1] ?? -1;
  }

  /**
   * 영역을 칠하고 고른 색 번호를 돌려준다. 지금 색과 칠해진 이웃의 색은 되도록 피한다.
   * 피할 색이 묶음을 다 차지하면 지금 색만 피한다.
   */
  paint(region: number): number {
    if (region < 1 || region > this.colors.length) throw new Error(`없는 영역: ${region}`);
    const current = this.colors[region - 1];
    const avoid = new Set<number>([current]);
    for (const neighbor of this.neighbors[region - 1]) avoid.add(this.colors[neighbor - 1]);
    let choices = this.choicesWithout(avoid);
    if (choices.length === 0) choices = this.choicesWithout(new Set([current]));
    const color = choices[Math.floor(this.random() * choices.length)];
    if (current < 0) this.filled++;
    this.colors[region - 1] = color;
    return color;
  }

  /** 칠하지 않은 영역 번호 */
  unfilledRegions(): number[] {
    const regions: number[] = [];
    this.colors.forEach((color, i) => color < 0 && regions.push(i + 1));
    return regions;
  }

  private choicesWithout(avoid: ReadonlySet<number>): number[] {
    const choices: number[] = [];
    for (let color = 0; color < this.paletteSize; color++) if (!avoid.has(color)) choices.push(color);
    return choices;
  }
}
