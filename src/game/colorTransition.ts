import { lerp, type Vec3 } from '../engine/math';

/** 선형 색공간에서 색을 부드럽게 전환한다. 전환 도중 목표가 바뀌면 현재 색부터 이어간다. */
export class ColorTransition {
  current: Vec3;
  private from: Vec3;
  private to: Vec3;
  private elapsed: number;

  constructor(
    initial: Vec3,
    private readonly duration: number,
  ) {
    this.current = initial;
    this.from = initial;
    this.to = initial;
    this.elapsed = duration;
  }

  setTarget(color: Vec3): void {
    this.from = this.current;
    this.to = color;
    this.elapsed = 0;
  }

  update(dt: number): void {
    if (this.elapsed >= this.duration) return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const t = this.elapsed / this.duration;
    this.current = lerp(this.from, this.to, t * t * (3 - 2 * t));
  }
}
