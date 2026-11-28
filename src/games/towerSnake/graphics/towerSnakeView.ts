import {
  BackSide,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  GLSL3,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import toonVert from '../shaders/toon.vert?raw';
import toonFrag from '../shaders/toon.frag?raw';
import outlineVert from '../shaders/outline.vert?raw';
import outlineFrag from '../shaders/outline.frag?raw';
import { TOWER_TYPES, type TowerType } from '../towers';
import { BOARD, BOX_COUNT, type Cell, type TowerBox } from '../world';

type Rgb = readonly [number, number, number];
const hex = (n: number): Rgb => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

/** 색 (sRGB) */
const PAPER = hex(0xfbf6ec);
const INK = hex(0x2a221e);
const TILE_A = hex(0xc4e6a8);
const TILE_B = hex(0xaed993);
const SLAB = hex(0xe9dcc6);
const RIM = hex(0xffb4a2);
const SNAKE = hex(0xa98bf0);
const PLATFORM = hex(0xd7c9fa);
const WHITE: Rgb = [1, 1, 1];
const TONGUE = hex(0xe2577a);

/** 세로 시야 (도) */
const FOV = 40;
/** 판을 내려다보는 높이 각 (도) */
const ELEVATION = 56;
/**
 * 카메라 거리를 정하는 칸 수. 원근 때문에 실제로는 이보다 적게 보여서, 가로로 긴 화면에서 약 17 × 13칸이 보이도록 맞춘 값이다.
 */
const VIEW_CELLS = 18;
/** 세로로 긴 화면에서 가로로 보이는 칸 수 (머리 높이에서) */
const NARROW_CELLS = 12;
/** 카메라가 머리를 따라가는 빠르기 (클수록 바짝) */
const FOLLOW = 4;
/** 선 굵기 (CSS px) */
const OUTLINE_PX = 2.4;
const HEAD_RADIUS = 0.46;
/** 그릴 수 있는 마디 수 (한계 40보다 넉넉히) */
const DRAW_SEGMENTS = 64;
/** 타워 부품 인스턴스 수: 마디 + 상자 위의 작은 타워 */
const PART_CAPACITY = DRAW_SEGMENTS + BOX_COUNT + 4;
const PIECES = 10;
const PIECE_SECONDS = 0.9;
const SHAKE_SECONDS = 0.35;
/** 새 마디·바뀐 마디가 튀어나오는 시간 (초) */
const POP_SECONDS = 0.45;
/** 상자 위 작은 타워의 크기 */
const BOX_TOWER_SCALE = 0.62;

/**
 * 타워 모양의 부품 하나. 마디 받침 가운데가 원점, +x가 마디가 나아가는 쪽이다.
 * 같은 부품을 상자 위의 작은 타워에도 쓴다.
 */
interface PartSpec {
  readonly geometry: () => BufferGeometry;
  readonly color: Rgb;
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}

/** 타워 종류마다의 모양 (계획서 3.3의 표) */
const TOWER_SHAPES: Readonly<Record<TowerType, readonly PartSpec[]>> = {
  // 화살: 둥근 벽 위의 노란 뾰족 지붕 탑
  arrow: [
    { geometry: () => new CylinderGeometry(0.2, 0.24, 0.42, 16), color: hex(0xfff3d6), position: [0, 0.52, 0] },
    { geometry: () => new ConeGeometry(0.3, 0.34, 16), color: hex(0xffd24d), position: [0, 0.9, 0] },
  ],
  // 대포: 낮은 받침 위의 둥근 포탑과 앞으로 내민 포신
  cannon: [
    { geometry: () => new CylinderGeometry(0.3, 0.33, 0.18, 18), color: hex(0xc9d2e8), position: [0, 0.4, 0] },
    { geometry: () => new SphereGeometry(0.27, 20, 14), color: hex(0x7f8fbf), position: [0, 0.55, 0], scale: [1, 0.85, 1] },
    {
      geometry: () => new CylinderGeometry(0.075, 0.09, 0.42, 12),
      color: hex(0x4a4f6b),
      position: [0.26, 0.64, 0],
      rotation: [0, 0, -Math.PI / 2 + 0.25],
    },
  ],
  // 얼음: 받침에 큰 수정과 작은 수정
  ice: [
    { geometry: () => new CylinderGeometry(0.24, 0.27, 0.12, 16), color: hex(0xe6f7ff), position: [0, 0.37, 0] },
    { geometry: () => new OctahedronGeometry(0.22), color: hex(0x8fd8ff), position: [0, 0.75, 0], scale: [1, 1.7, 1] },
    {
      geometry: () => new OctahedronGeometry(0.12),
      color: hex(0xd2f1ff),
      position: [0.14, 0.56, 0.12],
      rotation: [0.3, 0, -0.4],
      scale: [1, 1.6, 1],
    },
  ],
  // 번개: 보라 막대에 고리 둘, 끝에 노란 구슬
  lightning: [
    { geometry: () => new CylinderGeometry(0.07, 0.11, 0.56, 12), color: hex(0x8f6ad8), position: [0, 0.6, 0] },
    { geometry: () => new TorusGeometry(0.17, 0.045, 8, 22), color: hex(0xc9b3ff), position: [0, 0.5, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: () => new TorusGeometry(0.13, 0.04, 8, 22), color: hex(0xc9b3ff), position: [0, 0.7, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: () => new SphereGeometry(0.12, 16, 12), color: hex(0xffe27a), position: [0, 0.93, 0] },
  ],
};

/** 상자 색 (타워 종류마다) */
const BOX_COLORS: Readonly<Record<TowerType, Rgb>> = {
  arrow: hex(0xffe8a3),
  cannon: hex(0xc9d2e8),
  ice: hex(0xc4ecff),
  lightning: hex(0xdccdff),
};

const srgb = (rgb: Rgb) => new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
/** 셰이더가 sRGB 값을 그대로 받도록 변환 없이 넣는다. */
const raw = (rgb: Rgb) => new Color(rgb[0], rgb[1], rgb[2]);
const vec = (rgb: Rgb) => new Vector3(rgb[0], rgb[1], rgb[2]);

/** 칸 → 판 위 좌표 (x, z). 판 가운데가 원점, 칸 한 변이 1 */
export const cellX = (x: number) => x - (BOARD - 1) / 2;

/** 0 → 1로 튀어나오는 크기 (조금 넘쳤다가 돌아온다) */
const popScale = (age: number) => {
  if (age >= POP_SECONDS) return 1;
  const t = Math.max(0, age / POP_SECONDS);
  return 1 + Math.sin(t * Math.PI * 1.5) * (1 - t) * 0.35 - (1 - t) ** 3;
};

interface Piece {
  readonly velocity: Vector3;
  readonly position: Vector3;
  readonly color: Rgb;
  readonly size: number;
  age: number;
}

/** 그리기 위해 만든 타워 부품: 인스턴스 메시와 부품 자체의 변환 */
interface Part {
  readonly mesh: InstancedMesh;
  readonly local: Matrix4;
}

/** 그릴 때 받는 판 상태 */
export interface ViewState {
  /** 이번 칸으로 나아간 정도 (0~1) */
  readonly alpha: number;
  /** 남은 무적 시간 (초) */
  readonly invulnerable: number;
  readonly dead: boolean;
  /** 마디마다의 타워 (`towers[i]`는 `body[i + 1]`의 타워) */
  readonly towers: readonly TowerType[];
  readonly boxes: readonly TowerBox[];
}

/** 타워 뱀 판을 three.js로 그린다. 놀이 규칙은 모르고 받은 몸·타워·상자를 그린다. */
export class TowerSnakeView {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 300);
  private readonly resolution = new Vector2(1, 1);
  private readonly lightDir = new Vector3(-0.45, 1, 0.55).normalize();
  private readonly snakeFade = { value: 0 };
  private readonly headFlash = { value: 0 };
  private readonly outline: ShaderMaterial;

  private readonly platforms: InstancedMesh;
  private readonly parts: Record<TowerType, Part[]>;
  private readonly crates: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly head = new Group();
  private readonly tongue: Mesh;
  private readonly pieces: InstancedMesh;
  private readonly flying: Piece[] = [];
  private readonly dummy = new Object3D();
  private readonly matrix = new Matrix4();

  /** 이번 칸으로 오기 전 마디 자리 (`to`와 길이가 같다) */
  private from: Cell[] = [];
  private to: Cell[] = [];
  /** 타워 번호마다 튀어나오기 시작한 때 */
  private popAt: number[] = [];
  /** 상자 칸마다 생긴 때 (`y * BOARD + x`) */
  private readonly boxBorn = new Map<number, number>();
  /** 카메라가 보는 곳 (판 위 x, z) */
  private readonly target = new Vector3();
  private distance = 20;
  private shakeUntil = 0;
  private time = 0;
  private headYaw = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(srgb(PAPER));

    this.outline = new ShaderMaterial({
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
    const half = BOARD / 2;
    this.addOutlined(new RoundedBoxGeometry(BOARD + 2.2, 0.9, BOARD + 2.2, 3, 0.35), this.toon(SLAB), (m) =>
      m.position.set(0, -0.55, 0),
    );
    const tiles = new InstancedMesh(new RoundedBoxGeometry(0.94, 0.24, 0.94, 2, 0.08), this.toon(WHITE), BOARD * BOARD);
    for (let y = 0; y < BOARD; y++) {
      for (let x = 0; x < BOARD; x++) {
        const i = y * BOARD + x;
        this.dummy.position.set(cellX(x), -0.12, cellX(y));
        this.dummy.updateMatrix();
        tiles.setMatrixAt(i, this.dummy.matrix);
        tiles.setColorAt(i, raw((x + y) % 2 === 0 ? TILE_A : TILE_B));
      }
    }
    this.scene.add(tiles);
    const rimLong = new RoundedBoxGeometry(BOARD + 1.6, 0.7, 0.6, 3, 0.25);
    const rimShort = new RoundedBoxGeometry(0.6, 0.7, BOARD, 3, 0.25);
    const rimMaterial = this.toon(RIM);
    for (const side of [-1, 1]) {
      this.addOutlined(rimLong, rimMaterial, (m) => m.position.set(0, 0.05, side * (half + 0.4)));
      this.addOutlined(rimShort, rimMaterial, (m) => m.position.set(side * (half + 0.4), 0.05, 0));
    }

    // 마디 받침과 타워 부품, 상자
    this.platforms = this.addInstanced(new RoundedBoxGeometry(0.84, 0.3, 0.84, 3, 0.12), this.toon(PLATFORM, true), DRAW_SEGMENTS);
    this.parts = {} as Record<TowerType, Part[]>;
    for (const type of TOWER_TYPES) {
      this.parts[type] = TOWER_SHAPES[type].map((spec) => {
        const rotation = spec.rotation ?? [0, 0, 0];
        const scale = spec.scale ?? [1, 1, 1];
        return {
          mesh: this.addInstanced(spec.geometry(), this.toon(spec.color, true), PART_CAPACITY),
          local: new Matrix4().compose(
            new Vector3(...spec.position),
            new Quaternion().setFromEuler(new Euler(...rotation)),
            new Vector3(...scale),
          ),
        };
      });
    }
    this.crates = this.addInstanced(new RoundedBoxGeometry(0.72, 0.46, 0.72, 3, 0.1), this.toon(WHITE), BOX_COUNT + 4);
    this.crates.setColorAt(0, raw(WHITE));
    this.shadows = new InstancedMesh(new CircleGeometry(1, 20).rotateX(-Math.PI / 2), shadowMaterial, DRAW_SEGMENTS + BOX_COUNT + 8);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    this.scene.add(this.shadows);

    // 머리: 뱀과 같은 눌린 공, 눈 두 개, 날름거리는 혀. 머리 묶음은 +x 쪽을 본다.
    const sphere = new SphereGeometry(1, 24, 16);
    this.addOutlined(sphere, this.toon(SNAKE, true, true), (m) => m.scale.set(HEAD_RADIUS * 1.12, HEAD_RADIUS * 0.86, HEAD_RADIUS), this.head);
    for (const side of [-1, 1]) {
      this.addOutlined(sphere, this.toon(WHITE), (m) => {
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

    // 잃은 마디가 부서져 튀는 조각
    this.pieces = new InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, 0.2), this.toon(WHITE), PIECES * 6);
    this.pieces.frustumCulled = false;
    this.pieces.count = 0;
    this.pieces.setColorAt(0, raw(PLATFORM));
    this.scene.add(this.pieces);
  }

  /** 화면 크기를 맞춘다. 위 버튼 줄(`top` px) 아래 영역의 가운데에 머리가 오게 한다. */
  resize(width: number, height: number, top: number): void {
    this.renderer.setSize(width, height, false);
    this.resolution.set(width, height);
    const area = Math.max(1, height - top);
    const aspect = width / area;
    this.camera.aspect = aspect;
    // 가로로 긴 화면은 세로로 보이는 칸 수, 세로로 긴 화면은 머리 높이의 가로 칸 수로 거리를 정한다.
    const tan = Math.tan((FOV * Math.PI) / 360);
    const elevation = (ELEVATION * Math.PI) / 180;
    const forHeight = (VIEW_CELLS * Math.sin(elevation)) / (2 * tan);
    const forWidth = NARROW_CELLS / (2 * tan * aspect);
    this.distance = Math.max(forHeight, forWidth);
    this.camera.setViewOffset(width, area, 0, -top, width, height);
    this.camera.updateProjectionMatrix();
  }

  /** 판을 새로 놓는다 (움직임 없이). 카메라도 머리로 바로 옮긴다. */
  reset(body: readonly Cell[]): void {
    this.from = body.map((c) => ({ ...c }));
    this.to = body.map((c) => ({ ...c }));
    this.snakeFade.value = 0;
    this.headFlash.value = 0;
    this.flying.length = 0;
    this.popAt = [];
    this.boxBorn.clear();
    if (body.length > 1) this.headYaw = Math.atan2(-(body[0].y - body[1].y), body[0].x - body[1].x);
    this.target.set(cellX(body[0].x), 0, cellX(body[0].y));
  }

  /**
   * 한 칸 나아갔다. `before`는 나아가기 전 몸이다.
   * 마디를 잃었으면 `lost`에 그 자리와 타워를, 상자를 먹었으면 `grown`에 튀어나올 타워 번호를 준다.
   */
  step(before: readonly Cell[], after: readonly Cell[], lost: { cell: Cell; tower: TowerType | null } | null, grown: number | null): void {
    this.from = after.map((_, i) => ({ ...(before[i] ?? before[before.length - 1]) }));
    this.to = after.map((c) => ({ ...c }));
    if (lost) {
      this.shatter(lost.cell, lost.tower);
      this.shakeUntil = this.time + SHAKE_SECONDS;
    }
    if (grown !== null) this.popAt[grown] = this.time;
  }

  /** 머리만 남은 채로 부딪혀 끝났다. */
  crash(): void {
    this.from = this.to.map((c) => ({ ...c }));
    this.shakeUntil = this.time + SHAKE_SECONDS * 1.4;
    this.headFlash.value = 1;
  }

  /** 한 장면을 그린다. */
  render(dt: number, state: ViewState): void {
    this.time += dt;
    const t = this.time;
    const { alpha, invulnerable, dead } = state;
    this.snakeFade.value += ((dead ? 0.55 : 0) - this.snakeFade.value) * Math.min(1, dt * 4);
    // 무적 동안 머리가 깜박인다.
    const blink = invulnerable > 0 && Math.sin(t * 40) > 0 ? 0.6 : 0;
    this.headFlash.value = Math.max(blink, this.headFlash.value - dt * 3);

    const n = this.to.length;
    const points: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = this.from[i];
      const b = this.to[i];
      points.push(new Vector3(cellX(a.x + (b.x - a.x) * alpha), 0, cellX(a.y + (b.y - a.y) * alpha)));
    }

    const partCounts = new Map<InstancedMesh, number>();
    const addPart = (part: Part, base: Matrix4) => {
      const index = partCounts.get(part.mesh) ?? 0;
      if (index >= PART_CAPACITY) return;
      this.matrix.multiplyMatrices(base, part.local);
      part.mesh.setMatrixAt(index, this.matrix);
      partCounts.set(part.mesh, index + 1);
    };
    let shadowCount = 0;

    // 마디: 받침 위에 그 타워. 앞 마디 쪽을 보게 돌린다.
    const count = Math.min(DRAW_SEGMENTS, n - 1);
    for (let k = 0; k < count; k++) {
      const p = points[k + 1];
      const ahead = points[k];
      const yaw = Math.atan2(-(ahead.z - p.z), ahead.x - p.x);
      const pop = Math.max(0.01, popScale(t - (this.popAt[k] ?? -10)));
      const sway = Math.sin(t * 6 - k * 0.7) * 0.03;
      this.place(this.platforms, k, p.x, 0.16, p.z, yaw, pop);
      const tower = state.towers[k];
      if (tower) {
        this.compose(p.x, sway, p.z, yaw, pop);
        for (const part of this.parts[tower]) addPart(part, this.dummy.matrix);
      }
      this.place(this.shadows, shadowCount++, p.x, 0.01, p.z, 0, 0.5 * pop);
    }
    this.platforms.count = count;
    this.platforms.instanceMatrix.needsUpdate = true;

    // 상자: 타워 색 상자 위에 작은 타워가 둥실거리며 돈다. 처음엔 튀어나온다.
    const crateColor = new Color();
    const seen = new Set<number>();
    state.boxes.forEach((box, i) => {
      const key = box.cell.y * BOARD + box.cell.x;
      seen.add(key);
      if (!this.boxBorn.has(key)) this.boxBorn.set(key, t);
      const pop = Math.max(0.01, popScale(t - this.boxBorn.get(key)!));
      const x = cellX(box.cell.x);
      const z = cellX(box.cell.y);
      this.place(this.crates, i, x, 0.23 * pop, z, 0.4, pop);
      this.crates.setColorAt(i, crateColor.copy(raw(BOX_COLORS[box.type])));
      const bob = Math.sin(t * 3 + i * 2) * 0.08;
      this.compose(x, 0.3 + bob, z, t * 1.3 + i, BOX_TOWER_SCALE * pop);
      for (const part of this.parts[box.type]) addPart(part, this.dummy.matrix);
      this.place(this.shadows, shadowCount++, x, 0.01, z, 0, 0.5 * pop);
    });
    for (const key of [...this.boxBorn.keys()]) if (!seen.has(key)) this.boxBorn.delete(key);
    this.crates.count = state.boxes.length;
    this.crates.instanceMatrix.needsUpdate = true;
    if (this.crates.instanceColor) this.crates.instanceColor.needsUpdate = true;

    for (const type of TOWER_TYPES) {
      for (const part of this.parts[type]) {
        part.mesh.count = partCounts.get(part.mesh) ?? 0;
        part.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // 머리
    const headPos = points[0];
    if (n > 1) {
      const dir = headPos.clone().sub(points[1]);
      if (dir.lengthSq() > 1e-6) this.headYaw = Math.atan2(-dir.z, dir.x);
    }
    const bob = dead ? 0 : Math.sin(t * 9) * 0.03;
    this.head.position.set(headPos.x, HEAD_RADIUS * 0.86 + bob, headPos.z);
    this.head.rotation.set(0, this.headYaw, 0);
    const flick = Math.max(0, Math.sin(t * 6.5)) ** 6;
    this.tongue.scale.set(dead ? 0.01 : 0.3 + flick, 1, 1);
    this.tongue.position.x = 0.38 + 0.15 * (dead ? 0 : 0.3 + flick);
    this.place(this.shadows, shadowCount++, headPos.x, 0.01, headPos.z, 0, HEAD_RADIUS * 1.1);
    this.shadows.count = shadowCount;
    this.shadows.instanceMatrix.needsUpdate = true;

    this.updatePieces(dt);

    // 카메라: 머리를 부드럽게 따라가고, 피해를 받으면 떨린다.
    this.target.lerp(headPos, 1 - Math.exp(-dt * FOLLOW));
    const shake = Math.max(0, this.shakeUntil - t) / SHAKE_SECONDS;
    const jitter = Math.min(1, shake) ** 2 * 0.12;
    const elevation = (ELEVATION * Math.PI) / 180;
    this.camera.position.set(
      this.target.x + Math.sin(t * 61) * jitter,
      Math.sin(elevation) * this.distance,
      this.target.z + Math.cos(elevation) * this.distance + Math.cos(t * 53) * jitter,
    );
    this.camera.lookAt(this.target.x, 0, this.target.z);
    this.renderer.render(this.scene, this.camera);
  }

  /** 화면에 보이는 대략의 칸 수 (가로, 세로). 미니맵의 보기 상자 크기 */
  get visible(): { readonly width: number; readonly height: number } {
    const span = 2 * this.distance * Math.tan((FOV * Math.PI) / 360);
    return { width: span * this.camera.aspect, height: span / Math.sin((ELEVATION * Math.PI) / 180) };
  }

  /** 지금 카메라가 보는 판 위 자리 (칸 단위, 미니맵의 보기 상자) */
  get focus(): { readonly x: number; readonly z: number } {
    return { x: this.target.x + (BOARD - 1) / 2, z: this.target.z + (BOARD - 1) / 2 };
  }

  /** `this.dummy.matrix`를 자리·방향·크기로 만든다. */
  private compose(x: number, y: number, z: number, yaw: number, scale: number): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, yaw, 0);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
  }

  private place(mesh: InstancedMesh, index: number, x: number, y: number, z: number, yaw: number, scale: number): void {
    this.compose(x, y, z, yaw, scale);
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private shatter(cell: Cell, tower: TowerType | null): void {
    const colors = [PLATFORM, ...(tower ? TOWER_SHAPES[tower].map((p) => p.color) : [])];
    for (let i = 0; i < PIECES; i++) {
      const angle = (i / PIECES) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 1.5 + Math.random() * 1.8;
      this.flying.push({
        position: new Vector3(cellX(cell.x), 0.4, cellX(cell.y)),
        velocity: new Vector3(Math.cos(angle) * speed, 3.5 + Math.random() * 2.5, Math.sin(angle) * speed),
        color: colors[i % colors.length],
        size: 0.12 + Math.random() * 0.1,
        age: 0,
      });
    }
    if (this.flying.length > PIECES * 6) this.flying.splice(0, this.flying.length - PIECES * 6);
  }

  private updatePieces(dt: number): void {
    let count = 0;
    for (const p of this.flying) {
      p.age += dt;
      if (p.age > PIECE_SECONDS) continue;
      p.velocity.y -= 14 * dt;
      p.position.addScaledVector(p.velocity, dt);
      if (p.position.y < p.size / 2) {
        p.position.y = p.size / 2;
        p.velocity.y *= -0.35;
        p.velocity.x *= 0.6;
        p.velocity.z *= 0.6;
      }
      this.dummy.position.copy(p.position);
      this.dummy.rotation.set(p.age * 7, p.age * 5, 0);
      this.dummy.scale.setScalar(p.size * (1 - (p.age / PIECE_SECONDS) ** 3));
      this.dummy.updateMatrix();
      this.pieces.setMatrixAt(count, this.dummy.matrix);
      this.pieces.setColorAt(count, raw(p.color));
      count++;
    }
    for (let i = this.flying.length - 1; i >= 0; i--) if (this.flying[i].age > PIECE_SECONDS) this.flying.splice(i, 1);
    this.pieces.count = count;
    this.pieces.instanceMatrix.needsUpdate = true;
    if (this.pieces.instanceColor) this.pieces.instanceColor.needsUpdate = true;
  }

  /** 인스턴스 메시와 그 선 테두리를 더하고 메시를 돌려준다. 테두리는 메시의 행렬을 함께 쓴다. */
  private addInstanced(geometry: BufferGeometry, material: Material, capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, capacity);
    const shell = new InstancedMesh(geometry, this.outline, capacity);
    shell.instanceMatrix = mesh.instanceMatrix;
    for (const m of [mesh, shell]) {
      m.frustumCulled = false;
      m.count = 0;
    }
    // 테두리 수는 메시를 따른다.
    Object.defineProperty(shell, 'count', { get: () => mesh.count, set: () => {} });
    this.scene.add(shell, mesh);
    return mesh;
  }

  /** 툰 재질. `snake`면 끝났을 때 바래고, `head`면 번쩍인다. */
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
  private addOutlined(geometry: BufferGeometry, material: Material, place: (mesh: Mesh) => void, parent: Object3D = this.scene): Mesh {
    const mesh = new Mesh(geometry, material);
    place(mesh);
    const shell = new Mesh(geometry, this.outline);
    shell.position.copy(mesh.position);
    shell.rotation.copy(mesh.rotation);
    shell.scale.copy(mesh.scale);
    parent.add(shell, mesh);
    return mesh;
  }
}
