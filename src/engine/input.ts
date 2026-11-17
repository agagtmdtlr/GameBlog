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

    // 휴대폰 브라우저마다 Pointer Events의 캡처·잠금 동작이 달라 터치는 Touch Events로 받는다.
    // 터치 대상은 처음 누른 요소로 고정되므로 손가락이 캔버스 밖으로 나가도 계속 받는다.
    const touchOptions: AddEventListenerOptions = { passive: false };
    canvas.addEventListener('touchstart', (event) => this.onTouchStart(event), touchOptions);
    canvas.addEventListener('touchmove', (event) => this.onTouchMove(event), touchOptions);
    canvas.addEventListener('touchend', (event) => this.onTouchEnd(event), touchOptions);
    canvas.addEventListener('touchcancel', (event) => this.onTouchEnd(event), touchOptions);
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

  private onTouchStart(event: TouchEvent): void {
    // 스크롤, 확대, 호환용 마우스 이벤트를 막는다.
    event.preventDefault();
    for (const touch of Array.from(event.changedTouches)) {
      const point = { x: touch.clientX, y: touch.clientY };
      const onLeft = point.x < window.innerWidth / 2;
      if (onLeft && !this.stick) {
        this.stick = { id: touch.identifier, origin: point, knob: { x: 0, y: 0 } };
      } else if (!onLeft && !this.lookTouch) {
        this.lookTouch = { id: touch.identifier, last: point };
      }
    }
  }

  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    for (const touch of Array.from(event.changedTouches)) {
      if (this.stick?.id === touch.identifier) {
        const dx = touch.clientX - this.stick.origin.x;
        const dy = touch.clientY - this.stick.origin.y;
        const limit = Math.min(1, JOYSTICK_RADIUS / Math.max(Math.hypot(dx, dy), 1e-6));
        this.stick.knob = { x: dx * limit, y: dy * limit };
      } else if (this.lookTouch?.id === touch.identifier) {
        this.lookX += (touch.clientX - this.lookTouch.last.x) * TOUCH_LOOK_SCALE;
        this.lookY += (touch.clientY - this.lookTouch.last.y) * TOUCH_LOOK_SCALE;
        this.lookTouch.last = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    for (const touch of Array.from(event.changedTouches)) {
      if (this.stick?.id === touch.identifier) this.stick = null;
      if (this.lookTouch?.id === touch.identifier) this.lookTouch = null;
    }
  }
}
