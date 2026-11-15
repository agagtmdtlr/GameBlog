import { GLSL3, Matrix3, Matrix4, Mesh, RawShaderMaterial, Scene, Vector4 } from 'three';
import meshVert from '../../shaders/mesh.vert?raw';
import waterFrag from '../../shaders/water.frag?raw';
import type { WaterSphere } from '../frame';
import { ContentRenderer, type PbrMesh, type RenderContext, type Uniforms } from './contentRenderer';

/**
 * 물이 든 투명한 구. 나머지 장면을 복사해 굴절된 배경으로 쓰고,
 * 불투명한 구 위에 물 셰이더를 겹쳐 그린다.
 */
export class WaterSphereRenderer extends ContentRenderer<WaterSphere> {
  readonly kind = 'water-sphere';

  /** 물이 든 구는 그림자 맵에 없다. `pbr.frag`가 이 값으로 옅은 그림자와 커스틱을 그린다. */
  override readonly pbrUniforms = {
    uWaterBall: { value: new Vector4() },
    uWaterOpacity: { value: 0 },
    uTime: { value: 0 },
  };

  private readonly scene = new Scene();
  private uniforms!: Uniforms;
  /** 투명해지기 전의 불투명한 구 */
  private base!: PbrMesh;
  private mesh!: Mesh;

  override init(ctx: RenderContext): void {
    this.uniforms = {
      ...ctx.shared,
      uNormalMatrix: { value: new Matrix3() },
      uViewProj: { value: new Matrix4() },
      uSceneColor: { value: null },
      uBall: { value: new Vector4() },
      uGround: { value: new Vector4() },
      uSurface: { value: new Vector4() },
      uOpacity: { value: 0 },
      uRipple: { value: 0 },
      uTime: { value: 0 },
    };
    this.base = ctx.createPbrMesh();
    this.mesh = new Mesh(
      ctx.geometries.sphere,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: meshVert,
        fragmentShader: waterFrag,
        uniforms: this.uniforms,
        // 불투명한 구와 깊이가 같다. 재질 기본값인 LessEqualDepth로 그 위에 겹쳐 그린다.
        transparent: true,
        depthWrite: false,
      }),
    );
    this.mesh.matrixAutoUpdate = false;
    this.scene.add(this.base, this.mesh);
  }

  override prepare(water: WaterSphere | null): void {
    const pbr = this.pbrUniforms;
    if (water) pbr.uWaterBall.value.set(water.center[0], water.center[1], water.center[2], water.radius);
    else pbr.uWaterBall.value.set(0, 0, 0, 0);
    pbr.uWaterOpacity.value = water ? water.opacity : 0;
    pbr.uTime.value = water ? water.time : 0;
  }

  override render(water: WaterSphere, ctx: RenderContext): void {
    const sceneColor = ctx.copySceneColor();

    ctx.applyItem(this.base, water.item);
    this.base.layers.set(0);
    this.base.visible = water.opacity < 1;

    this.mesh.matrix.fromArray(water.item.model);
    this.mesh.matrixWorldNeedsUpdate = true;
    const u = this.uniforms;
    u.uNormalMatrix.value.fromArray(water.item.normal);
    u.uViewProj.value.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse);
    u.uSceneColor.value = sceneColor;
    u.uBall.value.set(water.center[0], water.center[1], water.center[2], water.radius);
    const ground = water.ground;
    u.uGround.value.set(ground.center[0], ground.center[1], ground.center[2], ground.radius);
    const n = water.surfaceNormal;
    u.uSurface.value.set(n[0], n[1], n[2], water.level);
    u.uOpacity.value = water.opacity;
    u.uRipple.value = water.ripple;
    u.uTime.value = water.time;

    ctx.renderer.render(this.scene, ctx.camera);
  }
}
