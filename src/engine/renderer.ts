import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  Color,
  CubeTexture,
  DynamicDrawUsage,
  DepthTexture,
  FramebufferTexture,
  GLSL3,
  IcosahedronGeometry,
  LatheGeometry,
  LessEqualCompare,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  RawShaderMaterial,
  RGBFormat,
  Scene,
  SkinnedMesh,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import meshVert from '../shaders/mesh.vert?raw';
import toonFrag from '../shaders/toon.frag?raw';
import type { ContentRenderer, ToonMesh, RenderContext, Uniforms } from './contentRenderers/contentRenderer';
import type { Mat4, Vec3 } from './math';
import { headProfile, slitPatch, tentacleSkin, visorPatch, type MeshArrays } from './alienShape';
import { skinVertices, type SkinSource } from './skinning';
import { displaceToMoon } from './moonShape';
import { dishProfile } from './satelliteShape';
import { DREAM_SHAPE, moundProfile, pillarProfile, type Profile } from './dreamShape';
import { bodyProfile, rocketHatch, rocketLegs, rocketRivets, rocketWindow, ROCKET_SHAPE, type RocketPart } from './rocketShape';
import { BillboardBatch } from './billboardRenderer';
import type { BillboardImage } from './billboard';
import { BubbleBatch } from './bubbleRenderer';
import { drawSkyboxFaces } from './skybox';
import type { TriangleMesh } from './trackPath';
import { LEG_BONE_COUNT, MAX_SURFACE_ZONES, RING_TUBE_RATIO, type ContentFrame, type DrawItem, type Environment, type FrameData, type MeshKind } from './frame';

const SHADOW_MAP_SIZE = 2048;
const MAX_DEVICE_PIXEL_RATIO = 2;
/** 그늘에 씌우는 하프톤 점 격자 한 칸의 크기(CSS 픽셀) */
const HALFTONE_CELL_CSS_PX = 7;
/** 그림자를 드리우는 메시만 켜는 레이어. 광원 카메라는 이 레이어만 본다. */
const SHADOW_LAYER = 1;
/** `frame.ts`의 `leg` 뼈 순서에 맞춘 glTF 뼈 이름 */
const LEG_BONE_NAMES = ['Thigh', 'Shin', 'Foot'];

/** 충돌구가 패인 위성. 고르게 나뉜 정이십면체 구를 밀고, 이음매 없이 부드러운 법선을 계산한다. */
function createMoonGeometry(): BufferGeometry {
  const sphere = new IcosahedronGeometry(1, 48);
  // 면마다 따로인 정점을 합쳐야 법선이 부드럽게 이어진다.
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const geometry = mergeVertices(sphere);
  sphere.dispose();
  displaceToMoon(geometry.getAttribute('position').array as Float32Array);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 높낮이가 있는 행성 땅. `radius + heightAt(방향)`이 표면까지의 거리다. */
export interface HeightField {
  center: Vec3;
  radius: number;
  heightAt(dir: Vec3): number;
}

/** 땅을 나누는 정이십면체 세분 수. 정점 간격이 0.3쯤이라 언덕이 매끄럽다. */
const TERRAIN_DETAIL = 72;

/** 고르게 나뉜 정이십면체 구를 높이 함수대로 밀어 땅을 만든다. 정점은 월드 좌표다. */
function createTerrainGeometry(field: HeightField): BufferGeometry {
  const sphere = new IcosahedronGeometry(1, TERRAIN_DETAIL);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const geometry = mergeVertices(sphere);
  sphere.dispose();
  const position = geometry.getAttribute('position').array as Float32Array;
  const [cx, cy, cz] = field.center;
  for (let i = 0; i < position.length; i += 3) {
    const len = Math.hypot(position[i], position[i + 1], position[i + 2]);
    const dir: Vec3 = [position[i] / len, position[i + 1] / len, position[i + 2] / len];
    const r = field.radius + field.heightAt(dir);
    position[i] = cx + dir[0] * r;
    position[i + 1] = cy + dir[1] * r;
    position[i + 2] = cz + dir[2] * r;
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 위치·법선·색인 배열로 만든 지오메트리 */
function createArrayGeometry({ positions, normals, indices }: MeshArrays): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** 외계인 촉수의 기본 자세와 뼈 가중치. 그릴 때는 메시마다 스키닝한 복사본을 쓴다. */
const TENTACLE_SKIN = tentacleSkin();

/** 단면을 돌린 회전체. 이음매 법선이 부드럽게 이어지도록 정점을 합친다. */
function createLatheGeometry(profile: Profile): BufferGeometry {
  const lathe = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), DREAM_SHAPE.radialSegments);
  lathe.deleteAttribute('normal');
  lathe.deleteAttribute('uv');
  const geometry = mergeVertices(lathe);
  lathe.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 표면 부품을 자리에 놓는 행렬. 지오메트리의 +Z가 `normal`을 향하고, 위쪽은 몸통 축(+Y)에 가깝게 둔다. */
function partMatrix({ position, normal }: RocketPart, push = 0): Matrix4 {
  const z = new Vector3(...normal);
  const x = new Vector3(0, 1, 0).cross(z).normalize();
  const y = z.clone().cross(x);
  const p = new Vector3(...position).addScaledVector(z, push);
  return new Matrix4().makeBasis(x, y, z).setPosition(p);
}

/** 로켓 모형의 몸통, 다리, 창틀, 옆문, 리벳을 한 지오메트리로 합친다. 모양은 `rocketShape.ts`가 정한다. */
function createRocketGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, matrix?: Matrix4) => {
    if (matrix) geometry.applyMatrix4(matrix);
    geometry.deleteAttribute('uv');
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
  };
  add(new LatheGeometry(bodyProfile().map(([r, y]) => new Vector2(r, y)), ROCKET_SHAPE.radialSegments));
  const up = new Vector3(0, 1, 0);
  for (const leg of rocketLegs()) {
    const rotation = new Quaternion().setFromUnitVectors(up, new Vector3(...leg.axis));
    add(new CapsuleGeometry(leg.radius, leg.length, 6, 16), new Matrix4().compose(new Vector3(...leg.center), rotation, new Vector3(1, 1, 1)));
  }
  const { radius, rimTube } = ROCKET_SHAPE.window;
  add(new TorusGeometry(radius, rimTube, 8, 32), partMatrix(rocketWindow(), 0.012));
  const [hw, hh, hd] = ROCKET_SHAPE.hatch.size;
  add(new SphereGeometry(0.5, 20, 12), partMatrix(rocketHatch()).multiply(new Matrix4().makeScale(hw, hh, hd)));
  for (const rivet of rocketRivets()) {
    const r = ROCKET_SHAPE.rivets.radius;
    add(new SphereGeometry(r, 6, 4), new Matrix4().makeTranslation(...rivet));
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * 사각뿔. 상자처럼 한 변 1인 공간에 맞춰 밑면이 y = -0.5, 꼭짓점이 (0, 0.5, 0)이다.
 * 면마다 정점을 따로 두어 법선이 면을 따르므로 모서리가 각져 보인다.
 */
function createPyramidGeometry(): BufferGeometry {
  const h = 0.5;
  const apex = [0, h, 0];
  const corners = [
    [-h, -h, h],
    [h, -h, h],
    [h, -h, -h],
    [-h, -h, -h],
  ];
  const triangles: number[][] = [];
  // 옆면: 바깥에서 볼 때 반시계 방향
  for (let i = 0; i < 4; i++) triangles.push(corners[i], corners[(i + 1) % 4], apex);
  // 밑면: 아래에서 볼 때 반시계 방향
  triangles.push(corners[0], corners[3], corners[2], corners[0], corners[2], corners[1]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles.flat()), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 로켓 창의 유리. 몸통보다 조금 밖에 띄운 원판이다. */
function createRocketGlassGeometry(): BufferGeometry {
  const glass = new CircleGeometry(ROCKET_SHAPE.window.radius, 32);
  glass.deleteAttribute('uv');
  glass.applyMatrix4(partMatrix(rocketWindow(), 0.018));
  glass.computeBoundingSphere();
  return glass;
}

/**
 * three.js로 장면을 그린다. 게임 상태는 들고 있지 않고, 매 프레임 `FrameData`를 받아
 * 메시 풀과 uniform에 옮겨 적는다. 컨텍스트 손실과 복구는 `WebGLRenderer`가 처리한다.
 *
 * 콘텐츠 전용 그리기는 여기에 두지 않는다. `ContentRenderer`를 상속한 클래스가 맡고,
 * 이 클래스는 `init`, `prepare`, `render`만 호출한다.
 */
export class Renderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  /** 아주 먼 우주 큐브맵만 배경으로 가진 장면. 메인 패스에서 가장 먼저 그린다. */
  private readonly skyScene = new Scene();
  /**
   * 별, 햇살, 해 눈처럼 카메라를 보는 빌보드를 한 번에 그리는 장면. 그림자 패스에 넣지 않으려고 따로 두고,
   * 불투명한 메인 장면 뒤에 그린다.
   */
  private readonly billboardScene = new Scene();
  private readonly billboards = new BillboardBatch();
  /** 행성 둘레의 비눗방울. 깊이를 쓰지 않고 가산 혼합하므로 다른 것을 모두 그린 뒤에 그린다. */
  private readonly bubbleScene = new Scene();
  private readonly bubbles = new BubbleBatch();
  private readonly camera = new PerspectiveCamera();
  private readonly lightCamera = new OrthographicCamera();
  private readonly geometries: Record<MeshKind, BufferGeometry>;
  private readonly depthMaterial: MeshBasicMaterial;
  private readonly shadowTarget: WebGLRenderTarget;
  private readonly pool: ToonMesh[] = [];
  private readonly contentRenderers: ReadonlyMap<string, ContentRenderer>;
  private readonly renderContext: RenderContext;
  /** 이번 프레임의 콘텐츠 값을 `kind`로 찾는 표. 매 프레임 다시 채운다. */
  private readonly contentFrames = new Map<string, ContentFrame>();
  private sceneColor: FramebufferTexture | null = null;
  /** 다리 스킨 메시의 기본 자세와 가중치. loadCharacter 전에는 없다. */
  private legSkin: SkinSource | null = null;
  /** 풀의 메시마다 스키닝 결과를 쓰는 지오메트리. 메시가 그리는 스킨 메시 종류가 바뀌면 새로 만든다. */
  private readonly skinned = new Map<ToonMesh, { kind: MeshKind; geometry: BufferGeometry }>();

  private readonly clearColor = new Color();
  private readonly bufferSize = new Vector2();
  /** 모든 재질이 같은 객체를 참조하는 프레임 단위 uniform */
  private readonly shared = {
    uLightViewProj: { value: new Matrix4() },
    uCameraPos: { value: new Vector3() },
    uLightDir: { value: new Vector3() },
    uLightColor: { value: new Vector3() },
    uSkyColor: { value: new Vector3() },
    uGroundColor: { value: new Vector3() },
    uMoonColor: { value: new Vector3() },
    uNightAmbient: { value: new Vector3() },
    uHalftoneCell: { value: HALFTONE_CELL_CSS_PX },
  };
  private readonly toonShared: Uniforms;

  /**
   * `contentRenderers`는 전용 그리기가 있는 콘텐츠의 렌더러다. 목록 순서대로 그린다.
   * `onShaderError`는 셰이더 컴파일이나 링크가 실패했을 때 한 번 이상 호출된다.
   */
  constructor(
    canvas: HTMLCanvasElement,
    contentRenderers: readonly ContentRenderer[],
    onShaderError: () => void,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // 지우기와 그리기 순서를 직접 제어한다 (그림자 → 장면 → 콘텐츠 렌더러).
    this.renderer.autoClear = false;
    this.renderer.debug.onShaderError = (gl, program) => {
      console.error(`셰이더 오류:\n${gl.getProgramInfoLog(program)}`);
      onShaderError();
    };

    this.geometries = {
      // 행성에도 쓰므로 촘촘하게 나눈다. 성기면 구가 행성 표면에 살짝 묻혀 보인다.
      sphere: new SphereGeometry(1, 96, 64),
      // 캐릭터 집 자리 표시
      box: new BoxGeometry(1, 1, 1),
      // NPC의 피라미드 몸. 상자처럼 한 변 1인 공간에 맞춘다.
      pyramid: createPyramidGeometry(),
      // 캐릭터 다리의 기본 자세. 그릴 때는 메시마다 스키닝한 복사본을 쓴다.
      leg: new BufferGeometry(),
      // 해 궤적처럼 큰 원을 그리므로 둘레를 촘촘하게, 관은 가늘어서 성기게 나눈다.
      ring: new TorusGeometry(1, RING_TUBE_RATIO, 6, 512),
      moon: createMoonGeometry(),
      // 로켓 자리의 모형. 장면 파일의 `size`가 한 변 1인 상자를 늘린다.
      rocket: createRocketGeometry(),
      rocketGlass: createRocketGlassGeometry(),
      // 축을 Z로 돌린 원기둥. 기차 바퀴와 보일러에 쓴다.
      cylinder: new CylinderGeometry(0.5, 0.5, 1, 24).rotateX(Math.PI / 2),
      // 선로. setTrack 전에는 비어 있다.
      rails: new BufferGeometry(),
      sleepers: new BufferGeometry(),
      // 행성 땅. setTerrain 전에는 비어 있다.
      terrain: new BufferGeometry(),
      // 몽환적인 지형물 (`dreamShape.ts`)
      mound: createLatheGeometry(moundProfile()),
      pillar: createLatheGeometry(pillarProfile()),
      // 문어 꼴 외계인 (`alienShape.ts`)
      alienHead: createLatheGeometry(headProfile()),
      alienVisor: createArrayGeometry(visorPatch()),
      alienSlit: createArrayGeometry(slitPatch()),
      tentacle: createArrayGeometry(TENTACLE_SKIN),
      // 인공위성의 접시 안테나 (`satelliteShape.ts`)
      satelliteDish: createLatheGeometry(dishProfile()),
    };

    const shadowMap = new DepthTexture(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    // 비교 함수를 지정하면 sampler2DShadow로 읽을 수 있고, 선형 필터가 하드웨어 PCF가 된다.
    shadowMap.compareFunction = LessEqualCompare;
    shadowMap.minFilter = LinearFilter;
    shadowMap.magFilter = LinearFilter;
    this.shadowTarget = new WebGLRenderTarget(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, {
      depthTexture: shadowMap,
    });
    this.depthMaterial = new MeshBasicMaterial({
      colorWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 4,
    });
    this.lightCamera.layers.set(SHADOW_LAYER);

    this.billboardScene.add(this.billboards.mesh);
    this.bubbleScene.add(this.bubbles.mesh);

    // 먼 우주는 모델 없이 캔버스에 그린 큐브맵 한 장이다. 한 번 만들고 바뀌지 않는다.
    const sky = new CubeTexture(drawSkyboxFaces());
    sky.colorSpace = SRGBColorSpace;
    sky.needsUpdate = true;
    this.skyScene.background = sky;

    const byKind = new Map<string, ContentRenderer>();
    for (const content of contentRenderers) {
      if (byKind.has(content.kind)) throw new Error(`콘텐츠 렌더러 kind 중복: ${content.kind}`);
      byKind.set(content.kind, content);
    }
    this.contentRenderers = byKind;

    // 콘텐츠 렌더러가 더한 uniform까지 모은 뒤에 툰 재질을 만들어야 모든 재질이 함께 참조한다.
    this.toonShared = {
      ...this.shared,
      uShadowMap: { value: shadowMap },
      uShadowTexel: { value: 1 / SHADOW_MAP_SIZE },
      uOccluder: { value: new Vector4() },
      uZoneCount: { value: 0 },
      uZoneDir: { value: Array.from({ length: MAX_SURFACE_ZONES }, () => new Vector3()) },
      uZoneColor: { value: Array.from({ length: MAX_SURFACE_ZONES }, () => new Vector3()) },
      uZoneParams: { value: Array.from({ length: MAX_SURFACE_ZONES }, () => new Vector4()) },
    };
    for (const content of contentRenderers) Object.assign(this.toonShared, content.toonUniforms);

    this.renderContext = {
      renderer: this.renderer,
      camera: this.camera,
      geometries: this.geometries,
      shared: this.shared,
      createToonMesh: () => this.createToonMesh(),
      applyItem: (mesh, item) => this.applyItem(mesh, item),
      copySceneColor: () => this.copySceneColor(),
    };
    for (const content of contentRenderers) content.init(this.renderContext);
  }

  /**
   * Blender에서 내보낸 캐릭터 모델(`tools/blender/build_character.py`)을 불러와 다리 스킨 메시를 채운다.
   * 메시 Leg의 기본 자세 정점과 뼈 번호·가중치만 쓰고, 내보낸 뼈의 변환은 쓰지 않는다.
   * 뼈 번호는 이름으로 찾아 [Thigh, Shin, Foot] 순서로 바꾼다.
   */
  /** 파일에서 불러오는 빌보드 그림(`FILE_BILLBOARD_IMAGES`)을 아틀라스에 넣는다. 그 전에는 그 빌보드가 보이지 않는다. */
  loadBillboardImage(image: BillboardImage, url: string): Promise<void> {
    return this.billboards.loadImage(image, url);
  }

  async loadCharacter(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url);
    // instanceof 대신 isSkinnedMesh로 확인한다. 개발 서버의 의존성 최적화 중에는 three.js가 두 번 불러와질 수 있다.
    const leg = gltf.scene.getObjectByName('Leg') as SkinnedMesh | undefined;
    if (!leg?.isSkinnedMesh) throw new Error('캐릭터 모델에 Leg 스킨 메시가 없습니다.');
    const remap = leg.skeleton.bones.map((bone) => LEG_BONE_NAMES.indexOf(bone.name));
    if (remap.includes(-1) || remap.length !== LEG_BONE_COUNT) {
      throw new Error(`다리 뼈 이름이 ${LEG_BONE_NAMES.join(', ')}가 아닙니다.`);
    }

    const geometry = leg.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');
    const count = position.count;
    const source: SkinSource = {
      positions: new Float32Array(count * 3),
      normals: new Float32Array(count * 3),
      boneIndices: new Uint8Array(count * 4),
      boneWeights: new Float32Array(count * 4),
    };
    for (let i = 0; i < count; i++) {
      source.positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
      source.normals.set([normal.getX(i), normal.getY(i), normal.getZ(i)], i * 3);
      for (let k = 0; k < 4; k++) {
        source.boneIndices[i * 4 + k] = remap[skinIndex.getComponent(i, k)];
        source.boneWeights[i * 4 + k] = skinWeight.getComponent(i, k);
      }
    }
    this.geometries.leg.dispose();
    this.geometries.leg = geometry;
    this.legSkin = source;
  }

  /** 선로의 레일과 침목 지오메트리를 채운다. 정점은 월드 좌표다 (`trackPath.ts`의 `trackMesh`). */
  setTrack(track: { rails: TriangleMesh; sleepers: TriangleMesh }): void {
    for (const kind of ['rails', 'sleepers'] as const) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(track[kind].positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(track[kind].normals, 3));
      geometry.computeBoundingSphere();
      this.geometries[kind].dispose();
      this.geometries[kind] = geometry;
    }
  }

  /** 행성 땅 지오메트리를 높이 함수로 채운다. 정점은 월드 좌표다. */
  setTerrain(field: HeightField): void {
    this.geometries.terrain.dispose();
    this.geometries.terrain = createTerrainGeometry(field);
  }

  /** 개발용 확인(`getError`)에 쓰는 WebGL 컨텍스트 */
  get context(): WebGLRenderingContext | WebGL2RenderingContext {
    return this.renderer.getContext();
  }

  /** 캔버스 크기를 화면에 맞추고 가로세로 비율을 반환한다. */
  resizeToDisplay(): number {
    const canvas = this.renderer.domElement;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const size = this.renderer.getSize(this.bufferSize);
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    this.shared.uHalftoneCell.value = HALFTONE_CELL_CSS_PX * ratio;
    if (size.x !== width || size.y !== height) this.renderer.setSize(width, height, false);
    return width / height;
  }

  render(frame: FrameData, aspect: number): void {
    const r = this.renderer;
    this.updateCameras(frame, aspect);
    this.updateSharedUniforms(frame);
    this.syncItems(frame.items);
    this.billboards.update(frame.billboards, frame.camera);
    this.bubbles.update(frame.bubbles, frame.camera, frame.environment.lightDirection);

    this.contentFrames.clear();
    for (const content of frame.contents) this.contentFrames.set(content.kind, content);
    for (const [kind, content] of this.contentRenderers) {
      content.prepare(this.contentFrames.get(kind) ?? null);
    }

    // 1. 그림자 패스: 그림자 레이어의 메시를 깊이만 그린다.
    r.setRenderTarget(this.shadowTarget);
    r.clear();
    this.scene.overrideMaterial = this.depthMaterial;
    r.render(this.scene, this.lightCamera);
    this.scene.overrideMaterial = null;

    // 2. 메인 패스
    r.setRenderTarget(null);
    const bg = frame.environment.background;
    r.setClearColor(this.clearColor.setRGB(bg[0], bg[1], bg[2], SRGBColorSpace));
    r.clear();
    // 내장 배경 셰이더는 깊이를 쓰지 않으므로 그 위에 무엇이든 그려진다.
    r.render(this.skyScene, this.camera);
    r.render(this.scene, this.camera);
    // 빌보드는 반투명 가장자리가 있으므로 불투명한 장면 뒤에 그린다. 깊이 검사로 행성·위성이 그 뒤를 가린다.
    r.render(this.billboardScene, this.camera);
    // 비눗방울은 깊이를 쓰지 않으므로 빌보드보다 먼저 그리면 뒤의 별이 방울을 덮는다.
    r.render(this.bubbleScene, this.camera);

    // 3. 콘텐츠 렌더러: 이번 프레임에 값이 있는 것만 등록한 순서대로 그린다.
    for (const [kind, content] of this.contentRenderers) {
      const data = this.contentFrames.get(kind);
      if (data) content.render(data, this.renderContext);
    }
  }

  private updateCameras(frame: FrameData, aspect: number): void {
    const view = frame.camera;
    const camera = this.camera;
    camera.fov = (view.fovY * 180) / Math.PI;
    camera.aspect = aspect;
    camera.near = view.near;
    camera.far = view.far;
    camera.updateProjectionMatrix();
    camera.position.fromArray(view.position);
    camera.up.fromArray(view.up);
    camera.lookAt(view.target[0], view.target[1], view.target[2]);
    camera.updateMatrixWorld();

    const env = frame.environment;
    const radius = env.shadowRadius;
    const light = this.lightCamera;
    light.left = -radius;
    light.right = radius;
    light.top = radius;
    light.bottom = -radius;
    light.near = 1;
    light.far = radius * 4;
    light.updateProjectionMatrix();
    light.position.fromArray(env.lightDirection).multiplyScalar(radius * 2);
    // 해가 궤도를 돌며 +Y 위를 지나므로, 광원 방향과 거의 나란하면 다른 축을 위쪽으로 쓴다.
    if (Math.abs(env.lightDirection[1]) > 0.99) light.up.set(0, 0, 1);
    else light.up.set(0, 1, 0);
    light.lookAt(0, 0, 0);
    light.updateMatrixWorld();
    this.shared.uLightViewProj.value.multiplyMatrices(light.projectionMatrix, light.matrixWorldInverse);
  }

  private updateSharedUniforms(frame: FrameData): void {
    const env: Environment = frame.environment;
    const shared = this.shared;
    shared.uCameraPos.value.fromArray(frame.camera.position);
    shared.uLightDir.value.fromArray(env.lightDirection);
    shared.uLightColor.value.fromArray(env.lightColor);
    shared.uSkyColor.value.fromArray(env.skyColor);
    shared.uGroundColor.value.fromArray(env.groundColor);
    shared.uMoonColor.value.fromArray(env.moonColor);
    shared.uNightAmbient.value.fromArray(env.nightAmbient);

    const { center, radius } = frame.occluder;
    this.toonShared.uOccluder.value.set(center[0], center[1], center[2], radius);

    const zones = frame.surfaceZones;
    const count = Math.min(zones.length, MAX_SURFACE_ZONES);
    const dirs = this.toonShared.uZoneDir.value as Vector3[];
    const colors = this.toonShared.uZoneColor.value as Vector3[];
    const params = this.toonShared.uZoneParams.value as Vector4[];
    for (let i = 0; i < count; i++) {
      const zone = zones[i];
      dirs[i].fromArray(zone.direction);
      colors[i].fromArray(zone.color);
      params[i].set(zone.angularRadius, zone.edgeWidth, zone.glow, zone.presence);
    }
    this.toonShared.uZoneCount.value = count;
  }

  /** 그리기 목록을 메시 풀에 옮긴다. 목록보다 남는 메시는 숨긴다. */
  private syncItems(items: readonly DrawItem[]): void {
    for (let i = 0; i < items.length; i++) {
      let mesh = this.pool[i];
      if (!mesh) {
        mesh = this.createToonMesh();
        this.pool.push(mesh);
        this.scene.add(mesh);
      }
      this.applyItem(mesh, items[i]);
      mesh.visible = true;
    }
    for (let i = items.length; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  private createToonMesh(): ToonMesh {
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: meshVert,
      fragmentShader: toonFrag,
      uniforms: {
        ...this.toonShared,
        uNormalMatrix: { value: new Matrix3() },
        uBaseColor: { value: new Vector3() },
        uEmissive: { value: new Vector3() },
        uMetallic: { value: 0 },
        uRoughness: { value: 1 },
        uPattern: { value: 0 },
        uShowZones: { value: false },
        uReceiveOccluder: { value: false },
      },
    });
    const mesh = new Mesh(this.geometries.sphere, material);
    // 모델 행렬은 World가 계산해 넘겨 준다.
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private applyItem(mesh: ToonMesh, item: DrawItem): void {
    mesh.geometry = item.skin ? this.skinnedGeometry(mesh, item.mesh, item.skin) : this.geometries[item.mesh];
    // 스키닝한 정점은 이미 월드 좌표라 경계 구를 따로 계산하지 않고 화면 밖 제외를 끈다.
    mesh.frustumCulled = !item.skin;
    mesh.matrix.fromArray(item.model);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.layers.set(0);
    if (item.castShadow) mesh.layers.enable(SHADOW_LAYER);

    const u = mesh.material.uniforms;
    const m = item.material;
    u.uNormalMatrix.value.fromArray(item.normal);
    u.uBaseColor.value.fromArray(m.baseColor);
    u.uEmissive.value.fromArray(m.emissive);
    u.uMetallic.value = m.metallic;
    u.uRoughness.value = m.roughness;
    u.uPattern.value = m.pattern;
    u.uShowZones.value = m.showsZones;
    u.uReceiveOccluder.value = m.receivesOccluder;
  }

  /**
   * 풀의 메시마다 따로 가진 스킨 지오메트리(다리, 촉수)에 스키닝 결과를 쓴다.
   * 같은 메시는 보통 매 프레임 같은 스킨 메시를 그리므로 종류가 같으면 지오메트리를 다시 만들지 않는다.
   */
  private skinnedGeometry(mesh: ToonMesh, kind: MeshKind, bones: readonly Mat4[]): BufferGeometry {
    const source = kind === 'tentacle' ? TENTACLE_SKIN : kind === 'leg' ? this.legSkin : null;
    if (!source) return this.geometries[kind];
    let entry = this.skinned.get(mesh);
    if (!entry || entry.kind !== kind) {
      entry?.geometry.dispose();
      const geometry = new BufferGeometry();
      geometry.setIndex(this.geometries[kind].index);
      geometry.setAttribute('position', new BufferAttribute(source.positions.slice(), 3).setUsage(DynamicDrawUsage));
      geometry.setAttribute('normal', new BufferAttribute(source.normals.slice(), 3).setUsage(DynamicDrawUsage));
      entry = { kind, geometry };
      this.skinned.set(mesh, entry);
    }
    const { geometry } = entry;
    const position = geometry.getAttribute('position') as BufferAttribute;
    const normal = geometry.getAttribute('normal') as BufferAttribute;
    skinVertices(source, bones, position.array as Float32Array, normal.array as Float32Array);
    position.needsUpdate = true;
    normal.needsUpdate = true;
    return geometry;
  }

  /** 지금까지 그린 화면을 텍스처로 복사한다. 굴절처럼 뒤 장면을 읽는 콘텐츠가 쓴다. */
  private copySceneColor(): Texture {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(this.bufferSize);
    if (!this.sceneColor || this.sceneColor.image.width !== size.x || this.sceneColor.image.height !== size.y) {
      this.sceneColor?.dispose();
      this.sceneColor = new FramebufferTexture(size.x, size.y);
      // 캔버스가 alpha: false이므로 RGB로만 복사할 수 있다.
      // three.js는 RGB + UNSIGNED_BYTE의 크기 있는 내부 형식을 고르지 않으므로 직접 지정한다.
      this.sceneColor.format = RGBFormat;
      this.sceneColor.internalFormat = 'RGB8';
      this.sceneColor.minFilter = LinearFilter;
      this.sceneColor.magFilter = LinearFilter;
    }
    r.copyFramebufferToTexture(this.sceneColor);
    return this.sceneColor;
  }
}
