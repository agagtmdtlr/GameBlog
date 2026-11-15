import {
  AdditiveBlending,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix3,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  Scene,
  Vector3,
  type Blending,
} from 'three';
import billboardVert from '../../shaders/billboard.vert?raw';
import heatFrag from '../../shaders/heat.frag?raw';
import meshVert from '../../shaders/mesh.vert?raw';
import puffFrag from '../../shaders/puff.frag?raw';
import { SMOKE_CAPACITY, SMOKE_STRIDE, type HeatSphere } from '../frame';
import { ContentRenderer, type RenderContext, type Uniforms } from './contentRenderer';

/** 구 반지름 기준 빛 번짐의 크기와 가장 밝을 때의 세기 */
const HALO_SIZE = 3.4;
const HALO_STRENGTH = 0.32;

interface Billboards {
  mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  /** 인스턴스마다 `SMOKE_STRIDE`개씩 들어가는 값 */
  buffer: InstancedInterleavedBuffer;
}

/**
 * 달아오른 구. 불투명한 구 위에 빛나는 껍질을 겹쳐 그리고,
 * 둘레의 빛 번짐과 연기를 카메라를 향하는 사각형으로 그린다.
 */
export class HeatSphereRenderer extends ContentRenderer<HeatSphere> {
  readonly kind = 'heat-sphere';

  private readonly scene = new Scene();
  private shellUniforms!: Uniforms;
  private shell!: Mesh;
  private halo!: Billboards;
  private smoke!: Billboards;

  override init(ctx: RenderContext): void {
    this.shellUniforms = {
      ...ctx.shared,
      uNormalMatrix: { value: new Matrix3() },
      uHeat: { value: 0 },
      uTime: { value: 0 },
    };
    this.shell = new Mesh(
      ctx.geometries.sphere,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: meshVert,
        fragmentShader: heatFrag,
        uniforms: this.shellUniforms,
        // 불투명한 구와 깊이가 같다. 재질 기본값인 LessEqualDepth로 그 위에 더한다.
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.shell.matrixAutoUpdate = false;

    // 빛 번짐은 구 앞쪽과 바닥에도 얹히도록 깊이를 보지 않는다.
    this.halo = createBillboards(1, [1.0, 0.22, 0.05], 0, AdditiveBlending, false);
    this.smoke = createBillboards(SMOKE_CAPACITY, [0.4, 0.385, 0.375], 1, undefined, true);
    this.shell.renderOrder = 0;
    this.halo.mesh.renderOrder = 1;
    this.smoke.mesh.renderOrder = 2;
    this.scene.add(this.shell, this.halo.mesh, this.smoke.mesh);
  }

  override render(heat: HeatSphere, ctx: RenderContext): void {
    const glowing = heat.heat > 0;
    this.shell.visible = glowing;
    this.shell.matrix.fromArray(heat.item.model);
    this.shell.matrixWorldNeedsUpdate = true;
    this.shellUniforms.uNormalMatrix.value.fromArray(heat.item.normal);
    this.shellUniforms.uHeat.value = heat.heat;
    this.shellUniforms.uTime.value = heat.time;

    this.halo.mesh.visible = glowing;
    const flicker = 0.9 + 0.1 * Math.sin(heat.time * 4.3);
    const halo = this.halo.buffer.array;
    halo[0] = heat.center[0];
    halo[1] = heat.center[1];
    halo[2] = heat.center[2];
    halo[3] = heat.radius * HALO_SIZE;
    halo[4] = heat.heat * HALO_STRENGTH * flicker;
    this.halo.buffer.needsUpdate = true;

    this.smoke.mesh.visible = heat.smokeCount > 0;
    this.smoke.mesh.geometry.instanceCount = heat.smokeCount;
    this.smoke.buffer.array.set(heat.smoke.subarray(0, heat.smokeCount * SMOKE_STRIDE));
    this.smoke.buffer.needsUpdate = true;

    ctx.renderer.render(this.scene, ctx.camera);
  }
}

function createBillboards(
  capacity: number,
  color: readonly [number, number, number],
  smoke: number,
  blending: Blending | undefined,
  depthTest: boolean,
): Billboards {
  const quad = new PlaneGeometry(2, 2);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(quad.getIndex());
  geometry.setAttribute('position', quad.getAttribute('position'));
  const buffer = new InstancedInterleavedBuffer(new Float32Array(capacity * SMOKE_STRIDE), SMOKE_STRIDE);
  buffer.setUsage(DynamicDrawUsage);
  geometry.setAttribute('aCenter', new InterleavedBufferAttribute(buffer, 3, 0));
  geometry.setAttribute('aParams', new InterleavedBufferAttribute(buffer, 4, 3));
  geometry.instanceCount = capacity;

  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: billboardVert,
    fragmentShader: puffFrag,
    uniforms: {
      uColor: { value: new Vector3(...color) },
      uHotColor: { value: new Vector3(1.0, 0.42, 0.12) },
      uSmoke: { value: smoke },
    },
    transparent: true,
    depthWrite: false,
    depthTest,
  });
  if (blending !== undefined) material.blending = blending;

  const mesh = new Mesh(geometry, material);
  // 정점 셰이더가 위치를 정하므로 지오메트리의 경계로는 화면 밖인지 알 수 없다.
  mesh.frustumCulled = false;
  return { mesh, buffer };
}
