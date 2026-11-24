import { Matrix4, Scene, Vector3, type PerspectiveCamera } from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import type { Vec3 } from '../math';

/** 영상 화면을 놓을 자리. 화면 판의 중심, 축, 월드 크기 */
export interface VideoScreenPlacement {
  center: Vec3;
  right: Vec3;
  up: Vec3;
  normal: Vec3;
  width: number;
  height: number;
}

/** iframe 가로 픽셀 수. CSS3D가 월드 크기로 줄이므로 클수록 가까이서 선명하다. */
const IFRAME_WIDTH_PX = 960;
const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
/** 플레이어가 늦게 준비되어 명령을 놓쳐도 소리 상태가 맞도록 이 간격으로 다시 보낸다(밀리초). */
const RESEND_MS = 1500;

/**
 * YouTube 임베드 플레이어 하나. 음소거로 자동 재생하고 반복한다.
 * 소리는 IFrame Player API의 postMessage 명령(`unMute`, `setVolume`, `mute`)으로 바꾼다.
 */
export class YouTubeScreen {
  readonly element: HTMLIFrameElement;
  private volume = 0;
  private sentVolume = -1;
  private lastSent = 0;

  constructor(videoId: string, widthPx: number, heightPx: number) {
    const params = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      loop: '1',
      // 한 영상을 반복하려면 같은 id를 재생 목록으로도 넘겨야 한다.
      playlist: videoId,
      controls: '0',
      playsinline: '1',
      rel: '0',
      disablekb: '1',
      enablejsapi: '1',
      origin: window.location.origin,
    });
    const iframe = document.createElement('iframe');
    iframe.src = `${YOUTUBE_ORIGIN}/embed/${videoId}?${params}`;
    iframe.title = '텔레비전 화면의 YouTube 영상';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    // 리퍼러가 없으면 YouTube가 임베드 재생을 거부한다.
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.tabIndex = -1;
    iframe.style.width = `${widthPx}px`;
    iframe.style.height = `${heightPx}px`;
    iframe.style.border = '0';
    iframe.style.background = '#000';
    iframe.addEventListener('load', () => (this.sentVolume = -1));
    this.element = iframe;
  }

  /** 소리 크기(0~1). 0이면 음소거한다. 바뀌었거나 일정 시간이 지났을 때만 명령을 보낸다. */
  setVolume(volume: number): void {
    this.volume = Math.round(Math.min(1, Math.max(0, volume)) * 100);
    const now = performance.now();
    const changed =
      (this.volume === 0) !== (this.sentVolume <= 0) || Math.abs(this.volume - this.sentVolume) >= 3;
    if (!changed && now - this.lastSent < RESEND_MS) return;
    this.lastSent = now;
    this.sentVolume = this.volume;
    if (this.volume === 0) {
      this.command('mute');
    } else {
      this.command('unMute');
      this.command('setVolume', [this.volume]);
    }
  }

  private command(func: string, args: unknown[] = []): void {
    this.element.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YOUTUBE_ORIGIN);
  }
}

/**
 * 3D 장면 안에 놓는 HTML 영상 화면. `CSS3DRenderer`로 WebGL 캔버스 뒤에 그리고,
 * 렌더러가 화면 유리 자리의 캔버스를 투명하게 뚫어 그 구멍으로만 보인다.
 * 그래서 화면 앞을 지나는 캐릭터나 물체가 영상을 제대로 가린다.
 */
export class VideoScreenLayer {
  private readonly css = new CSS3DRenderer();
  private readonly scene = new Scene();
  private readonly screens: { object: CSS3DObject; center: Vector3; normal: Vector3 }[] = [];
  private readonly toCamera = new Vector3();
  private readonly forward = new Vector3();

  constructor() {
    const element = this.css.domElement;
    element.id = 'video-layer';
    element.setAttribute('aria-hidden', 'true');
    document.body.prepend(element);
  }

  /** 영상 화면을 더한다. */
  add(videoId: string, place: VideoScreenPlacement): YouTubeScreen {
    const heightPx = Math.round((IFRAME_WIDTH_PX * place.height) / place.width);
    const screen = new YouTubeScreen(videoId, IFRAME_WIDTH_PX, heightPx);
    const object = new CSS3DObject(screen.element);
    const s = place.width / IFRAME_WIDTH_PX;
    const right = new Vector3(...place.right).multiplyScalar(s);
    const up = new Vector3(...place.up).multiplyScalar(s);
    const normal = new Vector3(...place.normal);
    object.matrixAutoUpdate = false;
    object.matrix.copy(new Matrix4().makeBasis(right, up, normal).setPosition(...place.center));
    this.scene.add(object);
    this.screens.push({ object, center: new Vector3(...place.center), normal });
    return screen;
  }

  /** 영상 화면을 모두 뗀다. 장면에서 빠진 CSS3D 객체는 iframe도 문서에서 뗀다. */
  clear(): void {
    for (const { object } of this.screens) this.scene.remove(object);
    this.screens.length = 0;
  }

  setSize(width: number, height: number): void {
    this.css.setSize(width, height);
  }

  render(camera: PerspectiveCamera): void {
    if (this.screens.length === 0) return;
    camera.getWorldDirection(this.forward);
    for (const { object, center, normal } of this.screens) {
      this.toCamera.subVectors(camera.position, center);
      // 뒤에서 보거나 카메라 뒤에 있으면 CSS 투영이 뒤집혀 엉뚱한 곳에 보일 수 있으므로 감춘다.
      // display를 끄면 브라우저가 iframe을 다시 불러올 수 있어 visibility만 바꾼다.
      const visible = this.toCamera.dot(normal) > 0 && this.forward.dot(this.toCamera) < 0;
      object.element.style.visibility = visible ? 'visible' : 'hidden';
    }
    this.css.render(this.scene, camera);
  }
}
