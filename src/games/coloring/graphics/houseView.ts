import {
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  GLSL3,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import paintVert from '../shaders/paint.vert?raw';
import paintFrag from '../shaders/paint.frag?raw';
import skyVert from '../shaders/sky.vert?raw';
import skyFrag from '../shaders/sky.frag?raw';
import outlineVert from '../shaders/outline.vert?raw';
import outlineFrag from '../shaders/outline.frag?raw';
import {
  DOOR,
  doorOpenness,
  type MoverPose,
  type PaintPart,
  type PartGeometry,
  SKY_RADIUS,
  type Solid,
  SUN_DIRECTION,
  SUN_DISTANCE,
  walkerPose,
  WALKERS,
} from '../house';
import type { FreeCamera } from '../freeCamera';
import type { Rgb } from '../palette';

const CONFETTI_COUNT = 180;
/** 세로 시야 (도). 세로로 긴 화면에서는 가로 시야가 MIN_HORIZONTAL_FOV가 되도록 MAX_VERTICAL_FOV까지 넓힌다. */
const VERTICAL_FOV = 55;
const MIN_HORIZONTAL_FOV = 62;
const MAX_VERTICAL_FOV = 95;
const CONFETTI_SECONDS = 4.5;
/** 선 굵기 (CSS px) */
const OUTLINE_PX = 2.2;
/** 칠하지 않은 종이색과 선 색 (sRGB) */
const PAPER: Rgb = [0xfb / 255, 0xf6 / 255, 0xec / 255];
const INK: Rgb = [0x2a / 255, 0x22 / 255, 0x1e / 255];
/** 해를 칠하기 전 해 질 녘 빛 */
const DUSK_LIGHT: Rgb = [1, 0.84, 0.7];
/** 해를 칠하기 전 하늘의 해 쪽 노을빛 */
const SUN_GLOW: Rgb = [1, 0.72, 0.45];

const srgb = (rgb: Rgb) => new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);

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

/** 칠한 조각 하나의 그리기 상태 */
interface PaintMesh {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly part: PaintPart;
  /** 메시 자체 좌표의 경계 상자 (번질 거리 계산) */
  readonly bounds: Box3;
  color: Rgb;
  painted: boolean;
}

// ─── 지오메트리 ──────────────────────────────────────────────

/** 기본 도형 하나의 지오메트리 (주인 자리 기준) */
function solidGeometry(solid: Solid): BufferGeometry {
  let geometry: BufferGeometry;
  if ('box' in solid) geometry = new BoxGeometry(...solid.box);
  else if ('cylinder' in solid) geometry = new CylinderGeometry(...solid.cylinder, 18);
  else if ('sphere' in solid) geometry = new SphereGeometry(solid.sphere, 18, 12);
  else if ('blob' in solid) geometry = new IcosahedronGeometry(solid.blob, 1);
  else geometry = new CapsuleGeometry(...solid.capsule, 4, 12);
  if ('rotation' in solid && solid.rotation) geometry.rotateX(solid.rotation[0]).rotateY(solid.rotation[1]).rotateZ(solid.rotation[2]);
  geometry.translate(...solid.at);
  // 합치려면 모두 인덱스가 없어야 한다 (다면체는 인덱스가 없다).
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** 조각 모양마다의 지오메트리 */
function partGeometry(geometry: PartGeometry): BufferGeometry {
  switch (geometry.kind) {
    case 'sky':
      return new SphereGeometry(SKY_RADIUS, 48, 24);
    case 'sun': {
      const [x, y, z] = SUN_DIRECTION;
      return new SphereGeometry(18, 32, 16).translate(x * SUN_DISTANCE, y * SUN_DISTANCE, z * SUN_DISTANCE);
    }
    case 'disc':
      return new CircleGeometry(geometry.radius, 64).rotateX(-Math.PI / 2).translate(0, geometry.y, 0);
    case 'solids': {
      const list = geometry.solids.map(solidGeometry);
      return list.length === 1 ? list[0] : mergeGeometries(list);
    }
  }
}

/** 테두리 껍데기: 꼭짓점을 합쳐 부드러운 법선을 만든다. */
function hullGeometry(geometry: BufferGeometry): BufferGeometry {
  const plain = new BufferGeometry();
  plain.setAttribute('position', geometry.getAttribute('position'));
  if (geometry.index) plain.setIndex(geometry.index);
  const merged = mergeVertices(plain, 1e-3);
  merged.computeVertexNormals();
  return merged;
}

// ─── 보기 ────────────────────────────────────────────────

/**
 * 색칠 놀이의 3D 장면을 three.js로 그린다. 조각마다 메시 하나와 셰이더 재질 하나를 두고, 칠하면 그 재질의 uniform만 바꾼다.
 * 누르기는 화면 좌표에서 광선을 쏘아 가장 가까운 조각을 찾는다. 다 칠하면 화면 위에 색종이를 뿌린다.
 */
export class HouseView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(VERTICAL_FOV, 1, 0.3, 1200);
  private readonly overlay = new Scene();
  private readonly overlayCamera = new OrthographicCamera(0, 1, 1, 0, -10, 10);
  private readonly paints: PaintMesh[] = [];
  private readonly pickables: Mesh[] = [];
  private readonly raycaster = new Raycaster();
  private readonly people: Group[] = [];
  /** 문 경첩. 문을 칠하면 돌아 열린다. */
  private readonly hinge = new Group();
  /** 문을 칠한 시각 (`time` 기준 초), 아직이면 `null`. 일시 정지해도 문은 열린다. */
  private doorPaintedAt: number | null = null;
  private readonly confetti: InstancedMesh;
  private readonly pieces: Confetti[] = [];
  private readonly dummy = new Object3D();
  private readonly start = performance.now();
  private readonly resolution = new Vector2(1, 1);
  private width = 1;
  private height = 1;
  private celebratedAt = -Infinity;
  private elapsed = 0;

  /** 하늘의 해 쪽 노을빛. 해를 칠하면 그 색이 섞인다. */
  private readonly skySunColor = new Vector3(...SUN_GLOW);
  /** 모든 칠하기 재질이 함께 쓰는 uniform */
  private readonly shared = {
    uTime: { value: 0 },
    uHint: { value: 0 },
    // 툰 음영의 빛은 해(뒤쪽)가 아니라 처음 시점의 왼쪽 위 앞에서 온다. 역광이면 칠한 색이 어둡게 묻혀서다.
    uLightDir: { value: new Vector3(-0.45, 0.8, 0.4).normalize() },
    uLightColor: { value: new Vector3(...DUSK_LIGHT) },
    uHintColor: { value: new Vector3(1, 0.86, 0.45) },
  };

  constructor(
    canvas: HTMLCanvasElement,
    parts: readonly PaintPart[],
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(srgb(PAPER));
    this.renderer.autoClear = false;
    this.camera.rotation.order = 'YXZ';

    const outlineMaterial = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: outlineVert,
      fragmentShader: outlineFrag,
      side: BackSide,
      uniforms: {
        uThickness: { value: OUTLINE_PX },
        uResolution: { value: this.resolution },
        uInk: { value: new Vector3(...INK) },
      },
    });
    this.people = WALKERS.map((walker) => {
      const group = new Group();
      group.scale.setScalar(walker.height);
      this.scene.add(group);
      return group;
    });
    this.hinge.position.set(...DOOR.hinge);
    this.scene.add(this.hinge);

    parts.forEach((part, i) => {
      const geometry = partGeometry(part.geometry);
      geometry.computeBoundingBox();
      const material = this.paintMaterial(part);
      const mesh = new Mesh(geometry, material);
      mesh.userData.region = i + 1;
      const owner = part.owner;
      if (owner.kind === 'static') {
        mesh.position.set(...owner.position);
        mesh.rotation.y = owner.rotationY;
        this.scene.add(mesh);
      } else if (owner.kind === 'walker') {
        this.people[owner.index].add(mesh);
      } else {
        this.hinge.add(mesh);
      }
      if (!part.noOutline) mesh.add(new Mesh(hullGeometry(geometry), outlineMaterial));
      if (part.geometry.kind === 'sky') {
        mesh.renderOrder = -1;
        mesh.frustumCulled = false;
      }
      this.paints.push({ mesh, part, bounds: geometry.boundingBox ?? new Box3(), color: PAPER, painted: false });
      this.pickables.push(mesh);
    });

    this.confetti = new InstancedMesh(new PlaneGeometry(1, 0.6), new MeshBasicMaterial({ side: DoubleSide }), CONFETTI_COUNT);
    this.confetti.visible = false;
    this.confetti.frustumCulled = false;
    this.overlay.add(this.confetti);
    this.update(0);
  }

  /** 화면이 켜진 뒤 흐른 시간 (초). 셰이더의 시각과 같다. */
  get time(): number {
    return (performance.now() - this.start) / 1000;
  }

  /** 모든 조각을 칠하지 않은 종이로 되돌린다. */
  resetPaint(): void {
    for (const paint of this.paints) {
      const u = paint.mesh.material.uniforms;
      u.uNew.value.set(...PAPER);
      u.uPrev.value.set(...PAPER);
      u.uStart.value = -1000;
      u.uUnfilled.value = 1;
      if (u.uPainted) u.uPainted.value = 0;
      if (u.uPrevPainted) u.uPrevPainted.value = 0;
      if (u.uGlow) u.uGlow.value = 0;
      paint.color = PAPER;
      paint.painted = false;
    }
    this.shared.uLightColor.value.set(...DUSK_LIGHT);
    this.skySunColor.set(...SUN_GLOW);
  }

  /** 화면 좌표(CSS px, 캔버스 기준)에 있는 조각의 영역 번호와 맞은 자리(세계 좌표). 없으면 `null` */
  pick(x: number, y: number): { region: number; point: Vector3 } | null {
    this.raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit) return null;
    return { region: hit.object.userData.region as number, point: hit.point.clone() };
  }

  /** 조각을 칠한다. `point`(세계 좌표, 없으면 조각 가운데)에서 색이 번져 나간다. */
  paintRegion(region: number, color: Rgb, point?: Vector3): void {
    const paint = this.paints[region - 1];
    if (!paint) return;
    const { mesh, bounds } = paint;
    const u = mesh.material.uniforms;
    mesh.updateWorldMatrix(true, false);
    // 누른 자리가 없으면 가운데에서 번진다. 하늘 구의 가운데는 방향이 없으므로 해 쪽에서 번지게 한다.
    const origin = point
      ? mesh.worldToLocal(point.clone())
      : paint.part.geometry.kind === 'sky'
        ? new Vector3(...SUN_DIRECTION)
        : bounds.getCenter(new Vector3());
    let reach = 0;
    for (const corner of boxCorners(bounds)) reach = Math.max(reach, corner.distanceTo(origin));
    u.uPrev.value.set(...paint.color);
    u.uNew.value.set(...color);
    u.uOrigin.value.copy(origin);
    u.uStart.value = this.time;
    u.uReach.value = reach * 1.02 + 0.05;
    u.uUnfilled.value = 0;
    if (u.uPainted) {
      u.uPrevPainted.value = paint.painted ? 1 : 0;
      u.uPainted.value = 1;
    }
    if (u.uGlow) u.uGlow.value = paint.part.glow ? 1 : 0;
    paint.color = color;
    paint.painted = true;
    if (paint.part.geometry.kind === 'sun') {
      this.shared.uLightColor.value.set(...mixRgb(DUSK_LIGHT, color, 0.5));
      this.skySunColor.set(...mixRgb(SUN_GLOW, color, 0.5));
    }
  }

  /** 안 칠한 조각 반짝임의 세기 0~1 */
  setHint(amount: number): void {
    this.shared.uHint.value = amount;
  }

  /** 화면 크기 (CSS px) */
  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.resolution.set(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    // 세로로 긴 화면(휴대폰)에서도 옆이 너무 좁아지지 않게, 가로 시야를 최소 MIN_HORIZONTAL_FOV로 맞춘다.
    const horizontal = (MIN_HORIZONTAL_FOV * Math.PI) / 180;
    const vertical = (2 * Math.atan(Math.tan(horizontal / 2) / this.camera.aspect) * 180) / Math.PI;
    this.camera.fov = Math.min(MAX_VERTICAL_FOV, Math.max(VERTICAL_FOV, vertical));
    this.camera.updateProjectionMatrix();
    this.overlayCamera.right = this.width;
    this.overlayCamera.top = this.height;
    this.overlayCamera.updateProjectionMatrix();
  }

  /** 다 칠했을 때: 화면 아래 양쪽 모서리에서 색종이가 터져 오른다. */
  celebrate(colors: readonly Rgb[]): void {
    this.celebratedAt = this.time;
    this.pieces.length = 0;
    const power = Math.sqrt(this.height) * 34;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      // 화면 양쪽 아래 모서리에서 안쪽 위로 부채꼴로 쏜다.
      const angle = Math.PI / 2 + side * (0.25 + Math.random() * 0.45);
      const speed = power * (0.6 + Math.random() * 0.5);
      this.pieces.push({
        x: side < 0 ? 0 : this.width,
        y: 0,
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

  /** 문 열림 정도 0~1 */
  get doorOpenness(): number {
    return doorOpenness(this.doorPaintedAt, this.time);
  }

  /** 문을 연다. `instant`면 곧바로 다 열린다 (이어 하기). 이미 열리고 있으면 그대로 둔다. */
  openDoor(instant = false): void {
    if (this.doorPaintedAt !== null) return;
    this.doorPaintedAt = instant ? -Infinity : this.time;
  }

  /** 문을 닫는다 (새 판). */
  closeDoor(): void {
    this.doorPaintedAt = null;
  }

  /** 사람을 `seconds`만큼 움직인다. */
  update(seconds: number): void {
    this.elapsed += seconds;
    this.people.forEach((group, i) => place(group, walkerPose(WALKERS[i], this.elapsed)));
  }

  render(view: FreeCamera, frameSeconds: number): void {
    const now = this.time;
    this.shared.uTime.value = now;
    this.camera.position.set(...view.position);
    this.camera.rotation.set(view.pitch, view.yaw, 0);
    this.hinge.rotation.y = DOOR.openAngle * this.doorOpenness;
    if (this.confetti.visible) this.updateConfetti(frameSeconds, now - this.celebratedAt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.overlay, this.overlayCamera);
  }

  dispose(): void {
    this.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (object.material as ShaderMaterial).dispose();
      }
    });
    this.confetti.geometry.dispose();
    this.renderer.dispose();
  }

  private paintMaterial(part: PaintPart): ShaderMaterial {
    const own = {
      uNew: { value: new Vector3(...PAPER) },
      uPrev: { value: new Vector3(...PAPER) },
      uOrigin: { value: new Vector3() },
      uStart: { value: -1000 },
      uReach: { value: 1 },
      uUnfilled: { value: 1 },
    };
    if (part.geometry.kind === 'sky') {
      return new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: BackSide,
        depthWrite: false,
        uniforms: {
          ...own,
          uPainted: { value: 0 },
          uPrevPainted: { value: 0 },
          uTime: this.shared.uTime,
          uHint: this.shared.uHint,
          uHintColor: this.shared.uHintColor,
          uSunDir: { value: new Vector3(...SUN_DIRECTION) },
          uSunColor: { value: this.skySunColor },
          uPaper: { value: new Vector3(...PAPER) },
        },
      });
    }
    return new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: paintVert,
      fragmentShader: paintFrag,
      side: DoubleSide,
      uniforms: { ...own, uGlow: { value: 0 }, ...this.shared },
    });
  }

  private updateConfetti(dt: number, since: number): void {
    if (since > CONFETTI_SECONDS) {
      this.confetti.visible = false;
      return;
    }
    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i];
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
}

/** 걷는 사람을 자리에 놓는다. */
function place(group: Group, pose: MoverPose): void {
  group.position.set(pose.x, pose.bob, pose.z);
  group.rotation.y = pose.heading;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function boxCorners(box: Box3): Vector3[] {
  const corners: Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new Vector3(x, y, z));
  return corners;
}
