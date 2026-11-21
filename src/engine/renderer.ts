import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CanvasTexture,
  DynamicDrawUsage,
  DepthTexture,
  FramebufferTexture,
  GLSL3,
  IcosahedronGeometry,
  LessEqualCompare,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  RawShaderMaterial,
  RGBFormat,
  Scene,
  SkinnedMesh,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
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
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import meshVert from '../shaders/mesh.vert?raw';
import pbrFrag from '../shaders/pbr.frag?raw';
import type { ContentRenderer, PbrMesh, RenderContext, Uniforms } from './contentRenderers/contentRenderer';
import type { Mat4 } from './math';
import { skinVertices, type SkinSource } from './skinning';
import { displaceToMoon } from './moonShape';
import { sunRayPositions } from './sunRays';
import { drawStarFace, placeStars, STAR_FACES } from './starfield';
import { LEG_BONE_COUNT, MAX_SURFACE_ZONES, RING_TUBE_RATIO, type ContentFrame, type DrawItem, type Environment, type FrameData, type MeshKind } from './frame';

const SHADOW_MAP_SIZE = 2048;
const MAX_DEVICE_PIXEL_RATIO = 2;
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

/** 해 둘레의 삼각형 햇살. 평면이라 법선은 모두 +Z다. */
function createSunRayGeometry(): BufferGeometry {
  const positions = sunRayPositions();
  const normals = new Float32Array(positions.length);
  for (let i = 2; i < normals.length; i += 3) normals[i] = 1;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
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
  /** 행성 둘레의 별 빌보드만 가진 장면. 그림자 패스에 넣지 않으려고 따로 두고, 메인 패스 전에 그린다. */
  private readonly skyScene = new Scene();
  private readonly camera = new PerspectiveCamera();
  private readonly lightCamera = new OrthographicCamera();
  private readonly geometries: Record<MeshKind, BufferGeometry>;
  private readonly depthMaterial: MeshBasicMaterial;
  private readonly shadowTarget: WebGLRenderTarget;
  private readonly pool: PbrMesh[] = [];
  private readonly contentRenderers: ReadonlyMap<string, ContentRenderer>;
  private readonly renderContext: RenderContext;
  /** 이번 프레임의 콘텐츠 값을 `kind`로 찾는 표. 매 프레임 다시 채운다. */
  private readonly contentFrames = new Map<string, ContentFrame>();
  private sceneColor: FramebufferTexture | null = null;
  /** 다리 스킨 메시의 기본 자세와 가중치. loadCharacter 전에는 없다. */
  private legSkin: SkinSource | null = null;
  private readonly skinned = new Map<PbrMesh, BufferGeometry>();

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
  };
  private readonly pbrShared: Uniforms;

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
      // 캐릭터 다리의 기본 자세. 그릴 때는 메시마다 스키닝한 복사본을 쓴다.
      leg: new BufferGeometry(),
      // 해 궤적처럼 큰 원을 그리므로 둘레를 촘촘하게, 관은 가늘어서 성기게 나눈다.
      ring: new TorusGeometry(1, RING_TUBE_RATIO, 6, 512),
      moon: createMoonGeometry(),
      sunRays: createSunRayGeometry(),
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

    // 별은 모델이 아니라 얼굴을 그린 텍스처를 붙인, 늘 카메라를 보는 스프라이트다.
    const faceTextures = STAR_FACES.map((face) => {
      const texture = new CanvasTexture(drawStarFace(face));
      texture.colorSpace = SRGBColorSpace;
      return texture;
    });
    for (const star of placeStars()) {
      // 기울기는 재질 값이라 별마다 재질을 만든다. 텍스처는 얼굴마다 공유한다.
      const sprite = new Sprite(new SpriteMaterial({ map: faceTextures[star.face], rotation: star.tilt }));
      sprite.position.fromArray(star.position);
      sprite.scale.set(star.mirrored ? -star.size : star.size, star.size, 1);
      this.skyScene.add(sprite);
    }

    const byKind = new Map<string, ContentRenderer>();
    for (const content of contentRenderers) {
      if (byKind.has(content.kind)) throw new Error(`콘텐츠 렌더러 kind 중복: ${content.kind}`);
      byKind.set(content.kind, content);
    }
    this.contentRenderers = byKind;

    // 콘텐츠 렌더러가 더한 uniform까지 모은 뒤에 PBR 재질을 만들어야 모든 재질이 함께 참조한다.
    this.pbrShared = {
      ...this.shared,
      uShadowMap: { value: shadowMap },
      uShadowTexel: { value: 1 / SHADOW_MAP_SIZE },
      uOccluder: { value: new Vector4() },
      uZoneCount: { value: 0 },
      uZoneDir: { value: Array.from({ length: MAX_SURFACE_ZONES }, () => new Vector3()) },
      uZoneColor: { value: Array.from({ length: MAX_SURFACE_ZONES }, () => new Vector3()) },
      uZoneParams: { value: Array.from({ length: MAX_SURFACE_ZONES }, () => new Vector4()) },
    };
    for (const content of contentRenderers) Object.assign(this.pbrShared, content.pbrUniforms);

    this.renderContext = {
      renderer: this.renderer,
      camera: this.camera,
      geometries: this.geometries,
      shared: this.shared,
      createPbrMesh: () => this.createPbrMesh(),
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
    if (size.x !== width || size.y !== height) this.renderer.setSize(width, height, false);
    return width / height;
  }

  render(frame: FrameData, aspect: number): void {
    const r = this.renderer;
    this.updateCameras(frame, aspect);
    this.updateSharedUniforms(frame);
    this.syncItems(frame.items);

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
    // 별은 행성과 해보다 멀리 있으므로 깊이 검사로 메인 장면이 그 앞을 가린다.
    r.render(this.skyScene, this.camera);
    r.render(this.scene, this.camera);

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

    const { center, radius } = frame.occluder;
    this.pbrShared.uOccluder.value.set(center[0], center[1], center[2], radius);

    const zones = frame.surfaceZones;
    const count = Math.min(zones.length, MAX_SURFACE_ZONES);
    const dirs = this.pbrShared.uZoneDir.value as Vector3[];
    const colors = this.pbrShared.uZoneColor.value as Vector3[];
    const params = this.pbrShared.uZoneParams.value as Vector4[];
    for (let i = 0; i < count; i++) {
      const zone = zones[i];
      dirs[i].fromArray(zone.direction);
      colors[i].fromArray(zone.color);
      params[i].set(zone.angularRadius, zone.edgeWidth, zone.glow, zone.presence);
    }
    this.pbrShared.uZoneCount.value = count;
  }

  /** 그리기 목록을 메시 풀에 옮긴다. 목록보다 남는 메시는 숨긴다. */
  private syncItems(items: readonly DrawItem[]): void {
    for (let i = 0; i < items.length; i++) {
      let mesh = this.pool[i];
      if (!mesh) {
        mesh = this.createPbrMesh();
        this.pool.push(mesh);
        this.scene.add(mesh);
      }
      this.applyItem(mesh, items[i]);
      mesh.visible = true;
    }
    for (let i = items.length; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  private createPbrMesh(): PbrMesh {
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: meshVert,
      fragmentShader: pbrFrag,
      uniforms: {
        ...this.pbrShared,
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

  private applyItem(mesh: PbrMesh, item: DrawItem): void {
    mesh.geometry = item.skin ? this.skinnedGeometry(mesh, item.skin) : this.geometries[item.mesh];
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
   * 풀의 메시마다 따로 가진 다리 지오메트리에 스키닝 결과를 쓴다.
   * 같은 메시는 매 프레임 같은 다리를 그리므로 지오메트리를 다시 만들지 않는다.
   */
  private skinnedGeometry(mesh: PbrMesh, bones: readonly Mat4[]): BufferGeometry {
    const source = this.legSkin;
    if (!source) return this.geometries.leg;
    let geometry = this.skinned.get(mesh);
    if (!geometry) {
      geometry = new BufferGeometry();
      geometry.setIndex(this.geometries.leg.index);
      geometry.setAttribute('position', new BufferAttribute(source.positions.slice(), 3).setUsage(DynamicDrawUsage));
      geometry.setAttribute('normal', new BufferAttribute(source.normals.slice(), 3).setUsage(DynamicDrawUsage));
      this.skinned.set(mesh, geometry);
    }
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
