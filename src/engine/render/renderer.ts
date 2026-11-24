import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeTexture,
  CylinderGeometry,
  DynamicDrawUsage,
  DepthTexture,
  GLSL3,
  type IUniform,
  LessEqualCompare,
  LessEqualDepth,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  OrthographicCamera,
  PerspectiveCamera,
  RawShaderMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import meshVert from './shaders/mesh.vert?raw';
import toonFrag from './shaders/toon.frag?raw';
import type { Mat4 } from '../math';
import { skinVertices, type SkinSource } from '../skinning';
import type { DrawItem, Environment, FrameData, MeshKind } from '../frame';
import { BillboardBatch } from './billboardRenderer';
import type { BillboardImage, BillboardImageDef } from './billboard';
import type { Graphics, RenderLayer } from './graphics';
import { VideoScreenLayer, type VideoScreenPlacement, type YouTubeScreen } from './videoScreenLayer';

type Uniforms = Record<string, IUniform>;
type ToonMesh = Mesh<BufferGeometry, RawShaderMaterial>;

const SHADOW_MAP_SIZE = 2048;
const MAX_DEVICE_PIXEL_RATIO = 2;
/** 그늘에 씌우는 하프톤 점 격자 한 칸의 크기(CSS 픽셀) */
const HALFTONE_CELL_CSS_PX = 7;
/** 그림자를 드리우는 메시만 켜는 레이어. 광원 카메라는 이 레이어만 본다. */
const SHADOW_LAYER = 1;

/** 엔진이 늘 가진 기본 메시 (`frame.ts`의 `ENGINE_MESHES`) */
function createEngineMeshes(): Record<string, BufferGeometry> {
  return {
    // 큰 구에도 쓰므로 촘촘하게 나눈다. 성기면 구가 땅에 살짝 묻혀 보인다.
    sphere: new SphereGeometry(1, 96, 64),
    box: new BoxGeometry(1, 1, 1),
    // 축을 Z로 돌린 원기둥
    cylinder: new CylinderGeometry(0.5, 0.5, 1, 24).rotateX(Math.PI / 2),
  };
}

/**
 * three.js로 장면을 그린다. 게임 상태도 콘텐츠도 모르고, 콘텐츠가 `Graphics`로 등록한 메시·그림·층을
 * 매 프레임 받는 `FrameData`대로 그린다. 컨텍스트 손실과 복구는 `WebGLRenderer`가 처리한다.
 */
export class Renderer implements Graphics {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  /** 아주 먼 배경 큐브맵만 가진 장면. 메인 패스에서 가장 먼저 그린다. */
  private readonly skyScene = new Scene();
  /**
   * 카메라를 보는 빌보드를 한 번에 그리는 장면. 그림자 패스에 넣지 않으려고 따로 두고,
   * 불투명한 메인 장면 뒤에 그린다.
   */
  private readonly billboardScene = new Scene();
  private readonly billboards = new BillboardBatch();
  /** 콘텐츠 셰이더 층. 빌보드 다음에 더한 순서대로 그린다. */
  private readonly layers: { layer: RenderLayer; scene: Scene }[] = [];
  private readonly camera = new PerspectiveCamera();
  private readonly lightCamera = new OrthographicCamera();
  private readonly geometries = new Map<MeshKind, BufferGeometry>();
  private readonly skins = new Map<MeshKind, SkinSource>();
  private readonly depthMaterial: MeshBasicMaterial;
  private readonly shadowTarget: WebGLRenderTarget;
  private readonly pool: ToonMesh[] = [];
  /** 풀의 메시마다 스키닝 결과를 쓰는 지오메트리. 메시가 그리는 스킨 메시 종류가 바뀌면 새로 만든다. */
  private readonly skinned = new Map<ToonMesh, { kind: MeshKind; source: SkinSource; geometry: BufferGeometry }>();
  /** 영상 화면 자리를 뚫는 메시 */
  private readonly videoHoles: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];
  /** 등록되지 않은 메시 이름. 한 번만 알린다. */
  private readonly missing = new Set<MeshKind>();
  private readonly empty = new BufferGeometry();

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
  /** HTML 영상 화면. 캔버스 뒤에 그리고, 화면 자리를 뚫어 보인다. */
  private readonly videoLayer = new VideoScreenLayer();

  /** `onShaderError`는 셰이더 컴파일이나 링크가 실패했을 때 한 번 이상 호출된다. */
  constructor(canvas: HTMLCanvasElement, onShaderError: () => void) {
    this.renderer = new WebGLRenderer({
      canvas,
      // 영상 화면 자리를 투명하게 뚫어 캔버스 뒤의 영상이 보이게 하려고 알파 채널을 둔다.
      // 나머지는 모두 알파 1로 지우고 그린다.
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // 지우기와 그리기 순서를 직접 제어한다 (그림자 → 배경 → 장면 → 빌보드 → 콘텐츠 층).
    this.renderer.autoClear = false;
    this.renderer.debug.onShaderError = (gl, program) => {
      console.error(`셰이더 오류:\n${gl.getProgramInfoLog(program)}`);
      onShaderError();
    };

    this.defineEngineMeshes();

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

    this.toonShared = {
      ...this.shared,
      uShadowMap: { value: shadowMap },
      uShadowTexel: { value: 1 / SHADOW_MAP_SIZE },
      uOccluder: { value: new Vector4() },
    };
  }

  // ---- Graphics: 콘텐츠 등록 ----

  defineMesh(kind: MeshKind, geometry: BufferGeometry): void {
    const old = this.geometries.get(kind);
    if (old && old !== geometry) old.dispose();
    this.geometries.set(kind, geometry);
    this.skins.delete(kind);
    this.missing.delete(kind);
  }

  defineSkinnedMesh(kind: MeshKind, geometry: BufferGeometry, skin: SkinSource): void {
    this.defineMesh(kind, geometry);
    this.skins.set(kind, skin);
  }

  setBillboardImages(images: Readonly<Record<BillboardImage, BillboardImageDef>>): void {
    this.billboards.setImages(images);
  }

  loadBillboardImage(image: BillboardImage, url: string): Promise<void> {
    return this.billboards.loadImage(image, url);
  }

  setSkybox(faces: readonly HTMLCanvasElement[] | null): void {
    const old = this.skyScene.background;
    if (old instanceof CubeTexture) old.dispose();
    if (!faces) {
      this.skyScene.background = null;
      return;
    }
    const sky = new CubeTexture([...faces]);
    sky.colorSpace = SRGBColorSpace;
    sky.needsUpdate = true;
    this.skyScene.background = sky;
  }

  addLayer(layer: RenderLayer): void {
    const scene = new Scene();
    scene.add(layer.object);
    this.layers.push({ layer, scene });
  }

  /**
   * 등록한 메시 `screenMesh`를 `model` 자리에 놓고 색과 알파 0으로 덮어써 캔버스에 구멍을 낸다. 구멍은 불투명한
   * 장면 뒤에 같은 깊이로 그리므로 화면 앞의 물체는 구멍을 가린다. 영상은 `place`에 맞춰 캔버스 뒤에 놓는다.
   */
  addVideoScreen(videoId: string, screenMesh: MeshKind, model: Mat4, place: VideoScreenPlacement): YouTubeScreen {
    const hole = new Mesh(
      this.geometry(screenMesh),
      new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        blending: NoBlending,
        depthFunc: LessEqualDepth,
        depthWrite: false,
      }),
    );
    hole.matrixAutoUpdate = false;
    hole.matrix.fromArray(model);
    hole.matrixWorldNeedsUpdate = true;
    this.scene.add(hole);
    this.videoHoles.push(hole);
    return this.videoLayer.add(videoId, place);
  }

  /** 콘텐츠가 등록한 것을 모두 지우고 엔진 기본 메시만 남긴다. 씬을 바꿀 때 부른다. */
  resetContent(): void {
    for (const { layer, scene } of this.layers) {
      scene.remove(layer.object);
      layer.dispose?.();
    }
    this.layers.length = 0;
    for (const hole of this.videoHoles) {
      this.scene.remove(hole);
      hole.material.dispose();
    }
    this.videoHoles.length = 0;
    this.videoLayer.clear();
    this.setSkybox(null);
    this.billboards.setImages({});
    for (const { geometry } of this.skinned.values()) geometry.dispose();
    this.skinned.clear();
    for (const mesh of this.pool) {
      mesh.geometry = this.empty;
      mesh.visible = false;
    }
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.skins.clear();
    this.missing.clear();
    this.defineEngineMeshes();
  }

  // ---- 그리기 ----

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
    if (size.x !== width || size.y !== height) {
      this.renderer.setSize(width, height, false);
      this.videoLayer.setSize(width, height);
    }
    return width / height;
  }

  render(frame: FrameData, aspect: number): void {
    const r = this.renderer;
    this.updateCameras(frame, aspect);
    this.updateSharedUniforms(frame);
    this.syncItems(frame.items);
    this.billboards.update(frame.billboards, frame.camera);
    for (const { layer } of this.layers) layer.update(frame);

    // 1. 그림자 패스: 그림자 레이어의 메시를 깊이만 그린다.
    r.setRenderTarget(this.shadowTarget);
    r.clear();
    this.scene.overrideMaterial = this.depthMaterial;
    r.render(this.scene, this.lightCamera);
    this.scene.overrideMaterial = null;

    // 2. 메인 패스
    r.setRenderTarget(null);
    const bg = frame.environment.background;
    r.setClearColor(this.clearColor.setRGB(bg[0], bg[1], bg[2], SRGBColorSpace), 1);
    r.clear();
    // 내장 배경 셰이더는 깊이를 쓰지 않으므로 그 위에 무엇이든 그려진다.
    if (this.skyScene.background) r.render(this.skyScene, this.camera);
    r.render(this.scene, this.camera);
    // 빌보드는 반투명 가장자리가 있으므로 불투명한 장면 뒤에 그린다. 깊이 검사로 앞의 물체가 그 뒤를 가린다.
    r.render(this.billboardScene, this.camera);
    // 콘텐츠 층. 깊이를 쓰지 않는 가산 혼합 층은 빌보드보다 먼저 그리면 뒤의 빌보드가 덮는다.
    for (const { scene } of this.layers) r.render(scene, this.camera);
    // 3. 캔버스 뒤의 HTML 영상 화면을 같은 카메라로 놓는다.
    this.videoLayer.render(this.camera);
  }

  private defineEngineMeshes(): void {
    for (const [kind, geometry] of Object.entries(createEngineMeshes())) this.geometries.set(kind, geometry);
  }

  /** 등록된 메시. 없으면 한 번 알리고 빈 지오메트리를 돌려준다. */
  private geometry(kind: MeshKind): BufferGeometry {
    const geometry = this.geometries.get(kind);
    if (geometry) return geometry;
    if (!this.missing.has(kind)) {
      this.missing.add(kind);
      console.error(`등록되지 않은 메시: ${kind}`);
    }
    return this.empty;
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
    // 광원이 +Y 위를 지날 수 있으므로, 광원 방향과 거의 나란하면 다른 축을 위쪽으로 쓴다.
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
        uReceiveOccluder: { value: false },
      },
    });
    const mesh = new Mesh(this.geometry('sphere'), material);
    // 모델 행렬은 콘텐츠가 계산해 넘겨 준다.
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private applyItem(mesh: ToonMesh, item: DrawItem): void {
    mesh.geometry = item.skin ? this.skinnedGeometry(mesh, item.mesh, item.skin) : this.geometry(item.mesh);
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
    u.uReceiveOccluder.value = m.receivesOccluder;
  }

  /**
   * 풀의 메시마다 따로 가진 스킨 지오메트리에 스키닝 결과를 쓴다.
   * 같은 메시는 보통 매 프레임 같은 스킨 메시를 그리므로 종류가 같으면 지오메트리를 다시 만들지 않는다.
   * 스킨이 아직 등록되지 않았으면(비동기로 불러오는 모델) 빈 지오메트리를 그린다.
   */
  private skinnedGeometry(mesh: ToonMesh, kind: MeshKind, bones: readonly Mat4[]): BufferGeometry {
    const source = this.skins.get(kind);
    if (!source) return this.empty;
    let entry = this.skinned.get(mesh);
    if (!entry || entry.kind !== kind || entry.source !== source) {
      entry?.geometry.dispose();
      const geometry = new BufferGeometry();
      geometry.setIndex(this.geometry(kind).index);
      geometry.setAttribute('position', new BufferAttribute(source.positions.slice(), 3).setUsage(DynamicDrawUsage));
      geometry.setAttribute('normal', new BufferAttribute(source.normals.slice(), 3).setUsage(DynamicDrawUsage));
      entry = { kind, source, geometry };
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
}
