import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeTexture,
  DoubleSide,
  DynamicDrawUsage,
  FrontSide,
  DepthTexture,
  GLSL3,
  type IUniform,
  LessEqualCompare,
  LessEqualDepth,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  NormalBlending,
  OrthographicCamera,
  PerspectiveCamera,
  RawShaderMaterial,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import type { Mat4 } from '../math';
import { skinVertices, type SkinSource } from '../skinning';
import { isShaderMaterial, type DrawItem, type Environment, type FrameData, type MeshKind } from '../frame';
import { TOON_SHADER, type ShaderKind, type ShaderSpec, type UniformValue } from '../shader';
import { layoutMismatches, type GeometryData } from '../vertex';
import { createEngineMeshes, geometryFromData, geometryLayout } from './geometry';
import { TOON_SHADER_SPEC, toonUniforms } from './toonShader';
import { assignUniform } from './uniforms';
import { BillboardBatch } from './billboardRenderer';
import type { BillboardImage, BillboardImageDef } from './billboard';
import type { Graphics, RenderLayer } from './graphics';
import { VideoScreenLayer, type VideoScreenPlacement, type YouTubeScreen } from './videoScreenLayer';

type Uniforms = Record<string, IUniform>;
type ShaderMesh = Mesh<BufferGeometry, RawShaderMaterial>;

/** 셰이더 하나로 그리는 메시 풀. 프레임마다 앞에서부터 `used`개를 쓰고 나머지는 숨긴다. */
interface ShaderPool {
  spec: ShaderSpec;
  meshes: ShaderMesh[];
  used: number;
}

const BLENDING = { opaque: NoBlending, normal: NormalBlending, additive: AdditiveBlending } as const;
const SIDE = { front: FrontSide, back: BackSide, double: DoubleSide } as const;

const isBufferGeometry = (g: BufferGeometry | GeometryData): g is BufferGeometry =>
  (g as BufferGeometry).isBufferGeometry === true;

const SHADOW_MAP_SIZE = 2048;
const MAX_DEVICE_PIXEL_RATIO = 2;
/** 그늘에 씌우는 하프톤 점 격자 한 칸의 크기(CSS 픽셀) */
const HALFTONE_CELL_CSS_PX = 7;
/** 그림자를 드리우는 메시만 켜는 레이어. 광원 카메라는 이 레이어만 본다. */
const SHADOW_LAYER = 1;

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
  /** 셰이더마다의 메시 풀. 툰 셰이더는 늘 있다. */
  private readonly pools = new Map<ShaderKind, ShaderPool>();
  /** 지오메트리마다 셰이더의 정점 속성과 맞는지 확인한 결과 */
  private readonly layoutChecks = new WeakMap<BufferGeometry, Map<ShaderKind, boolean>>();
  /** 풀의 메시마다 스키닝 결과를 쓰는 지오메트리. 메시가 그리는 스킨 메시 종류가 바뀌면 새로 만든다. */
  private readonly skinned = new Map<ShaderMesh, { kind: MeshKind; source: SkinSource; base: BufferGeometry; geometry: BufferGeometry }>();
  /** 영상 화면 자리를 뚫는 메시 */
  private readonly videoHoles: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];
  /** 이미 알린 문제. 같은 문제는 한 번만 알린다. */
  private readonly warned = new Set<string>();
  private readonly empty = new BufferGeometry();

  private readonly clearColor = new Color();
  private readonly bufferSize = new Vector2();
  private readonly shadowCenter = new Vector3();
  /** 모든 셰이더 재질이 같은 객체를 참조하는 프레임 단위 uniform (`shader.ts`의 `FRAME_UNIFORMS`) */
  private readonly shared = {
    uLightViewProj: { value: new Matrix4() },
    uCameraPos: { value: new Vector3() },
    uLightDir: { value: new Vector3() },
    uLightColor: { value: new Vector3() },
    uSkyColor: { value: new Vector3() },
    uGroundColor: { value: new Vector3() },
    uMoonColor: { value: new Vector3() },
    uNightAmbient: { value: new Vector3() },
    uWorldCenter: { value: new Vector3() },
    uFogColor: { value: new Vector3() },
    uFogRange: { value: new Vector2() },
    uHalftoneCell: { value: HALFTONE_CELL_CSS_PX },
  };
  private readonly frameUniforms: Uniforms;
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

    this.frameUniforms = {
      ...this.shared,
      uShadowMap: { value: shadowMap },
      uShadowTexel: { value: 1 / SHADOW_MAP_SIZE },
      uOccluder: { value: new Vector4() },
    };
    this.pools.set(TOON_SHADER, { spec: TOON_SHADER_SPEC, meshes: [], used: 0 });
  }

  // ---- Graphics: 콘텐츠 등록 ----

  defineMesh(kind: MeshKind, geometry: BufferGeometry | GeometryData): void {
    const next = isBufferGeometry(geometry) ? geometry : geometryFromData(geometry);
    const old = this.geometries.get(kind);
    if (old && old !== next) old.dispose();
    this.geometries.set(kind, next);
    this.skins.delete(kind);
    this.warned.delete(`mesh:${kind}`);
  }

  defineSkinnedMesh(kind: MeshKind, geometry: BufferGeometry | GeometryData, skin: SkinSource): void {
    this.defineMesh(kind, geometry);
    this.skins.set(kind, skin);
  }

  defineShader(kind: ShaderKind, spec: ShaderSpec): void {
    if (kind === TOON_SHADER) throw new Error(`${TOON_SHADER}는 엔진 툰 셰이더라 바꿀 수 없습니다.`);
    this.removePool(kind);
    this.pools.set(kind, { spec, meshes: [], used: 0 });
    for (const key of [...this.warned]) if (key.endsWith(`:${kind}`)) this.warned.delete(key);
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
    for (const kind of [...this.pools.keys()]) if (kind !== TOON_SHADER) this.removePool(kind);
    for (const mesh of this.pools.get(TOON_SHADER)!.meshes) {
      mesh.geometry = this.empty;
      mesh.visible = false;
    }
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.skins.clear();
    this.warned.clear();
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
    this.warnOnce(`mesh:${kind}`, `등록되지 않은 메시: ${kind}`);
    return this.empty;
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.error(message);
  }

  /** 셰이더의 메시 풀을 장면에서 빼고 재질을 지운다. */
  private removePool(kind: ShaderKind): void {
    const pool = this.pools.get(kind);
    if (!pool) return;
    for (const mesh of pool.meshes) {
      this.scene.remove(mesh);
      mesh.material.dispose();
      const entry = this.skinned.get(mesh);
      if (entry) {
        entry.geometry.dispose();
        this.skinned.delete(mesh);
      }
    }
    this.pools.delete(kind);
  }

  /** `geometry`가 `kind` 셰이더의 정점 속성을 모두 가졌는지. 맞지 않으면 한 번 알린다. */
  private fitsLayout(geometry: BufferGeometry, meshKind: MeshKind, kind: ShaderKind, spec: ShaderSpec): boolean {
    if (geometry === this.empty) return true;
    let checks = this.layoutChecks.get(geometry);
    if (!checks) this.layoutChecks.set(geometry, (checks = new Map()));
    let ok = checks.get(kind);
    if (ok === undefined) {
      const problems = layoutMismatches(spec.layout, geometryLayout(geometry));
      ok = problems.length === 0;
      checks.set(kind, ok);
      if (!ok) this.warnOnce(`layout:${meshKind}:${kind}`, `메시 ${meshKind}의 정점 속성이 셰이더 ${kind}와 맞지 않습니다: ${problems.join(', ')}`);
    }
    return ok;
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
    const [cx, cy, cz] = env.shadowCenter ?? [0, 0, 0];
    light.position.fromArray(env.lightDirection).multiplyScalar(radius * 2).add(this.shadowCenter.set(cx, cy, cz));
    // 광원이 +Y 위를 지날 수 있으므로, 광원 방향과 거의 나란하면 다른 축을 위쪽으로 쓴다.
    if (Math.abs(env.lightDirection[1]) > 0.99) light.up.set(0, 0, 1);
    else light.up.set(0, 1, 0);
    light.lookAt(cx, cy, cz);
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
    shared.uWorldCenter.value.fromArray(env.worldCenter ?? [0, 0, 0]);
    shared.uFogColor.value.fromArray(env.background);
    shared.uFogRange.value.set(env.fog?.near ?? 0, env.fog?.far ?? 0);

    const { center, radius } = frame.occluder;
    this.frameUniforms.uOccluder.value.set(center[0], center[1], center[2], radius);
  }

  /** 그리기 목록을 셰이더마다의 메시 풀에 옮긴다. 이번 프레임에 쓰지 않은 메시는 숨긴다. */
  private syncItems(items: readonly DrawItem[]): void {
    for (const pool of this.pools.values()) pool.used = 0;
    for (const item of items) {
      const kind = isShaderMaterial(item.material) ? item.material.shader : TOON_SHADER;
      const pool = this.pools.get(kind);
      if (!pool) {
        this.warnOnce(`shader:${kind}`, `등록되지 않은 셰이더: ${kind}`);
        continue;
      }
      let mesh = pool.meshes[pool.used];
      if (!mesh) {
        mesh = this.createMesh(pool.spec);
        pool.meshes.push(mesh);
        this.scene.add(mesh);
      }
      pool.used++;
      mesh.visible = this.applyItem(mesh, item, kind, pool.spec);
    }
    for (const pool of this.pools.values()) {
      for (let i = pool.used; i < pool.meshes.length; i++) pool.meshes[i].visible = false;
    }
  }

  private createMesh(spec: ShaderSpec): ShaderMesh {
    const blending = spec.blending ?? 'opaque';
    const uniforms: Uniforms = { ...this.frameUniforms, uNormalMatrix: { value: null } };
    for (const [name, value] of Object.entries(spec.uniforms ?? {})) {
      uniforms[name] = { value: null };
      assignUniform(uniforms[name], value);
    }
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: spec.vertexShader,
      fragmentShader: spec.fragmentShader,
      uniforms,
      transparent: blending !== 'opaque',
      blending: blending === 'opaque' ? NormalBlending : BLENDING[blending],
      depthWrite: spec.depthWrite ?? blending === 'opaque',
      side: SIDE[spec.side ?? 'front'],
    });
    const mesh = new Mesh(this.empty, material);
    // 모델 행렬은 콘텐츠가 계산해 넘겨 준다.
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /** 그리기 항목을 메시에 옮긴다. 정점 속성이 셰이더와 맞지 않으면 그리지 않는다(`false`). */
  private applyItem(mesh: ShaderMesh, item: DrawItem, kind: ShaderKind, spec: ShaderSpec): boolean {
    // 스킨 메시는 모델을 비동기로 불러오는 중일 수 있으므로 등록 전이면 알리지 않고 그리지 않는다.
    const base = item.skin ? (this.geometries.get(item.mesh) ?? this.empty) : this.geometry(item.mesh);
    if (!this.fitsLayout(base, item.mesh, kind, spec)) return false;
    if (item.castShadow && base !== this.empty && !base.getAttribute('position')) {
      this.warnOnce(`shadow:${item.mesh}`, `그림자를 드리우는 메시 ${item.mesh}에 position 속성이 없습니다.`);
      return false;
    }
    mesh.geometry = item.skin ? this.skinnedGeometry(mesh, item.mesh, item.skin) : base;
    // 스키닝한 정점은 이미 월드 좌표라 경계 구를 따로 계산하지 않고 화면 밖 제외를 끈다.
    // 3차원 position이 없으면 경계 구를 계산할 수 없으므로 역시 끈다.
    mesh.frustumCulled = !item.skin && mesh.geometry.getAttribute('position')?.itemSize === 3;
    mesh.matrix.fromArray(item.model);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.layers.set(0);
    if (item.castShadow) mesh.layers.enable(SHADOW_LAYER);

    const u = mesh.material.uniforms;
    assignUniform(u.uNormalMatrix, item.normal);
    const values = isShaderMaterial(item.material) ? item.material.uniforms : toonUniforms(item.material);
    if (values) for (const [name, value] of Object.entries(values)) this.setUniform(u, name, value);
    return true;
  }

  private setUniform(uniforms: Uniforms, name: string, value: UniformValue): void {
    // 셰이더 기본값에 없는 이름은 처음 넣을 때 만든다. three.js가 다음 그리기부터 올린다.
    const target = uniforms[name] ?? (uniforms[name] = { value: null });
    assignUniform(target, value);
  }

  /**
   * 풀의 메시마다 따로 가진 스킨 지오메트리에 스키닝 결과를 쓴다.
   * 같은 메시는 보통 매 프레임 같은 스킨 메시를 그리므로 종류가 같으면 지오메트리를 다시 만들지 않는다.
   * 스킨이 아직 등록되지 않았으면(비동기로 불러오는 모델) 빈 지오메트리를 그린다.
   */
  private skinnedGeometry(mesh: ShaderMesh, kind: MeshKind, bones: readonly Mat4[]): BufferGeometry {
    const source = this.skins.get(kind);
    if (!source) return this.empty;
    const base = this.geometry(kind);
    let entry = this.skinned.get(mesh);
    if (!entry || entry.kind !== kind || entry.source !== source || entry.base !== base) {
      entry?.geometry.dispose();
      const geometry = new BufferGeometry();
      geometry.setIndex(base.index);
      // 스키닝하지 않는 속성(uv, 색 등)은 등록한 지오메트리의 것을 그대로 함께 쓴다.
      for (const [name, attribute] of Object.entries(base.attributes)) {
        if (name !== 'position' && name !== 'normal') geometry.setAttribute(name, attribute);
      }
      geometry.setAttribute('position', new BufferAttribute(source.positions.slice(), 3).setUsage(DynamicDrawUsage));
      geometry.setAttribute('normal', new BufferAttribute(source.normals.slice(), 3).setUsage(DynamicDrawUsage));
      entry = { kind, source, base, geometry };
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
