const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** 키보드와 마우스 입력을 모은다. 게임 규칙은 모른다. */
export class Input {
  private readonly keys = new Set<string>();
  private readonly pressedSinceLastConsume = new Set<string>();
  private lookX = 0;
  private lookY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (event) => {
      if (PREVENT_DEFAULT.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressedSinceLastConsume.add(event.code);
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('mousemove', (event) => {
      // 포인터 잠금이 안 되는 환경에서도 왼쪽 버튼 드래그로 시점을 돌릴 수 있다.
      if (this.isPointerLocked || (event.buttons & 1) !== 0) {
        this.lookX += event.movementX;
        this.lookY += event.movementY;
      }
    });
  }

  get isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  /** 지난 호출 이후 눌렸다면 true를 반환하고 기록을 지운다. */
  consumePress(code: string): boolean {
    return this.pressedSinceLastConsume.delete(code);
  }

  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  clear(): void {
    this.keys.clear();
    this.pressedSinceLastConsume.clear();
    this.lookX = 0;
    this.lookY = 0;
  }
}
