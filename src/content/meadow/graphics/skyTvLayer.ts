import {
  AdditiveBlending,
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  GLSL3,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import skyTvVert from '../shaders/skyTv.vert?raw';
import skyTvFrag from '../shaders/skyTv.frag?raw';
import skyTvGlowVert from '../shaders/skyTvGlow.vert?raw';
import skyTvGlowFrag from '../shaders/skyTvGlow.frag?raw';
import tvSignalGlsl from '../shaders/tvSignal.glsl?raw';
import type { Vec3 } from '../../../engine/math';
import type { CameraView, Environment } from '../../../engine/frame';
import type { RenderLayer } from '../../../engine/render/graphics';
import { createTvPartGeometries } from '../../common/tv/tvGraphics';
import { TV_CABINET_BOTTOM, TV_SHAPE, tvScreenDepths } from '../../common/tv/tvShape';
import { growScale, type SkyTv } from '../objects/skyTvs';

/**
 * 하늘 텔레비전은 검은 플라스틱 브라운관이다 (2026-11-28 사용자 요청, 사진을 보여 줌). 선형 RGB.
 * 몸통은 텔레비전마다 `SkyTv.tint`를 곱하고, 테·손잡이는 몸통보다 조금 밝으며, 조작판·스피커는 더 검다.
 * 검은 몸통은 빛을 거의 받지 않으므로, 형태는 셰이더의 광택(하늘 반사와 하이라이트)이 드러낸다.
 */
const BODY_COLOR: Vec3 = [0.016, 0.016, 0.018];
const TRIM_COLOR: Vec3 = [0.024, 0.024, 0.027];
const DARK_COLOR: Vec3 = [0.007, 0.007, 0.008];
/** 채도. 흐린 날 빛에 맞춰 잔디(0.7)보다 조금 높게 둔다. */
const SATURATION = 0.8;
const INITIAL_CAPACITY = 512;
/** 몸통 가운데의 높이. 지오메트리를 이만큼 내려 몸통 가운데가 원점에 오게 한다. */
const CABINET_CENTER_Y = (TV_CABINET_BOTTOM + 0.5) / 2;

const glslNumber = (n: number): string => n.toFixed(5);
/** 화면 유리 가운데(내린 뒤의 텔레비전 좌표)와 반 폭·반 높이. 셰이더 앞에 붙인다. */
const SCREEN_GLSL = (() => {
  const { x, y, width, height } = TV_SHAPE.screen;
  const center = [x, y - CABINET_CENTER_Y, tvScreenDepths().glass].map(glslNumber).join(', ');
  return `const vec3 SCREEN_CENTER = vec3(${center});
const vec2 SCREEN_HALF = vec2(${glslNumber(width / 2)}, ${glslNumber(height / 2)});
`;
})();
/** 정점 셰이더 앞에 붙이는 공용 식 (화면 자리, 회전, 둥실거림, 방송 빛) */
const VERTEX_PRELUDE = SCREEN_GLSL + tvSignalGlsl;

/** 인스턴스 속성 이름과 한 텔레비전당 성분 수 */
const ATTRIBUTES = { iPosition: 3, iRotation: 4, iScale: 1, iTint: 1, iPhase: 1 } as const;
type AttributeName = keyof typeof ATTRIBUTES;

/** 부품 하나에 색(`color`)과 부품 번호(`aPart`)를 칠한다. */
function paint(geometry: BufferGeometry, color: Vec3, part: number): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const count = flat.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set(color, i * 3);
  flat.setAttribute('color', new BufferAttribute(colors, 3));
  flat.setAttribute('aPart', new BufferAttribute(new Float32Array(count).fill(part), 1));
  return flat;
}

/**
 * 텔레비전 부품을 색칠해 하나로 합친 지오메트리 (`position`, `normal`, `color`, `aPart`).
 * 사진의 브라운관처럼 다리가 없다 (2026-11-28 사용자 요청). 몸통 가운데가 원점에 오도록 내려, 기울기와 둥실거림이 몸통 가운데를 돈다.
 */
function tvGeometry(): BufferGeometry {
  const parts = createTvPartGeometries({ legs: false });
  const painted = [
    paint(parts.wood, BODY_COLOR, 0),
    paint(parts.trim, TRIM_COLOR, 1),
    paint(parts.dark, DARK_COLOR, 2),
    paint(parts.screen, TV_SHAPE.screenColor, 3),
  ];
  const merged = mergeGeometries(painted).translate(0, -CABINET_CENTER_Y, 0);
  for (const g of [...painted, ...Object.values(parts)]) g.dispose();
  return merged;
}

/**
 * 하늘 텔레비전을 모두 모아 한 번에 그린다. 지금 떠 있는 텔레비전(`MeadowWorld.skyTvList`)을 프레임마다 인스턴스 속성으로 옮긴다.
 * 스폰된 텔레비전은 `growScale`로 커지며 나타난다. 둥실거림과 화면의 방송 빛은 셰이더가 시간으로 정한다.
 * 텔레비전 본체와 화면 앞 빛 번짐(가산 혼합) 두 메시가 같은 인스턴스 속성을 쓴다.
 */
export class SkyTvLayer implements RenderLayer {
  readonly object = new Group();
  private readonly tvMesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  private readonly glowMesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  private tvs: readonly SkyTv[] = [];
  private time = 0;
  private capacity = 0;
  private attributes!: Record<AttributeName, InstancedBufferAttribute>;

  constructor() {
    const source = tvGeometry();
    const geometry = new InstancedBufferGeometry();
    for (const name of ['position', 'normal', 'color', 'aPart']) geometry.setAttribute(name, source.getAttribute(name));
    geometry.instanceCount = 0;

    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX_PRELUDE + skyTvVert,
      // 조각 셰이더는 기본 float 정밀도가 없으므로 상수를 정밀도 선언 뒤에 붙인다.
      fragmentShader: skyTvFrag.replace('precision highp float;', `precision highp float;
${SCREEN_GLSL}`),
      uniforms: {
        uCameraPos: { value: new Vector3() },
        uLightDir: { value: new Vector3() },
        uLightColor: { value: new Vector3() },
        uSkyColor: { value: new Vector3() },
        uGroundColor: { value: new Vector3() },
        uTime: { value: 0 },
        uSaturation: { value: SATURATION },
        uFogColor: { value: new Vector3() },
        uFogRange: { value: new Vector2() },
      },
    });
    this.tvMesh = new Mesh(geometry, material);
    this.tvMesh.frustumCulled = false;

    const glowGeometry = new InstancedBufferGeometry();
    // three.js는 `position` 속성의 개수로 그릴 정점 수를 정한다.
    glowGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), 2));
    glowGeometry.instanceCount = 0;
    // 2성분 `position`으로는 경계 구를 계산할 수 없으므로(NaN) 미리 둔다. 컬링은 끄므로 값은 쓰이지 않는다.
    glowGeometry.boundingSphere = new Sphere();
    this.glowMesh = new Mesh(
      glowGeometry,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: VERTEX_PRELUDE + skyTvGlowVert,
        fragmentShader: skyTvGlowFrag,
        uniforms: {
          uCameraPos: material.uniforms.uCameraPos,
          uTime: material.uniforms.uTime,
          uFogRange: material.uniforms.uFogRange,
        },
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.glowMesh.frustumCulled = false;
    this.object.add(this.tvMesh, this.glowMesh);
    this.ensureCapacity(INITIAL_CAPACITY);
  }

  /** 이번 프레임에 떠 있는 텔레비전과 씬 시간. 씬이 `frame`을 만들 때 넘긴다. */
  set(tvs: readonly SkyTv[], time: number): void {
    this.tvs = tvs;
    this.time = time;
  }

  update({ camera, environment }: { camera: CameraView; environment: Environment }): void {
    const u = this.tvMesh.material.uniforms;
    u.uCameraPos.value.fromArray(camera.position);
    u.uLightDir.value.fromArray(environment.lightDirection);
    u.uLightColor.value.fromArray(environment.lightColor);
    u.uSkyColor.value.fromArray(environment.skyColor);
    u.uGroundColor.value.fromArray(environment.groundColor);
    u.uTime.value = this.time;
    u.uFogColor.value.fromArray(environment.background);
    u.uFogRange.value.set(environment.fog?.near ?? 0, environment.fog?.far ?? 0);

    const tvs = this.tvs;
    this.ensureCapacity(tvs.length);
    const a = this.attributes;
    const position = a.iPosition.array as Float32Array;
    const rotation = a.iRotation.array as Float32Array;
    const size = a.iScale.array as Float32Array;
    const tint = a.iTint.array as Float32Array;
    const phase = a.iPhase.array as Float32Array;
    tvs.forEach((tv, i) => {
      position.set(tv.position, i * 3);
      rotation.set(tv.rotation, i * 4);
      size[i] = tv.size * growScale(this.time - tv.spawnedAt);
      tint[i] = tv.tint;
      phase[i] = tv.phase;
    });
    for (const attribute of Object.values(a)) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, tvs.length * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.tvMesh.geometry.instanceCount = tvs.length;
    this.glowMesh.geometry.instanceCount = tvs.length;
    this.object.visible = tvs.length > 0;
  }

  dispose(): void {
    for (const mesh of [this.tvMesh, this.glowMesh]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  /** 인스턴스 속성이 `count`개를 담지 못하면 두 배씩 늘려 새로 만든다. */
  private ensureCapacity(count: number): void {
    if (count <= this.capacity) return;
    let capacity = Math.max(this.capacity, INITIAL_CAPACITY);
    while (capacity < count) capacity *= 2;
    const attributes = {} as Record<AttributeName, InstancedBufferAttribute>;
    for (const [name, itemSize] of Object.entries(ATTRIBUTES) as [AttributeName, number][]) {
      const attribute = new InstancedBufferAttribute(new Float32Array(capacity * itemSize), itemSize);
      attribute.setUsage(DynamicDrawUsage);
      this.tvMesh.geometry.setAttribute(name, attribute);
      this.glowMesh.geometry.setAttribute(name, attribute);
      attributes[name] = attribute;
    }
    this.attributes = attributes;
    this.capacity = capacity;
  }
}
