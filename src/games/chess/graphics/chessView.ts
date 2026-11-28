import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RedFormat,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BISHOP, colorOf, fileOf, KING, KNIGHT, PAWN, QUEEN, rankOf, ROOK, typeOf, type MoveEffect } from '../rules';

const PAPER = '#fbf6ec';
const INK = '#2a221e';
const LIGHT_SQUARE = '#f3e3c3';
const DARK_SQUARE = '#9cc5b0';
const WHITE_PIECE = '#fffaf0';
const BLACK_PIECE = '#4b3f63';
const SELECTED = '#ffd84d';
const LAST_MOVE = '#ffe9a0';
const CHECK = '#ff7a6b';
/** 기물 테두리 두께 (세계 단위, 칸 하나가 1) */
const OUTLINE = 0.024;
/** 세로 시야 (도) */
const FOV = 38;
/** 카메라가 판을 내려다보는 각 (도, 수평에서). 세로로 긴 화면에서는 더 위에서 내려다봐서 판을 크게 보인다. */
const PITCH = 54;
const PORTRAIT_PITCH = 66;
/** 위 버튼 줄 높이 (CSS px). 판이 그 아래에 들어오게 맞춘다. */
const TOP_BAR = 64;

const srgb = (hex: string) => new Color().setStyle(hex, SRGBColorSpace);

/** 칸 가운데의 세계 좌표 (백이 +z 쪽, 카메라 쪽) */
const squareX = (square: number) => fileOf(square) - 3.5;
const squareZ = (square: number) => 3.5 - rankOf(square);

// ─── 기물 모양 ──────────────────────────────────────────────

type Profile = [number, number][];

/** 모든 기물이 함께 쓰는 받침 */
const BASE: Profile = [
  [0, 0],
  [0.36, 0],
  [0.37, 0.05],
  [0.33, 0.09],
  [0.31, 0.13],
  [0.24, 0.17],
];

const PROFILES: Record<number, Profile> = {
  [PAWN]: [...BASE.map(([r, y]): [number, number] => [r * 0.88, y * 0.9]), [0.13, 0.3], [0.1, 0.42], [0.19, 0.45], [0.19, 0.48], [0.08, 0.5], [0, 0.5]],
  [ROOK]: [...BASE, [0.21, 0.26], [0.2, 0.58], [0.27, 0.62], [0.27, 0.72], [0, 0.72]],
  [KNIGHT]: [...BASE, [0.22, 0.24], [0.23, 0.3], [0, 0.3]],
  [BISHOP]: [...BASE, [0.15, 0.3], [0.11, 0.5], [0.2, 0.53], [0.2, 0.56], [0.12, 0.59], [0.17, 0.68], [0.18, 0.76], [0.14, 0.85], [0.06, 0.92], [0, 0.93]],
  [QUEEN]: [...BASE, [0.16, 0.3], [0.11, 0.62], [0.22, 0.66], [0.22, 0.69], [0.13, 0.72], [0.17, 0.86], [0.23, 0.96], [0.12, 0.95], [0, 0.97]],
  [KING]: [...BASE, [0.17, 0.3], [0.12, 0.66], [0.23, 0.7], [0.23, 0.73], [0.14, 0.76], [0.19, 0.92], [0.21, 0.98], [0, 1.0]],
};

/** 지오메트리를 합칠 수 있게 색인 없이, 위치와 법선만 남긴다. */
function plain(geometry: BufferGeometry): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.deleteAttribute('uv');
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  return flat;
}

const lathe = (profile: Profile) => new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 32);

/** 나이트 머리: 코가 -z(상대 쪽)를 보게 세운 말머리 판 */
function knightHead(): BufferGeometry {
  const shape = new Shape();
  const outline: [number, number][] = [
    [-0.17, 0.27],
    [0.17, 0.27],
    [0.11, 0.44],
    [0.08, 0.53],
    [0.25, 0.6],
    [0.3, 0.68],
    [0.24, 0.78],
    [0.06, 0.88],
    [0.03, 0.97],
    [-0.05, 0.9],
    [-0.15, 0.84],
    [-0.21, 0.62],
  ];
  outline.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.04, bevelSegments: 2 });
  geometry.translate(0, 0, -0.08);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function pieceGeometry(type: number): BufferGeometry {
  const parts: BufferGeometry[] = [lathe(PROFILES[type])];
  switch (type) {
    case PAWN:
      parts.push(new SphereGeometry(0.15, 24, 12).translate(0, 0.62, 0));
      break;
    case ROOK:
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const merlon = new BoxGeometry(0.15, 0.12, 0.11).translate(0, 0.78, 0.19).rotateY(angle);
        parts.push(merlon);
      }
      break;
    case KNIGHT:
      parts.push(knightHead());
      break;
    case BISHOP:
      parts.push(new SphereGeometry(0.055, 16, 8).translate(0, 0.97, 0));
      break;
    case QUEEN:
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        parts.push(new SphereGeometry(0.045, 12, 6).translate(Math.cos(angle) * 0.2, 0.99, Math.sin(angle) * 0.2));
      }
      parts.push(new SphereGeometry(0.07, 16, 8).translate(0, 1.03, 0));
      break;
    case KING:
      parts.push(new BoxGeometry(0.07, 0.24, 0.07).translate(0, 1.11, 0));
      parts.push(new BoxGeometry(0.2, 0.07, 0.07).translate(0, 1.13, 0));
      break;
  }
  const merged = mergeGeometries(parts.map(plain));
  if (!merged) throw new Error('기물 지오메트리를 합치지 못했습니다.');
  return merged;
}

/** 선 그림 테두리용 껍데기: 꼭짓점을 합쳐 부드러운 법선을 만들고 법선 쪽으로 부풀린다. 뒷면만 그린다. */
function hullGeometry(source: BufferGeometry, thickness: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', source.getAttribute('position').clone());
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();
  const position = merged.getAttribute('position') as BufferAttribute;
  const normal = merged.getAttribute('normal') as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      position.getX(i) + normal.getX(i) * thickness,
      position.getY(i) + normal.getY(i) * thickness,
      position.getZ(i) + normal.getZ(i) * thickness,
    );
  }
  return merged;
}

/** 세 단계로 끊기는 툰 음영 */
function toonGradient(): DataTexture {
  const texture = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// ─── 움직임 ─────────────────────────────────────────────────

interface Tween {
  readonly update: (t: number) => void;
  readonly seconds: number;
  elapsed: number;
  readonly done: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** 판 위의 기물 하나 */
interface PieceObject {
  readonly group: Group;
  piece: number;
}

export interface Highlights {
  /** 고른 칸. 없으면 -1 */
  readonly selected: number;
  /** 고른 기물이 갈 수 있는 칸과 그 칸에 잡을 기물이 있는지 */
  readonly targets: readonly { readonly square: number; readonly capture: boolean }[];
  /** 마지막 수의 두 칸 */
  readonly lastMove: readonly number[];
  /** 공격받는 킹의 칸들 (룰렛 체스는 어느 편이 둘지 몰라 두 킹을 다 본다) */
  readonly checks: readonly number[];
}

/** 체스 판 그리기: 판, 기물, 표시, 기물 움직임, 눌린 칸 찾기 */
export class ChessView {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private readonly squares: InstancedMesh;
  private readonly squareColors: Color[] = [];
  private readonly pieces = new Map<number, PieceObject>();
  private readonly pieceRoot = new Group();
  private readonly geometries = new Map<number, { fill: BufferGeometry; hull: BufferGeometry }>();
  private readonly whiteMaterial: MeshToonMaterial;
  private readonly blackMaterial: MeshToonMaterial;
  private readonly inkMaterial = new MeshBasicMaterial({ color: srgb(INK), side: BackSide });
  private readonly dots: Mesh[] = [];
  private readonly rings: Mesh[] = [];
  private readonly tweens: Tween[] = [];
  private readonly raycaster = new Raycaster();
  private thinking = false;
  private time = 0;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.scene.background = srgb(PAPER);

    const gradient = toonGradient();
    this.whiteMaterial = new MeshToonMaterial({ color: srgb(WHITE_PIECE), gradientMap: gradient });
    this.blackMaterial = new MeshToonMaterial({ color: srgb(BLACK_PIECE), gradientMap: gradient });

    this.scene.add(new AmbientLight(0xffffff, 1.1));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(-3.5, 9, 4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -6.5;
    sun.shadow.camera.right = sun.shadow.camera.top = 6.5;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 25;
    sun.shadow.bias = -0.0008;
    sun.shadow.radius = 3;
    this.scene.add(sun);

    // 판 받침: 종이색 두꺼운 판과 잉크 테두리
    const frameGeometry = new BoxGeometry(8.8, 0.36, 8.8).translate(0, -0.181, 0);
    const frame = new Mesh(frameGeometry, new MeshToonMaterial({ color: srgb('#e9dcc6'), gradientMap: gradient }));
    frame.receiveShadow = true;
    this.scene.add(frame);
    const frameInk = new Mesh(new BoxGeometry(8.8 + OUTLINE * 4, 0.36 + OUTLINE * 4, 8.8 + OUTLINE * 4).translate(0, -0.181, 0), this.inkMaterial);
    this.scene.add(frameInk);
    // 판 아래 그림자처럼 놓인 잉크 판 (종이를 오려 붙인 느낌)
    const drop = new Mesh(new PlaneGeometry(9.2, 9.2).rotateX(-Math.PI / 2).translate(0.18, -0.4, 0.26), new MeshBasicMaterial({ color: srgb(INK) }));
    this.scene.add(drop);

    const squareGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.squares = new InstancedMesh(squareGeometry, new MeshToonMaterial({ gradientMap: gradient }), 64);
    this.squares.receiveShadow = true;
    const holder = new Object3D();
    for (let sq = 0; sq < 64; sq++) {
      holder.position.set(squareX(sq), 0, squareZ(sq));
      holder.updateMatrix();
      this.squares.setMatrixAt(sq, holder.matrix);
      this.squareColors.push(srgb((fileOf(sq) + rankOf(sq)) % 2 === 0 ? DARK_SQUARE : LIGHT_SQUARE));
      this.squares.setColorAt(sq, this.squareColors[sq]);
    }
    this.scene.add(this.squares);

    // 갈 수 있는 칸 표시: 빈 칸은 점, 잡을 수 있는 칸은 고리
    const markMaterial = new MeshBasicMaterial({ color: srgb(INK), transparent: true, opacity: 0.38, depthWrite: false });
    const dotGeometry = new CircleGeometry(0.15, 24).rotateX(-Math.PI / 2);
    const ringGeometry = new RingGeometry(0.39, 0.47, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < 28; i++) {
      const dot = new Mesh(dotGeometry, markMaterial);
      const ring = new Mesh(ringGeometry, markMaterial);
      dot.visible = ring.visible = false;
      dot.renderOrder = ring.renderOrder = 1;
      this.dots.push(dot);
      this.rings.push(ring);
      this.scene.add(dot, ring);
    }

    this.scene.add(this.pieceRoot);
  }

  private geometryOf(type: number) {
    let entry = this.geometries.get(type);
    if (!entry) {
      const fill = pieceGeometry(type);
      entry = { fill, hull: hullGeometry(fill, OUTLINE) };
      this.geometries.set(type, entry);
    }
    return entry;
  }

  private makePiece(piece: number, square: number): PieceObject {
    const group = new Group();
    this.dressPiece(group, piece, square);
    group.position.set(squareX(square), 0, squareZ(square));
    this.pieceRoot.add(group);
    const object = { group, piece };
    this.pieces.set(square, object);
    return object;
  }

  /** 기물 모양을 (다시) 입힌다. 승진하면 모양이 바뀐다. */
  private dressPiece(group: Group, piece: number, square: number): void {
    group.clear();
    const { fill, hull } = this.geometryOf(typeOf(piece));
    const body = new Mesh(fill, colorOf(piece) > 0 ? this.whiteMaterial : this.blackMaterial);
    body.castShadow = true;
    const ink = new Mesh(hull, this.inkMaterial);
    group.add(body, ink);
    // 기물은 상대 쪽을 본다. 나이트는 옆모습이 보이게 판 가운데 쪽으로 비스듬히 돌린다.
    const facing = colorOf(piece) > 0 ? 0 : Math.PI;
    const inward = fileOf(square) < 4 ? 1 : -1;
    group.rotation.y = facing - (typeOf(piece) === KNIGHT ? inward * colorOf(piece) * (Math.PI / 3) : 0);
  }

  /** 판의 기물을 움직임 없이 그대로 놓는다. */
  setBoard(board: ArrayLike<number>): void {
    this.tweens.length = 0;
    this.pieceRoot.clear();
    this.pieces.clear();
    for (let sq = 0; sq < 64; sq++) if (board[sq] !== 0) this.makePiece(board[sq], sq);
  }

  private tween(seconds: number, update: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ update, seconds, elapsed: 0, done: resolve });
    });
  }

  /** 기물 하나를 들어 옮긴다. 나이트는 더 높이 뛴다. */
  private slide(object: PieceObject, from: number, to: number, seconds: number): Promise<void> {
    const start = new Vector3(squareX(from), 0, squareZ(from));
    const end = new Vector3(squareX(to), 0, squareZ(to));
    const distance = start.distanceTo(end);
    const lift = typeOf(object.piece) === KNIGHT ? 0.9 : 0.2 + distance * 0.05;
    return this.tween(seconds, (t) => {
      const k = easeInOut(t);
      object.group.position.lerpVectors(start, end, k);
      object.group.position.y = Math.sin(Math.PI * k) * lift;
    });
  }

  /** 수 하나를 움직여 보여 준다. 판 상태는 이미 그 수를 둔 뒤다. */
  async play(effect: MoveEffect, seconds = 0.42): Promise<void> {
    const { move } = effect;
    const mover = this.pieces.get(move.from);
    if (!mover) return;
    this.pieces.delete(move.from);
    const victim = effect.capturedAt !== null ? this.pieces.get(effect.capturedAt) : undefined;
    if (effect.capturedAt !== null) this.pieces.delete(effect.capturedAt);
    this.pieces.set(move.to, mover);
    const moving: Promise<void>[] = [this.slide(mover, move.from, move.to, seconds)];
    if (effect.rook) {
      const rook = this.pieces.get(effect.rook.from);
      if (rook) {
        this.pieces.delete(effect.rook.from);
        this.pieces.set(effect.rook.to, rook);
        moving.push(this.slide(rook, effect.rook.from, effect.rook.to, seconds));
      }
    }
    if (victim) {
      // 잡힌 기물은 기물이 닿을 무렵 튕겨 오르며 작아진다.
      const group = victim.group;
      const base = group.position.clone();
      const away = new Vector3(Math.sign(base.x || 1) * 0.6, 0, colorOf(victim.piece) > 0 ? 0.6 : -0.6);
      moving.push(
        this.tween(seconds * 1.6, (t) => {
          const k = Math.max(0, (t - 0.45) / 0.55);
          group.position.set(base.x + away.x * k, Math.sin(Math.PI * k) * 0.6, base.z + away.z * k);
          group.scale.setScalar(Math.max(0.001, 1 - k));
          group.rotation.z = k * 1.4;
        }).then(() => void group.removeFromParent()),
      );
    }
    await Promise.all(moving);
    if (move.promotion) {
      const piece = move.promotion * colorOf(effect.piece);
      mover.piece = piece;
      this.dressPiece(mover.group, piece, move.to);
      await this.tween(0.3, (t) => mover.group.scale.setScalar(1 + Math.sin(Math.PI * t) * 0.25));
    }
  }

  /** 체크메이트: 진 킹이 넘어진다. */
  topple(square: number): void {
    const king = this.pieces.get(square);
    if (!king) return;
    const side = fileOf(square) < 4 ? 1 : -1;
    void this.tween(0.9, (t) => {
      const k = t < 0.25 ? -Math.sin((t / 0.25) * Math.PI) * 0.08 : easeInOut((t - 0.25) / 0.75);
      king.group.rotation.z = side * k * 1.35;
      king.group.position.y = Math.max(0, k) * 0.18;
    });
  }

  /** 컴퓨터가 생각하는 동안 흑 킹이 갸웃거린다. */
  setThinking(thinking: boolean): void {
    this.thinking = thinking;
  }

  setHighlights(highlights: Highlights): void {
    const color = new Color();
    for (let sq = 0; sq < 64; sq++) {
      color.copy(this.squareColors[sq]);
      if (highlights.lastMove.includes(sq)) color.lerp(srgb(LAST_MOVE), 0.6);
      if (highlights.checks.includes(sq)) color.lerp(srgb(CHECK), 0.85);
      if (sq === highlights.selected) color.lerp(srgb(SELECTED), 0.85);
      this.squares.setColorAt(sq, color);
    }
    if (this.squares.instanceColor) this.squares.instanceColor.needsUpdate = true;
    let dot = 0;
    let ring = 0;
    for (const target of highlights.targets) {
      const mark = target.capture ? this.rings[ring++] : this.dots[dot++];
      if (!mark) continue;
      mark.position.set(squareX(target.square), 0.006, squareZ(target.square));
      mark.visible = true;
    }
    for (let i = dot; i < this.dots.length; i++) this.dots[i].visible = false;
    for (let i = ring; i < this.rings.length; i++) this.rings[i].visible = false;
  }

  /** 화면 좌표(CSS px, 캔버스 기준) 아래의 칸. 판 밖이면 -1. 기물을 누르면 그 기물의 칸 */
  pick(x: number, y: number): number {
    const pointer = new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const bodies = [...this.pieces.values()].map((object) => object.group);
    const hit = this.raycaster.intersectObjects(bodies, true)[0];
    if (hit) {
      for (const [square, object] of this.pieces) {
        let node: Object3D | null = hit.object;
        while (node && node !== object.group) node = node.parent;
        if (node) return square;
      }
    }
    const boardHit = this.raycaster.intersectObject(this.squares)[0];
    return boardHit?.instanceId ?? -1;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.fitCamera();
  }

  /** 판 전체(뒷줄 기물 머리까지)가 버튼 줄 아래에 들어오는 가장 가까운 거리에 카메라를 둔다. */
  private fitCamera(): void {
    const pitch = ((this.camera.aspect < 0.8 ? PORTRAIT_PITCH : PITCH) * Math.PI) / 180;
    const direction = new Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const target = new Vector3(0, 0, 0.35);
    const corners: Vector3[] = [];
    for (const x of [-4.5, 4.5]) for (const z of [-4.5, 4.5]) for (const y of [-0.4, 1.25]) corners.push(new Vector3(x, y, z));
    const top = 1 - (2 * (TOP_BAR + 8)) / this.height;
    const fits = (distance: number) => {
      this.camera.position.copy(target).addScaledVector(direction, distance);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      return corners.every((corner) => {
        const p = corner.clone().project(this.camera);
        return Math.abs(p.x) <= 0.96 && p.y <= top && p.y >= -0.96;
      });
    };
    let near = 4;
    let far = 80;
    for (let i = 0; i < 30; i++) {
      const middle = (near + far) / 2;
      if (fits(middle)) far = middle;
      else near = middle;
    }
    fits(far);
  }

  render(seconds: number): void {
    this.time += seconds;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];
      tween.elapsed += seconds;
      const t = Math.min(1, tween.elapsed / tween.seconds);
      tween.update(t);
      if (t >= 1) {
        this.tweens.splice(i, 1);
        tween.done();
      }
    }
    // 갸웃거림은 기물 안쪽 메시에 줘서, 판 위를 옮기는 움직임(group)과 섞이지 않게 한다.
    const tilt = this.thinking ? Math.sin(this.time * 5) * 0.1 : 0;
    for (const [, object] of this.pieces) {
      if (object.piece !== -KING) continue;
      for (const mesh of object.group.children) mesh.rotation.z += (tilt - mesh.rotation.z) * (this.thinking ? 1 : 0.2);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
