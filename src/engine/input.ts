const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** 가상 조이스틱의 손잡이가 움직일 수 있는 최대 거리 (CSS px) */
export const JOYSTICK_RADIUS = 56;
/** 이보다 작게 기울이면 움직이지 않는다 (반지름 대비 비율) */
const JOYSTICK_DEAD_ZONE = 0.12;
/** 터치 드래그는 마우스보다 이동량이 작아서 시점 회전을 키운다. */
const TOUCH_LOOK_SCALE = 2;

interface Point {
  x: number;
  y: number;
}

/** 화면에 그릴 가상 조이스틱의 상태 (CSS px, 뷰포트 기준) */
export interface JoystickState {
  origin: Point;
  /** 손잡이의 원점 기준 위치. 길이는 `JOYSTICK_RADIUS` 이하다. */
  knob: Point;
}

/**
 * 키보드, 마우스, 터치 입력을 모은다. 게임 규칙은 모른다.
 * 터치는 화면 왼쪽 절반이 이동 조이스틱, 오른쪽 절반이 시점 드래그다.
 */
export class Input {
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private stick: { id: number; origin: Point; knob: Point } | null = null;
  private lookTouch: { id: number; last: Point } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (event) => {
      if (PREVENT_DEFAULT.has(event.code)) event.preventDefault();
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

    canvas.addEventListener('pointerdown', (event) => this.onTouchStart(event));
    canvas.addEventListener('pointermove', (event) => this.onTouchMove(event));
    canvas.addEventListener('pointerup', (event) => this.onTouchEnd(event));
    canvas.addEventListener('pointercancel', (event) => this.onTouchEnd(event));
  }

  get isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  /** 조이스틱 기울기. x는 오른쪽, y는 앞쪽이 양수이고 길이는 1 이하다. */
  get moveAxis(): Point {
    if (!this.stick) return { x: 0, y: 0 };
    const { x, y } = this.stick.knob;
    const amount = Math.hypot(x, y) / JOYSTICK_RADIUS;
    if (amount < JOYSTICK_DEAD_ZONE) return { x: 0, y: 0 };
    // 데드존 밖에서 0부터 다시 올라가도록 길이를 다시 맞춘다.
    const scale = (amount - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE) / amount / JOYSTICK_RADIUS;
    return { x: x * scale, y: -y * scale };
  }

  get joystick(): JoystickState | null {
    return this.stick && { origin: this.stick.origin, knob: this.stick.knob };
  }

  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  clear(): void {
    this.keys.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.stick = null;
    this.lookTouch = null;
  }

  private onTouchStart(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;
    // 호환용 마우스 이벤트와 스크롤, 확대를 막는다.
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    const onLeft = point.x < window.innerWidth / 2;
    if (onLeft && !this.stick) {
      this.stick = { id: event.pointerId, origin: point, knob: { x: 0, y: 0 } };
    } else if (!onLeft && !this.lookTouch) {
      this.lookTouch = { id: event.pointerId, last: point };
    } else {
      return;
    }
    // 손가락이 HUD 위로 지나가도 이벤트를 계속 받는다. 캡처가 실패해도 조작은 된다.
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // 이미 끝난 포인터처럼 캡처할 수 없는 경우
    }
  }

  private onTouchMove(event: PointerEvent): void {
    if (this.stick?.id === event.pointerId) {
      const dx = event.clientX - this.stick.origin.x;
      const dy = event.clientY - this.stick.origin.y;
      const limit = Math.min(1, JOYSTICK_RADIUS / Math.max(Math.hypot(dx, dy), 1e-6));
      this.stick.knob = { x: dx * limit, y: dy * limit };
    } else if (this.lookTouch?.id === event.pointerId) {
      this.lookX += (event.clientX - this.lookTouch.last.x) * TOUCH_LOOK_SCALE;
      this.lookY += (event.clientY - this.lookTouch.last.y) * TOUCH_LOOK_SCALE;
      this.lookTouch.last = { x: event.clientX, y: event.clientY };
    }
  }

  private onTouchEnd(event: PointerEvent): void {
    if (this.stick?.id === event.pointerId) this.stick = null;
    if (this.lookTouch?.id === event.pointerId) this.lookTouch = null;
  }
}
