import {
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  GLSL3,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RawShaderMaterial,
  RedFormat,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/coloring.vert?raw';
import fragmentShader from '../shaders/coloring.frag?raw';
import type { Rgb } from '../palette';
import type { RegionMap } from '../regions';

/** 화면(CSS px)에서 그림이 놓인 정사각형 */
export interface PictureRect {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

const CONFETTI_COUNT = 180;
const CONFETTI_SECONDS = 4.5;
const BOUNCE_SECONDS = 0.9;

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  flutter: number;
  size: number;
}

const srgb = (rgb: Rgb) => new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);

/**
 * 색칠 그림을 three.js로 그린다. 영역 번호·선 진하기 텍스처와 영역마다의 색 텍스처를 셰이더가 합친다.
 * 다 칠하면 그림이 통통 튀고 색종이가 쏟아진다. 좌표는 CSS px이고 y는 위쪽이 양수다.
 */
export class ColoringView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 1, 0, -10, 10);
  private readonly picture: Mesh<PlaneGeometry, RawShaderMaterial>;
  private readonly regionData: Float32Array;
  private readonly regionTexture: DataTexture;
  private readonly textures: DataTexture[];
  private readonly confetti: InstancedMesh;
  private readonly pieces: Confetti[] = [];
  private readonly start = performance.now();
  private rect: PictureRect = { x: 0, y: 0, size: 1 };
  private viewHeight = 1;
  private celebratedAt = -Infinity;
  private readonly dummy = new Object3D();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly map: RegionMap,
    inkAmount: Uint8Array,
    private readonly paper: Rgb,
    ink: Rgb,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(srgb(paper));

    const { width, height, labels } = map;
    const labelBytes = new Uint8Array(width * height * 4);
    for (let p = 0; p < labels.length; p++) {
      labelBytes[p * 4] = labels[p] & 255;
      labelBytes[p * 4 + 1] = labels[p] >> 8;
    }
    const labelTexture = new DataTexture(labelBytes, width, height, RGBAFormat, UnsignedByteType);
    labelTexture.magFilter = NearestFilter;
    labelTexture.minFilter = NearestFilter;
    labelTexture.needsUpdate = true;

    // 작은 틈을 선으로 합친 곳은 아주 진하게 그린다.
    const inkBytes = Uint8Array.from(inkAmount, (value, p) => (map.ink[p] && value < 128 && labels[p] !== 0 ? 255 : value));
    const inkTexture = new DataTexture(inkBytes, width, height, RedFormat, UnsignedByteType);
    inkTexture.magFilter = LinearFilter;
    inkTexture.minFilter = LinearMipmapLinearFilter;
    inkTexture.generateMipmaps = true;
    inkTexture.unpackAlignment = 1;
    inkTexture.needsUpdate = true;

    const columns = map.regions.length + 1;
    this.regionData = new Float32Array(columns * 3 * 4);
    this.regionTexture = new DataTexture(this.regionData, columns, 3, RGBAFormat, FloatType);
    this.regionTexture.magFilter = NearestFilter;
    this.regionTexture.minFilter = NearestFilter;
    this.textures = [labelTexture, inkTexture, this.regionTexture];
    this.resetRegions();

    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uLabels: { value: labelTexture },
        uInk: { value: inkTexture },
        uRegions: { value: this.regionTexture },
        uMapSize: { value: new Vector2(width, height) },
        uTime: { value: 0 },
        uHint: { value: 0 },
        uPaper: { value: new Vector3(...paper) },
        uInkColor: { value: new Vector3(...ink) },
        uHintColor: { value: new Vector3(1, 0.86, 0.45) },
      },
    });
    this.picture = new Mesh(new PlaneGeometry(1, 1), material);
    this.scene.add(this.picture);

    this.confetti = new InstancedMesh(new PlaneGeometry(1, 0.6), new MeshBasicMaterial({ side: DoubleSide }), CONFETTI_COUNT);
    this.confetti.visible = false;
    this.confetti.frustumCulled = false;
    this.confetti.position.z = 1;
    this.scene.add(this.confetti);
  }

  /** 화면이 켜진 뒤 흐른 시간 (초). 셰이더의 시각과 같다. */
  get time(): number {
    return (performance.now() - this.start) / 1000;
  }

  /** 모든 영역을 칠하지 않은 종이로 되돌린다. */
  resetRegions(): void {
    const columns = this.map.regions.length + 1;
    for (let id = 0; id < columns; id++) {
      this.writeTexel(id, 0, [...this.paper, -1000]);
      this.writeTexel(id, 1, [...this.paper, 0]);
      this.writeTexel(id, 2, [0, 0, 1, 0]);
    }
    this.regionTexture.needsUpdate = true;
  }

  /** 영역을 칠한다. `origin`(그림 픽셀)에서 색이 번져 나간다. */
  paintRegion(region: number, color: Rgb, origin: readonly [number, number]): void {
    const info = this.map.regions[region - 1];
    if (!info) return;
    const base = (row: number) => (row * (this.map.regions.length + 1) + region) * 4;
    const previous: Rgb = [this.regionData[base(0)], this.regionData[base(0) + 1], this.regionData[base(0) + 2]];
    const [ox, oy] = origin;
    const reach =
      Math.max(
        Math.hypot(ox - info.minX, oy - info.minY),
        Math.hypot(ox - info.maxX - 1, oy - info.minY),
        Math.hypot(ox - info.minX, oy - info.maxY - 1),
        Math.hypot(ox - info.maxX - 1, oy - info.maxY - 1),
      ) + 4;
    this.writeTexel(region, 0, [...color, this.time]);
    this.writeTexel(region, 1, [...previous, reach]);
    this.writeTexel(region, 2, [ox, oy, 0, 0]);
    this.regionTexture.needsUpdate = true;
  }

  /** 안 칠한 영역 반짝임의 세기 0~1 */
  setHint(amount: number): void {
    this.picture.material.uniforms.uHint.value = amount;
  }

  /** 그림을 놓을 자리와 화면 크기 (CSS px) */
  layout(rect: PictureRect, viewWidth: number, viewHeight: number): void {
    this.rect = rect;
    this.viewHeight = viewHeight;
    this.renderer.setSize(viewWidth, viewHeight, false);
    this.camera.right = viewWidth;
    this.camera.top = viewHeight;
    this.camera.updateProjectionMatrix();
  }

  /** 화면 좌표(CSS px, 캔버스 기준) → 그림 픽셀. 그림 밖이면 `null` */
  toPicture(x: number, y: number): [number, number] | null {
    const { rect, map } = this;
    const u = (x - rect.x) / rect.size;
    const v = (y - rect.y) / rect.size;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
    return [u * map.width, v * map.height];
  }

  /** 다 칠했을 때: 그림이 튀고, 그림 아래 양쪽 모서리에서 색종이가 터져 오른다. */
  celebrate(colors: readonly Rgb[]): void {
    this.celebratedAt = this.time;
    this.pieces.length = 0;
    const { x, y, size } = this.rect;
    const bottom = this.viewHeight - y - size;
    const power = Math.sqrt(this.viewHeight) * 34;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      // 바깥 아래 모서리에서 그림 가운데 위쪽을 향해 부채꼴로 쏜다.
      const angle = Math.PI / 2 - side * (0.25 + Math.random() * 0.45);
      const speed = power * (0.6 + Math.random() * 0.5);
      this.pieces.push({
        x: x + size / 2 + (side * size) / 2,
        y: bottom,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 8,
        flutter: Math.random() * Math.PI * 2,
        size: 8 + Math.random() * 10,
      });
      this.confetti.setColorAt(i, srgb(colors[i % colors.length]));
    }
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
    this.confetti.visible = true;
  }

  /** 축하를 멈춘다 (새 판). */
  calm(): void {
    this.celebratedAt = -Infinity;
    this.confetti.visible = false;
  }

  render(frameSeconds: number): void {
    const now = this.time;
    this.picture.material.uniforms.uTime.value = now;

    const since = now - this.celebratedAt;
    const bounce = since < BOUNCE_SECONDS ? Math.sin((since / BOUNCE_SECONDS) * Math.PI * 3) * (1 - since / BOUNCE_SECONDS) * 0.05 : 0;
    const { x, y, size } = this.rect;
    this.picture.scale.set(size * (1 + bounce), size * (1 - bounce * 0.6), 1);
    this.picture.position.set(x + size / 2, this.viewHeight - y - size / 2, 0);

    if (this.confetti.visible) this.updateConfetti(frameSeconds, since);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const texture of this.textures) texture.dispose();
    this.picture.geometry.dispose();
    this.picture.material.dispose();
    this.confetti.geometry.dispose();
    (this.confetti.material as MeshBasicMaterial).dispose();
    this.renderer.dispose();
  }

  private updateConfetti(dt: number, since: number): void {
    if (since > CONFETTI_SECONDS) {
      this.confetti.visible = false;
      return;
    }
    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i];
      // 중력과 공기 저항: 솟았다가 하늘하늘 떨어진다.
      piece.vy = Math.max(piece.vy - 900 * dt, -160);
      piece.vx *= Math.exp(-1.6 * dt);
      piece.flutter += dt * 6;
      piece.x += (piece.vx + Math.sin(piece.flutter) * 40) * dt;
      piece.y += piece.vy * dt;
      piece.angle += piece.spin * dt;
      this.dummy.position.set(piece.x, piece.y, 0);
      this.dummy.rotation.set(0, 0, piece.angle);
      this.dummy.scale.set(piece.size * Math.cos(piece.flutter), piece.size, 1);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
  }

  private writeTexel(column: number, row: number, value: readonly number[]): void {
    this.regionData.set(value, (row * (this.map.regions.length + 1) + column) * 4);
  }
}
