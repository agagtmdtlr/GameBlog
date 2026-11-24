import {
  AdditiveBlending,
  DoubleSide,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import bubbleVert from '../shaders/bubble.vert?raw';
import bubbleFrag from '../shaders/bubble.frag?raw';
import type { CameraView, Environment } from '../../../engine/frame';
import type { RenderLayer } from '../../../engine/render/graphics';
import type { BubbleFrame } from '../objects/bubbleBelt';

const INITIAL_CAPACITY = 256;

/** 인스턴스 속성 이름과 한 방울당 성분 수 */
const ATTRIBUTES = { iCenter: 3, iRadius: 1, iSwirl: 1 } as const;
type AttributeName = keyof typeof ATTRIBUTES;

/**
 * 비눗방울을 모두 모아 한 번에 그린다. 방울은 반지름 1인 구를 인스턴스로 늘린 것이다.
 * 막은 거의 투명하고 가장자리의 무지개빛과 비친 창만 빛나므로, 깊이를 쓰지 않고 가산 혼합한다.
 * 그래서 순서를 정렬하지 않아도 되고, 깊이 검사로 행성·위성 뒤의 방울은 가려진다.
 * 행성 씬의 셰이더 층이라 엔진의 빌보드 다음에 그려진다 (`Graphics.addLayer`).
 */
export class BubbleLayer implements RenderLayer {
  readonly object: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  private bubbles: readonly BubbleFrame[] = [];
  private capacity = 0;
  private attributes!: Record<AttributeName, InstancedBufferAttribute>;

  constructor() {
    const geometry = new InstancedBufferGeometry();
    const sphere = new SphereGeometry(1, 40, 24);
    geometry.setIndex(sphere.index);
    geometry.setAttribute('position', sphere.getAttribute('position'));

    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bubbleVert,
      fragmentShader: bubbleFrag,
      uniforms: {
        uCameraPos: { value: new Vector3() },
        uLightDir: { value: new Vector3() },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      // 안쪽 면도 그려 방울 너머 가장자리가 비쳐 보이게 한다.
      side: DoubleSide,
    });

    this.object = new Mesh(geometry, material);
    this.object.frustumCulled = false;
    this.ensureCapacity(INITIAL_CAPACITY);
  }

  /** 이번 프레임에 그릴 방울. 씬이 `frame`을 만들 때 넘긴다. */
  set(bubbles: readonly BubbleFrame[]): void {
    this.bubbles = bubbles;
  }

  update({ camera, environment }: { camera: CameraView; environment: Environment }): void {
    const bubbles = this.bubbles;
    const u = this.object.material.uniforms;
    u.uCameraPos.value.fromArray(camera.position);
    u.uLightDir.value.fromArray(environment.lightDirection);

    this.ensureCapacity(bubbles.length);
    const a = this.attributes;
    const center = a.iCenter.array as Float32Array;
    const radius = a.iRadius.array as Float32Array;
    const swirl = a.iSwirl.array as Float32Array;
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      center.set(b.center, i * 3);
      radius[i] = b.radius;
      swirl[i] = b.swirl;
    }
    for (const attribute of Object.values(a)) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, bubbles.length * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.object.geometry.instanceCount = bubbles.length;
    this.object.visible = bubbles.length > 0;
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
