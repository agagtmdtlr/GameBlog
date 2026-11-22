import {
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import billboardVert from '../shaders/billboard.vert?raw';
import billboardFrag from '../shaders/billboard.frag?raw';
import { atlasUv, backToFrontOrder, packAtlas, type AtlasLayout, type Billboard, type BillboardImage } from './billboard';
import { drawBillboardAtlas, drawImageIntoCell } from './billboardAtlas';
import type { CameraView } from './frame';

const INITIAL_CAPACITY = 64;

/** 인스턴스 속성 이름과 한 빌보드당 성분 수 */
const ATTRIBUTES = {
  iCenter: 3,
  iSize: 2,
  iRotation: 1,
  iUvRect: 4,
  // rgb와 불투명도
  iColor: 4,
  iToneMap: 1,
} as const;
type AttributeName = keyof typeof ATTRIBUTES;

/**
 * 이번 프레임의 빌보드를 모두 모아 한 번에 그린다. 그림은 한 장의 아틀라스에 있고,
 * 빌보드마다 다른 값은 인스턴스 속성으로 넘기므로 그리기 호출은 늘 하나다.
 * 반투명 가장자리가 자연스럽게 섞이도록 매 프레임 카메라에서 먼 것부터 속성을 채운다.
 */
export class BillboardBatch {
  readonly mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  private readonly layout: AtlasLayout;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private capacity = 0;
  private attributes!: Record<AttributeName, InstancedBufferAttribute>;

  constructor() {
    this.layout = packAtlas();
    this.canvas = drawBillboardAtlas(this.layout);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    // 투명한 칸은 rgb가 검정이라, 그대로 거르면 그림 가장자리에 검은 테가 번진다. 알파를 곱해 올리고 그대로 섞는다.
    this.texture.premultiplyAlpha = true;

    const geometry = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    geometry.setIndex(quad.index);
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));

    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: billboardVert,
      fragmentShader: billboardFrag,
      uniforms: {
        uAtlas: { value: this.texture },
        uCameraPos: { value: new Vector3() },
        uCameraUp: { value: new Vector3() },
      },
      transparent: true,
      premultipliedAlpha: true,
      // 좌우로 뒤집은 빌보드는 감김 방향이 바뀐다.
      side: DoubleSide,
    });

    this.mesh = new Mesh(geometry, material);
    // 정점 위치는 셰이더가 정하므로 지오메트리의 경계 구로는 화면 밖을 판단할 수 없다.
    this.mesh.frustumCulled = false;
    this.ensureCapacity(INITIAL_CAPACITY);
  }

  /** 그림 파일을 불러와 아틀라스의 그 칸에 그리고 텍스처를 다시 올린다. */
  async loadImage(image: BillboardImage, url: string): Promise<void> {
    const element = new Image();
    element.src = url;
    await element.decode();
    drawImageIntoCell(this.canvas, this.layout, image, element);
    this.texture.needsUpdate = true;
  }

  /** 이번 프레임에 그릴 빌보드를 인스턴스 속성에 옮긴다. */
  update(billboards: readonly Billboard[], camera: CameraView): void {
    const u = this.mesh.material.uniforms;
    u.uCameraPos.value.fromArray(camera.position);
    u.uCameraUp.value.fromArray(camera.up);

    this.ensureCapacity(billboards.length);
    const a = this.attributes;
    const center = a.iCenter.array as Float32Array;
    const size = a.iSize.array as Float32Array;
    const rotation = a.iRotation.array as Float32Array;
    const uvRect = a.iUvRect.array as Float32Array;
    const color = a.iColor.array as Float32Array;
    const toneMap = a.iToneMap.array as Float32Array;

    const order = backToFrontOrder(billboards, camera.position);
    for (let slot = 0; slot < order.length; slot++) {
      const b = billboards[order[slot]];
      center.set(b.position, slot * 3);
      size.set(b.size, slot * 2);
      rotation[slot] = b.rotation ?? 0;
      uvRect.set(atlasUv(this.layout, b.image, b.frame), slot * 4);
      color.set(b.color, slot * 4);
      color[slot * 4 + 3] = b.opacity ?? 1;
      toneMap[slot] = b.toneMapped ? 1 : 0;
    }
    for (const attribute of Object.values(a)) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, billboards.length * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.mesh.geometry.instanceCount = billboards.length;
    this.mesh.visible = billboards.length > 0;
  }

  /** 인스턴스 속성이 `count`개를 담지 못하면 두 배씩 늘려 새로 만든다. */
  private ensureCapacity(count: number): void {
    if (count <= this.capacity) return;
    let capacity = Math.max(this.capacity, INITIAL_CAPACITY);
    while (capacity < count) capacity *= 2;
    const geometry = this.mesh.geometry;
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
