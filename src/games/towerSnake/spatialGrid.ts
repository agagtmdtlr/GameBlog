/** 판 위의 실수 좌표 물체를 한 칸짜리 통에 나눠 두는 격자. 가까운 물체만 빨리 찾는다 (밀어내기, 단계 4의 사거리). */
export class SpatialGrid<T> {
  private readonly cells: T[][];

  /** `size`는 판 한 변의 칸 수다. 판 밖의 좌표는 가장자리 통에 넣는다. */
  constructor(private readonly size: number) {
    this.cells = Array.from({ length: size * size }, () => []);
  }

  clear(): void {
    for (const cell of this.cells) cell.length = 0;
  }

  insert(item: T, x: number, y: number): void {
    this.cells[this.index(this.clamp(x), this.clamp(y))].push(item);
  }

  /** (`x`, `y`)에서 `radius`칸 안쪽 통들의 물체를 모두 돌려준다. 실제 거리는 부르는 쪽이 본다. */
  forEachNear(x: number, y: number, radius: number, visit: (item: T) => void): void {
    const x0 = this.clamp(x - radius);
    const x1 = this.clamp(x + radius);
    const y0 = this.clamp(y - radius);
    const y1 = this.clamp(y + radius);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const item of this.cells[this.index(cx, cy)]) visit(item);
      }
    }
  }

  private clamp(v: number): number {
    return Math.min(this.size - 1, Math.max(0, Math.round(v)));
  }

  private index(x: number, y: number): number {
    return y * this.size + x;
  }
}
