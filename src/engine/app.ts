import WebGL from 'three/addons/capabilities/WebGL.js';
import { Input } from './input';
import { FixedStepper } from './physics/fixedStepper';
import { Renderer } from './render/renderer';
import type { Controls, SceneDefinition, SceneInstance } from './scene';
import { Overlay } from './ui/overlay';

type GameState = 'start' | 'playing' | 'paused';

const PHYSICS_STEP_SECONDS = 1 / 120;
const MAX_FRAME_SECONDS = 0.1;

/**
 * 주 입력이 마우스나 터치패드일 때만 포인터 잠금으로 시점을 돌린다.
 * 휴대폰에서 잠금이 걸리면 터치 좌표가 고정되어 조이스틱이 움직이지 않는다.
 */
function hasFinePointer(): boolean {
  return window.matchMedia('(pointer: fine)').matches;
}

/**
 * 엔진의 바깥 틀. 렌더러·입력·화면 안내를 한 번 만들고, 씬을 받아 게임 루프를 돌린다.
 * 시작·일시 정지 상태와 포인터 잠금을 다루고, 씬 안의 내용은 모른다.
 */
export class App {
  private state: GameState = 'start';
  private running = true;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: Overlay;
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly stepper = new FixedStepper(PHYSICS_STEP_SECONDS, MAX_FRAME_SECONDS);
  private scene: SceneInstance | null = null;
  private alpha = 1;
  private lastTime = performance.now();
  private hadPointerLock = false;

  /** WebGL2를 쓸 수 없거나 렌더러를 만들지 못하면 안내를 띄우고 `null`을 돌려준다. */
  static create(canvas: HTMLCanvasElement): App | null {
    const overlay = new Overlay(
      () => app?.startPlaying(),
      () => app?.pause(),
    );
    let app: App | null = null;
    if (!WebGL.isWebGL2Available()) {
      overlay.showNotice('WebGL2를 사용할 수 없습니다', '최신 브라우저에서 하드웨어 가속을 켠 뒤 다시 접속해 주세요.');
      return null;
    }
    try {
      app = new App(canvas, overlay);
    } catch (error) {
      console.error(error);
      overlay.showNotice('그래픽을 초기화하지 못했습니다', '브라우저를 새로 고쳐 주세요.');
      return null;
    }
    return app;
  }

  private constructor(canvas: HTMLCanvasElement, overlay: Overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    // 컨텍스트 손실과 복구는 three.js의 WebGLRenderer가 처리하므로 한 번만 만든다.
    this.renderer = new Renderer(canvas, () => this.showGraphicsFailure());
    this.input = new Input(canvas);

    document.addEventListener('pointerlockchange', () => {
      if (this.input.isPointerLocked) {
        this.hadPointerLock = true;
      } else if (this.hadPointerLock) {
        this.hadPointerLock = false;
        this.pause();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener('keydown', (event) => {
      // 포인터 잠금 중의 Esc는 브라우저가 처리하며 pointerlockchange로 전달된다.
      if (event.code === 'Escape') this.pause();
    });
  }

  /** 씬을 바꾼다. 지금 씬과 렌더러에 등록된 콘텐츠를 지우고 새 씬을 만든다. 상태는 시작 화면으로 돌아간다. */
  load(definition: SceneDefinition): void {
    this.scene?.dispose?.();
    this.renderer.resetContent();
    this.scene = definition.create(this.renderer, (error) => {
      console.error(error);
      this.showGraphicsFailure();
    });
    this.alpha = 1;
    if (this.state === 'playing') this.pause();

    if (import.meta.env.DEV) {
      Object.assign(window, {
        __game: {
          ...this.scene.debug,
          scene: definition.id,
          // 개발 중 씬 바꾸기 확인용: `__game.app.load(scene)`
          app: this,
          input: this.input,
          gl: this.renderer.context,
          getState: () => this.state,
        },
      });
    }
  }

  /** 시작 화면을 띄우고 게임 루프를 돌린다. */
  start(): void {
    this.overlay.showStart();
    requestAnimationFrame((now) => this.frame(now));
  }

  private showGraphicsFailure(): void {
    this.running = false;
    this.overlay.showNotice('그래픽을 초기화하지 못했습니다', '브라우저를 새로 고쳐 주세요.');
  }

  private startPlaying(): void {
    if (this.state === 'playing') return;
    this.state = 'playing';
    this.input.clear();
    this.overlay.hideScreen();
    this.canvas.focus({ preventScroll: true });
    // 잠금이 거부되어도(예: Esc 직후) 드래그로 시점을 돌리며 계속 플레이할 수 있다.
    if (hasFinePointer()) this.canvas.requestPointerLock()?.catch?.(() => {});
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.clear();
    this.overlay.setJoystick(null);
    this.overlay.showPaused();
    if (this.input.isPointerLocked) document.exitPointerLock();
  }

  private readControls(): Controls {
    const input = this.input;
    const stick = input.moveAxis;
    const look = input.consumeLook();
    return {
      forward: Number(input.isDown('KeyW', 'ArrowUp')) - Number(input.isDown('KeyS', 'ArrowDown')) + stick.y,
      strafe: Number(input.isDown('KeyD', 'ArrowRight')) - Number(input.isDown('KeyA', 'ArrowLeft')) + stick.x,
      lookX: look.x,
      lookY: look.y,
    };
  }

  private frame(now: number): void {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    const frameSeconds = Math.min((now - this.lastTime) / 1000, MAX_FRAME_SECONDS);
    this.lastTime = now;
    const scene = this.scene;
    if (!scene) return;

    const playing = this.state === 'playing';
    if (playing) {
      scene.applyControls(this.readControls());
      this.alpha = this.stepper.advance(frameSeconds, (dt) => scene.fixedStep(dt));
      this.overlay.setJoystick(this.input.joystick);
    }
    scene.update(frameSeconds, this.alpha, playing);

    const aspect = this.renderer.resizeToDisplay();
    this.renderer.render(scene.frame(this.alpha), aspect);
  }
}
