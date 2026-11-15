import WebGL from 'three/addons/capabilities/WebGL.js';
import { CONTENT_ENTRIES } from './content/registry';
import { createContentRenderers } from './engine/contentRenderers/registry';
import { Input } from './engine/input';
import { add, length, scale, type Vec3 } from './engine/math';
import { Renderer } from './engine/renderer';
import { CameraRig } from './game/cameraRig';
import { PLANET } from './game/planet';
import { PLAYER_RADIUS } from './game/player';
import { STUDIO_ENVIRONMENT, World } from './game/world';
import { FixedStepper } from './physics/fixedStepper';
import { Overlay } from './ui/overlay';
import './style.css';

type GameState = 'start' | 'playing' | 'paused';

const PHYSICS_STEP_SECONDS = 1 / 120;
const MAX_FRAME_SECONDS = 0.1;

function isTouchOnlyDevice(): boolean {
  return !window.matchMedia('(any-pointer: fine)').matches;
}

function main(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  let state: GameState = 'start';

  const overlay = new Overlay(() => startPlaying());

  if (isTouchOnlyDevice()) {
    overlay.showNotice('PC에서 플레이해 주세요', '이 사이트는 키보드와 마우스로 구를 조작합니다.');
    return;
  }

  if (!WebGL.isWebGL2Available()) {
    overlay.showNotice(
      'WebGL2를 사용할 수 없습니다',
      '최신 브라우저에서 하드웨어 가속을 켠 뒤 다시 접속해 주세요.',
    );
    return;
  }

  let running = true;

  function showGraphicsFailure(): void {
    running = false;
    overlay.showNotice('그래픽을 초기화하지 못했습니다', '브라우저를 새로 고쳐 주세요.');
  }

  // 컨텍스트 손실과 복구는 three.js의 WebGLRenderer가 처리하므로 한 번만 만든다.
  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas, createContentRenderers(), showGraphicsFailure);
  } catch (error) {
    console.error(error);
    showGraphicsFailure();
    return;
  }

  const input = new Input(canvas);
  const stepper = new FixedStepper(PHYSICS_STEP_SECONDS, MAX_FRAME_SECONDS);
  const accentById = new Map(CONTENT_ENTRIES.map((entry) => [entry.content.id, entry.plate.color]));
  const world = new World(CONTENT_ENTRIES, (content) => {
    overlay.setActiveContent(content.label, accentById.get(content.id) ?? [1, 1, 1]);
  });
  const camera = new CameraRig(world.player.position, PLANET.center);

  let hadPointerLock = false;
  let lastTime = performance.now();

  function startPlaying(): void {
    if (state === 'playing') return;
    state = 'playing';
    input.clear();
    overlay.hideScreen();
    canvas.focus({ preventScroll: true });
    // 잠금이 거부되어도(예: Esc 직후) 드래그로 시점을 돌리며 계속 플레이할 수 있다.
    canvas.requestPointerLock()?.catch?.(() => {});
  }

  function pause(): void {
    if (state !== 'playing') return;
    state = 'paused';
    input.clear();
    overlay.showPaused();
    if (input.isPointerLocked) document.exitPointerLock();
  }

  document.addEventListener('pointerlockchange', () => {
    if (input.isPointerLocked) {
      hadPointerLock = true;
    } else if (hadPointerLock) {
      hadPointerLock = false;
      pause();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('keydown', (event) => {
    // 포인터 잠금 중의 Esc는 브라우저가 처리하며 pointerlockchange로 전달된다.
    if (event.code === 'Escape') pause();
  });

  function readMoveDirection(): Vec3 {
    const forward = Number(input.isDown('KeyW', 'ArrowUp')) - Number(input.isDown('KeyS', 'ArrowDown'));
    const strafe = Number(input.isDown('KeyD', 'ArrowRight')) - Number(input.isDown('KeyA', 'ArrowLeft'));
    const direction = add(scale(camera.forward, forward), scale(camera.right, strafe));
    const magnitude = length(direction);
    return magnitude > 1 ? scale(direction, 1 / magnitude) : direction;
  }

  let alpha = 1;

  function frame(now: number): void {
    if (!running) return;
    requestAnimationFrame(frame);
    const frameSeconds = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
    lastTime = now;

    if (state === 'playing') {
      const look = input.consumeLook();
      camera.applyLook(look.x, look.y);
      const direction = readMoveDirection();
      alpha = stepper.advance(frameSeconds, (dt) => world.fixedStep(dt, { direction }));
      camera.follow(world.interpolatedPlayerPosition(alpha), frameSeconds);
    }

    const aspect = renderer.resizeToDisplay();
    const playerPosition = world.interpolatedPlayerPosition(alpha);
    renderer.render(
      {
        items: world.buildDrawList(alpha),
        camera: camera.view,
        environment: STUDIO_ENVIRONMENT,
        occluder: { center: playerPosition, radius: PLAYER_RADIUS },
        contents: world.buildContentFrames(alpha),
      },
      aspect,
    );
  }

  overlay.showStart();
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    Object.assign(window, { __game: { world, camera, input, gl: renderer.context, getState: () => state } });
  }
}

main();
