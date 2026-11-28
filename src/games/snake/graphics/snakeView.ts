import {
  BackSide,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  GLSL3,
  Group,
  InstancedMesh,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import toonVert from '../shaders/toon.vert?raw';
import toonFrag from '../shaders/toon.frag?raw';
import outlineVert from '../shaders/outline.vert?raw';
import outlineFrag from '../shaders/outline.frag?raw';
import { GRID, type Cell } from '../snakeGame';

type Rgb = readonly [number, number, number];

/** 색 (sRGB) */
const PAPER: Rgb = [0xfb / 255, 0xf6 / 255, 0xec / 255];
const INK: Rgb = [0x2a / 255, 0x22 / 255, 0x1e / 255];
const TILE_A: Rgb = [0xc4 / 255, 0xe6 / 255, 0xa8 / 255];
const TILE_B: Rgb = [0xae / 255, 0xd9 / 255, 0x93 / 255];
const SLAB: Rgb = [0xe9 / 255, 0xdc / 255, 0xc6 / 255];
const RIM: Rgb = [0xff / 255, 0xb4 / 255, 0xa2 / 255];
const SNAKE: Rgb = [0xa9 / 255, 0x8b / 255, 0xf0 / 255];
const STRIPE: Rgb = [0xff / 255, 0xe2 / 255, 0x7a / 255];
const BERRY: Rgb = [0xff / 255, 0x6b / 255, 0x7a / 255];
const LEAF: Rgb = [0x5c / 255, 0xb8 / 255, 0x6a / 255];
const WHITE: Rgb = [1, 1, 1];
const TONGUE: Rgb = [0xe2 / 255, 0x57 / 255, 0x7a / 255];

/** 세로 시야 (도) */
const FOV = 38;
/** 판을 내려다보는 높이 각 (도) */
const ELEVATION = 58;
/** 판 둘레를 화면 끝에서 얼마나 띄울지 (NDC) */
const FIT = 0.9;
/** 선 굵기 (CSS px) */
const OUTLINE_PX = 2.4;
/** 몸 두 마디 사이에 더 넣는 공 수 */
const FILL = 2;
const HEAD_RADIUS = 0.46;
const BODY_RADIUS = 0.4;
const TAIL_RADIUS = 0.24;
const MAX_SAMPLES = GRID * GRID * (FILL + 1);
const BURST = 14;
const BURST_SECONDS = 0.7;
/** 먹은 먹이가 몸을 따라 내려가는 혹의 크기 (반지름 비율) */
const BULGE = 0.22;

const srgb = (rgb: Rgb) => new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
/** 셰이더가 sRGB 값을 그대로 받도록 변환 없이 넣는다. */
const raw = (rgb: Rgb) => new Color(rgb[0], rgb[1], rgb[2]);
const vec = (rgb: Rgb) => new Vector3(rgb[0], rgb[1], rgb[2]);

/** 칸 → 판 위 좌표 (x, z). 판 가운데가 원점, 칸 한 변이 1 */
export const cellX = (x: number) => x - (GRID - 1) / 2;

interface Particle {
  readonly velocity: Vector3;
  readonly position: Vector3;
  readonly color: Rgb;
  age: number;
}

/** 뱀 판을 three.js로 그린다. 놀이 규칙은 모르고 받은 몸·먹이 칸을 그린다. */
export class SnakeView {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  private readonly resolution = new Vector2(1, 1);
  private readonly lightDir = new Vector3(-0.45, 1, 0.55).normalize();
  private readonly snakeFade = { value: 0 };
  private readonly headFlash = { value: 0 };

  private readonly body: InstancedMesh;
  private readonly bodyOutline: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly head = new Group();
  private readonly tongue: Mesh;
  private readonly food = new Group();
  private readonly foodShadow: Mesh;
  private readonly burst: InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly dummy = new Object3D();

  /** 이번 칸으로 오기 전 마디 자리 (`to`와 길이가 같다) */
  private from: Cell[] = [];
  private to: Cell[] = [];
  private foodCell: Cell | null = null;
  private foodBorn = 0;
  /** 먹은 때 (몸이 나아간 칸 수로). 혹이 몸을 따라 내려간다. */
  private eats: number[] = [];
  private shakeUntil = 0;
  private time = 0;
  private headYaw = 0;
  /** 판이 화면에 맞는 카메라 거리 (`resize`가 정한다) */
  private distance = 30;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(srgb(PAPER));
    this.camera.rotation.order = 'YXZ';

    const outline = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: outlineVert,
      fragmentShader: outlineFrag,
      side: BackSide,
      uniforms: {
        uThickness: { value: OUTLINE_PX },
        uResolution: { value: this.resolution },
        uInk: { value: vec(INK) },
      },
    });
    const shadowMaterial = new MeshBasicMaterial({ color: srgb(INK), transparent: true, opacity: 0.16, depthWrite: false });

    // 판: 받침, 칸, 둘레 울타리
    const half = GRID / 2;
    const slab = new RoundedBoxGeometry(GRID + 2.2, 0.9, GRID + 2.2, 3, 0.35);
    this.addOutlined(slab, this.toon(SLAB), outline, (m) => m.position.set(0, -0.55, 0));
    const tiles = new InstancedMesh(new RoundedBoxGeometry(0.94, 0.24, 0.94, 2, 0.08), this.toon(WHITE), GRID * GRID);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        this.dummy.position.set(cellX(x), -0.12, cellX(y));
        this.dummy.updateMatrix();
        tiles.setMatrixAt(i, this.dummy.matrix);
        tiles.setColorAt(i, raw((x + y) % 2 === 0 ? TILE_A : TILE_B));
      }
    }
    this.scene.add(tiles);
    const rimLong = new RoundedBoxGeometry(GRID + 1.6, 0.7, 0.6, 3, 0.25);
    const rimShort = new RoundedBoxGeometry(0.6, 0.7, GRID, 3, 0.25);
    const rimMaterial = this.toon(RIM);
    for (const side of [-1, 1]) {
      this.addOutlined(rimLong, rimMaterial, outline, (m) => m.position.set(0, 0.05, side * (half + 0.4)));
      this.addOutlined(rimShort, rimMaterial, outline, (m) => m.position.set(side * (half + 0.4), 0.05, 0));
    }

    // 몸: 마디와 그 사이를 공으로 채운다.
    const sphere = new SphereGeometry(1, 24, 16);
    this.body = new InstancedMesh(sphere, this.toon(WHITE, true), MAX_SAMPLES);
    this.body.setColorAt(0, raw(SNAKE));
    this.bodyOutline = new InstancedMesh(sphere, outline, MAX_SAMPLES);
    this.bodyOutline.instanceMatrix = this.body.instanceMatrix;
    this.shadows = new InstancedMesh(new CircleGeometry(1, 20).rotateX(-Math.PI / 2), shadowMaterial, MAX_SAMPLES + 1);
    for (const mesh of [this.body, this.bodyOutline, this.shadows]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
    }
    this.scene.add(this.shadows, this.bodyOutline, this.body);

    // 머리: 조금 눌린 공, 눈 두 개, 날름거리는 혀. 머리 묶음은 +x 쪽을 본다.
    this.addOutlined(sphere, this.toon(SNAKE, true, true), outline, (m) => m.scale.set(HEAD_RADIUS * 1.12, HEAD_RADIUS * 0.86, HEAD_RADIUS), this.head);
    for (const side of [-1, 1]) {
      this.addOutlined(sphere, this.toon(WHITE), outline, (m) => {
        m.scale.setScalar(0.15);
        m.position.set(0.22, 0.24, side * 0.2);
      }, this.head);
      const pupil = new Mesh(sphere, this.toon(INK));
      pupil.scale.setScalar(0.075);
      pupil.position.set(0.32, 0.27, side * 0.2);
      this.head.add(pupil);
    }
    this.tongue = new Mesh(new RoundedBoxGeometry(0.3, 0.035, 0.07, 1, 0.015), this.toon(TONGUE));
    this.tongue.position.set(0.5, -0.06, 0);
    this.head.add(this.tongue);
    this.scene.add(this.head);

    // 먹이: 잎이 달린 열매
    this.addOutlined(sphere, this.toon(BERRY), outline, (m) => m.scale.setScalar(0.3), this.food);
    this.addOutlined(new CylinderGeometry(0.03, 0.04, 0.18, 6), this.toon(INK), outline, (m) => m.position.set(0, 0.34, 0), this.food);
    this.addOutlined(sphere, this.toon(LEAF), outline, (m) => {
      m.scale.set(0.16, 0.05, 0.09);
      m.position.set(0.12, 0.38, 0);
      m.rotation.z = 0.5;
    }, this.food);
    this.scene.add(this.food);
    this.foodShadow = new Mesh(new CircleGeometry(0.3, 20).rotateX(-Math.PI / 2), shadowMaterial);
    this.scene.add(this.foodShadow);

    // 먹었을 때 튀는 알갱이
    this.burst = new InstancedMesh(sphere, this.toon(WHITE), BURST * 4);
    this.burst.frustumCulled = false;
    this.burst.count = 0;
    this.burst.setColorAt(0, raw(BERRY));
    this.scene.add(this.burst);
  }

  /** 화면 크기를 맞추고 판이 위 버튼 줄(`top` px) 아래에 들어가게 카메라를 놓는다. */
  resize(width: number, height: number, top: number): void {
    this.renderer.setSize(width, height, false);
    this.resolution.set(width, height);
    const area = Math.max(1, height - top);
    this.camera.clearViewOffset();
    this.camera.aspect = width / area;
    // 판 둘레가 화면의 FIT 안에 들어오는 가장 가까운 거리를 찾는다.
    const half = GRID / 2 + 1.1;
    const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [-1, 0.4].map((y) => new Vector3(sx * half, y, sz * half))));
    let near = 5;
    let far = 120;
    for (let i = 0; i < 24; i++) {
      const distance = (near + far) / 2;
      this.placeCamera(distance, 0, 0);
      const fits = corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= FIT && Math.abs(p.y) <= FIT;
      });
      if (fits) far = distance;
      else near = distance;
    }
    this.distance = far;
    // 위 버튼 줄만큼 화면을 늘려 그 아래 영역의 가운데에 판이 오게 한다.
    this.camera.setViewOffset(width, area, 0, -top, width, height);
  }

  private placeCamera(distance: number, swayX: number, swayY: number): void {
    const elevation = (ELEVATION * Math.PI) / 180 + swayY;
    this.camera.position.set(
      Math.sin(swayX) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance,
      Math.cos(swayX) * Math.cos(elevation) * distance + 0.4,
    );
    this.camera.lookAt(0, 0, 0.4);
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
  }

  /** 판을 새로 놓는다 (움직임 없이). */
  reset(body: readonly Cell[], food: Cell | null): void {
    this.from = body.map((c) => ({ ...c }));
    this.to = body.map((c) => ({ ...c }));
    this.eats = [];
    this.snakeFade.value = 0;
    this.headFlash.value = 0;
    this.particles.length = 0;
    this.headYaw = this.yawOf(body);
    this.setFood(food);
  }

  /** 한 칸 나아갔다. `before`는 나아가기 전 몸이다. */
  step(before: readonly Cell[], after: readonly Cell[], food: Cell | null, ate: boolean, ticks: number): void {
    // 늘어난 꼬리 마디는 옛 꼬리 자리에 그대로 있다.
    this.from = after.map((_, i) => ({ ...(before[i] ?? before[before.length - 1]) }));
    this.to = after.map((c) => ({ ...c }));
    if (ate) {
      this.eats.push(ticks);
      if (this.foodCell) this.spray(this.foodCell);
    }
    this.eats = this.eats.filter((t) => ticks - t <= after.length + 1);
    if (food?.x !== this.foodCell?.x || food?.y !== this.foodCell?.y) this.setFood(food);
  }

  /** 부딪혔다: 흔들고 바랜다. */
  crash(): void {
    this.from = this.to.map((c) => ({ ...c }));
    this.shakeUntil = this.time + 0.45;
    this.headFlash.value = 1;
  }

  /**
   * 한 장면을 그린다.
   * `alpha`: 이번 칸으로 나아간 정도 (0~1), `ticks`: 몸이 나아간 칸 수, `dead`: 부딪혀 끝났는지
   */
  render(dt: number, alpha: number, ticks: number, dead: boolean): void {
    this.time += dt;
    const t = this.time;
    this.snakeFade.value += ((dead ? 0.55 : 0) - this.snakeFade.value) * Math.min(1, dt * 4);
    this.headFlash.value = Math.max(0, this.headFlash.value - dt * 3);

    // 마디 자리
    const n = this.to.length;
    const points: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.from[i];
      const b = this.to[i];
      points.push(new Vector3(cellX(a.x + (b.x - a.x) * alpha), 0, cellX(a.y + (b.y - a.y) * alpha)));
    }

    // 몸: 머리 다음 마디부터 꼬리까지, 사이를 채운다.
    const total = Math.max(1, (n - 1) * (FILL + 1));
    let count = 0;
    const color = new Color();
    for (let i = 1; i < n; i++) {
      for (let k = 0; k <= FILL; k++) {
        if (i === n - 1 && k > 0) break;
        const u = i + k / (FILL + 1);
        const p = points[i].clone().lerp(points[Math.min(n - 1, i + 1)], k / (FILL + 1));
        const along = (u * (FILL + 1)) / total;
        let radius = BODY_RADIUS + (TAIL_RADIUS - BODY_RADIUS) * Math.pow(Math.min(1, along), 1.6);
        for (const eat of this.eats) {
          const d = u - (ticks - eat + alpha);
          radius *= 1 + BULGE * Math.exp(-d * d * 1.6);
        }
        this.dummy.position.set(p.x, radius * 0.92, p.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(radius);
        this.dummy.updateMatrix();
        this.body.setMatrixAt(count, this.dummy.matrix);
        this.body.setColorAt(count, color.copy(raw(Math.floor(u) % 3 === 0 ? STRIPE : SNAKE)));
        this.dummy.position.y = 0.01;
        this.dummy.scale.setScalar(radius * 1.05);
        this.dummy.updateMatrix();
        this.shadows.setMatrixAt(count, this.dummy.matrix);
        count++;
      }
    }
    this.body.count = this.bodyOutline.count = count;
    this.body.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;

    // 머리: 앞 마디 쪽에서 머리 쪽으로 보는 방향
    const headPos = points[0];
    let yaw = this.headYaw;
    if (n > 1) {
      const dir = headPos.clone().sub(points[1]);
      if (dir.lengthSq() > 1e-6) yaw = Math.atan2(-dir.z, dir.x);
    }
    this.headYaw = yaw;
    const bob = dead ? 0 : Math.sin(t * 9) * 0.03;
    this.head.position.set(headPos.x, HEAD_RADIUS * 0.86 + bob, headPos.z);
    this.head.rotation.set(0, yaw, 0);
    const flick = Math.max(0, Math.sin(t * 6.5)) ** 6;
    this.tongue.scale.set(dead ? 0.01 : 0.3 + flick, 1, 1);
    this.tongue.position.x = 0.38 + 0.15 * (dead ? 0 : 0.3 + flick);
    this.dummy.position.set(headPos.x, 0.01, headPos.z);
    this.dummy.scale.setScalar(HEAD_RADIUS * 1.1);
    this.dummy.updateMatrix();
    this.shadows.setMatrixAt(count, this.dummy.matrix);
    this.shadows.count = count + 1;
    this.shadows.instanceMatrix.needsUpdate = true;

    // 먹이: 둥실거리며 돈다. 처음엔 튀어나오듯 커진다.
    if (this.foodCell) {
      const age = t - this.foodBorn;
      const pop = age >= 0.35 ? 1 : 1 - Math.cos(age * 18) * Math.exp(-age * 8) * (1 - age / 0.35);
      this.food.visible = this.foodShadow.visible = true;
      this.food.position.set(cellX(this.foodCell.x), 0.42 + Math.sin(t * 3) * 0.08, cellX(this.foodCell.y));
      this.food.rotation.y = t * 1.4;
      this.food.scale.setScalar(Math.max(0.01, pop));
      this.foodShadow.position.set(this.food.position.x, 0.01, this.food.position.z);
      this.foodShadow.scale.setScalar(Math.max(0.01, pop) * (1 - Math.sin(t * 3) * 0.12));
    } else this.food.visible = this.foodShadow.visible = false;

    this.updateBurst(dt);

    // 카메라: 아주 천천히 흔들리고, 부딪히면 떨린다.
    const shake = Math.max(0, this.shakeUntil - t) / 0.45;
    const jitter = shake * shake * 0.03;
    this.placeCamera(this.distance, Math.sin(t * 0.3) * 0.025 + Math.sin(t * 61) * jitter, Math.sin(t * 0.23) * 0.012 + Math.cos(t * 53) * jitter);
    this.renderer.render(this.scene, this.camera);
  }

  private setFood(food: Cell | null): void {
    this.foodCell = food ? { ...food } : null;
    this.foodBorn = this.time;
  }

  private spray(cell: Cell): void {
    for (let i = 0; i < BURST; i++) {
      const angle = (i / BURST) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.6 + Math.random() * 1.6;
      this.particles.push({
        position: new Vector3(cellX(cell.x), 0.45, cellX(cell.y)),
        velocity: new Vector3(Math.cos(angle) * speed, 3 + Math.random() * 2, Math.sin(angle) * speed),
        color: i % 3 === 0 ? LEAF : i % 3 === 1 ? STRIPE : BERRY,
        age: 0,
      });
    }
    if (this.particles.length > BURST * 4) this.particles.splice(0, this.particles.length - BURST * 4);
  }

  private updateBurst(dt: number): void {
    let count = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age > BURST_SECONDS) continue;
      p.velocity.y -= 12 * dt;
      p.position.addScaledVector(p.velocity, dt);
      if (p.position.y < 0.06) {
        p.position.y = 0.06;
        p.velocity.y *= -0.4;
        p.velocity.x *= 0.7;
        p.velocity.z *= 0.7;
      }
      this.dummy.position.copy(p.position);
      this.dummy.scale.setScalar(0.09 * (1 - p.age / BURST_SECONDS));
      this.dummy.updateMatrix();
      this.burst.setMatrixAt(count, this.dummy.matrix);
      this.burst.setColorAt(count, raw(p.color));
      count++;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) if (this.particles[i].age > BURST_SECONDS) this.particles.splice(i, 1);
    this.burst.count = count;
    this.burst.instanceMatrix.needsUpdate = true;
    if (this.burst.instanceColor) this.burst.instanceColor.needsUpdate = true;
  }

  private yawOf(body: readonly Cell[]): number {
    if (body.length < 2) return 0;
    return Math.atan2(-(body[0].y - body[1].y), body[0].x - body[1].x);
  }

  /** 툰 재질. `snake`면 부딪혔을 때 바래고, `head`면 번쩍인다. */
  private toon(color: Rgb, snake = false, head = false): ShaderMaterial {
    return new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: toonVert,
      fragmentShader: toonFrag,
      uniforms: {
        uColor: { value: vec(color) },
        uLightDir: { value: this.lightDir },
        uPaper: { value: vec(PAPER) },
        uFade: snake ? this.snakeFade : { value: 0 },
        uFlash: head ? this.headFlash : { value: 0 },
      },
    });
  }

  /** 메시와 그 선 테두리를 함께 더한다. */
  private addOutlined(
    geometry: BufferGeometry,
    material: Material,
    outline: Material,
    place: (mesh: Mesh) => void,
    parent: Object3D = this.scene,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    place(mesh);
    const shell = new Mesh(geometry, outline);
    shell.position.copy(mesh.position);
    shell.rotation.copy(mesh.rotation);
    shell.scale.copy(mesh.scale);
    parent.add(shell, mesh);
    return mesh;
  }
}
