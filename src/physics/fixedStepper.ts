/**
 * 렌더링 주기와 무관하게 일정한 간격으로 물리를 계산한다.
 * 탭 복귀처럼 프레임 간격이 크게 벌어지면 흘러간 시간을 버려 한꺼번에 계산하지 않는다.
 */
export class FixedStepper {
  private accumulator = 0;

  constructor(
    readonly stepSeconds: number,
    private readonly maxFrameSeconds: number,
  ) {}

  /** @returns 렌더링 보간에 쓸 0~1 비율 */
  advance(frameSeconds: number, step: (dt: number) => void): number {
    this.accumulator += Math.min(Math.max(frameSeconds, 0), this.maxFrameSeconds);
    while (this.accumulator >= this.stepSeconds) {
      step(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
    }
    return this.accumulator / this.stepSeconds;
  }
}
