import {
  BufferAttribute,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import skyTvVert from '../shaders/skyTv.vert?raw';
import skyTvFrag from '../shaders/skyTv.frag?raw';
import type { Vec3 } from '../../../engine/math';
import type { CameraView, Environment } from '../../../engine/frame';
import type { RenderLayer } from '../../../engine/render/graphics';
import { createTvPartGeometries } from '../../common/tv/tvGraphics';
import { TV_SHAPE } from '../../common/tv/tvShape';
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

/** 텔레비전 부품을 색칠해 하나로 합친 지오메트리 (`position`, `normal`, `color`, `aPart`) */
function tvGeometry(): BufferGeometry {
  const parts = createTvPartGeometries();
  const painted = [
    paint(parts.wood, BODY_COLOR, 0),
    paint(parts.trim, TRIM_COLOR, 1),
    paint(parts.dark, DARK_COLOR, 2),
    paint(parts.screen, TV_SHAPE.screenColor, 3),
  ];
  const merged = mergeGeometries(painted);
  for (const g of [...painted, ...Object.values(parts)]) g.dispose();
  return merged;
}

/**
 * 하늘 텔레비전을 모두 모아 한 번에 그린다. 지금 떠 있는 텔레비전(`MeadowWorld.skyTvList`)을 프레임마다 인스턴스 속성으로 옮긴다.
 * 스폰된 텔레비전은 `growScale`로 커지며 나타난다. 둥실거림은 정점 셰이더가 한다.
 */
export class SkyTvLayer implements RenderLayer {
  readonly object: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
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
      vertexShader: skyTvVert,
      fragmentShader: skyTvFrag,
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
    this.object = new Mesh(geometry, material);
    this.object.frustumCulled = false;
    this.ensureCapacity(INITIAL_CAPACITY);
  }

  /** 이번 프레임에 떠 있는 텔레비전과 씬 시간. 씬이 `frame`을 만들 때 넘긴다. */
  set(tvs: readonly SkyTv[], time: number): void {
    this.tvs = tvs;
    this.time = time;
  }

  update({ camera, environment }: { camera: CameraView; environment: Environment }): void {
    const u = this.object.material.uniforms;
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
    this.object.geometry.instanceCount = tvs.length;
    this.object.visible = tvs.length > 0;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }

  /** 인스턴스 속성이 `count`개를 담지 못하면 두 배씩 늘려 새로 만든다. */
  private ensureCapacity(count: number): void {
    if (count <= this.capacity) return;
    let capacity = Math.max(this.capacity, INITIAL_CAPACITY);
    while (capacity < count) capacity *= 2;
    const geometry = this.object.geometry;
    const attributes = {} as Record<AttributeName, InstancedBufferAttribute>;
    for (const [name, itemSize] of Object.entries(ATTRIBUTES) as [AttributeName, number][]) {
      const attribute = new InstancedBufferAttribute(new Float32Array(capacity * itemSize), itemSize);
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      attributes[name] = attribute;
    }
    this.attributes = attributes;
    this.capacity = capacity;
  }
}
