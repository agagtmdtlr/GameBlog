import depthFrag from '../shaders/depth.frag?raw';
import depthVert from '../shaders/depth.vert?raw';
import meshVert from '../shaders/mesh.vert?raw';
import pbrFrag from '../shaders/pbr.frag?raw';
import waterFrag from '../shaders/water.frag?raw';
import {
  mat4LookAt,
  mat4Multiply,
  mat4Ortho,
  scale,
  type Mat3,
  type Mat4,
  type Vec3,
} from './math';
import {
  createBoxData,
  createCylinderData,
  createPlaneData,
  createSphereData,
  uploadMesh,
  type Mesh,
} from './mesh';
import { ShaderProgram } from './shader';

export type MeshKind = 'sphere' | 'box' | 'cylinder' | 'plane';

export const SurfacePattern = { None: 0, SphereBands: 1, Grid: 2 } as const;
export type SurfacePattern = (typeof SurfacePattern)[keyof typeof SurfacePattern];

export interface Material {
  baseColor: Vec3;
  metallic: number;
  roughness: number;
  emissive: Vec3;
  pattern: SurfacePattern;
}

export interface DrawItem {
  mesh: MeshKind;
  model: Mat4;
  normal: Mat3;
  material: Material;
  castShadow: boolean;
}

export interface Environment {
  /** 표면에서 광원을 향하는 단위 벡터 */
  lightDirection: Vec3;
  lightColor: Vec3;
  skyColor: Vec3;
  groundColor: Vec3;
  /** 화면 출력값(sRGB) 기준 배경색 */
  background: Vec3;
  /** 그림자 맵이 덮는 원점 기준 반경 */
  shadowRadius: number;
}

export interface FrameData {
  items: readonly DrawItem[];
  viewProj: Mat4;
  cameraPosition: Vec3;
  environment: Environment;
  /** 앰비언트 오클루전을 만드는 구 */
  occluder: { center: Vec3; radius: number };
  /** 물이 든 투명한 구. 나머지 장면을 모두 그린 뒤에 그린다. */
  water: WaterSphere | null;
}

export interface WaterSphere {
  /** 투명해지기 전의 불투명한 구. 그림자 맵에는 들어가지 않는다. */
  item: DrawItem;
  center: Vec3;
  radius: number;
  surfaceNormal: Vec3;
  /** 수면 높이 (구 반지름 기준) */
  level: number;
  /** 0이면 불투명한 구만, 1이면 물이 든 구만 보인다. */
  opacity: number;
  /** 물결의 세기 (0~1) */
  ripple: number;
  time: number;
}

const SHADOW_MAP_SIZE = 2048;
const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * GPU 리소스를 소유한다. 컨텍스트가 손실되면 버리고 새로 만들면 되도록,
 * 게임 상태는 전혀 들고 있지 않다.
 */
export class Renderer {
  private readonly pbr: ShaderProgram;
  private readonly depth: ShaderProgram;
  private readonly water: ShaderProgram;
  private readonly meshes: Record<MeshKind, Mesh>;
  private readonly shadowMap: WebGLTexture;
  private readonly shadowFramebuffer: WebGLFramebuffer;
  private readonly sceneColor: WebGLTexture;
  private sceneColorWidth = 0;
  private sceneColorHeight = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.pbr = new ShaderProgram(gl, meshVert, pbrFrag);
    this.depth = new ShaderProgram(gl, depthVert, depthFrag);
    this.water = new ShaderProgram(gl, meshVert, waterFrag);
    this.meshes = {
      sphere: uploadMesh(gl, createSphereData()),
      box: uploadMesh(gl, createBoxData()),
      cylinder: uploadMesh(gl, createCylinderData()),
      plane: uploadMesh(gl, createPlaneData()),
    };

    this.shadowMap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowMap);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

    this.shadowFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowMap, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.sceneColor = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneColor);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  /** 캔버스 크기를 화면에 맞추고 가로세로 비율을 반환한다. */
  resizeToDisplay(): number {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return width / height;
  }

  render(frame: FrameData): void {
    const lightViewProj = computeLightViewProj(frame.environment);
    this.renderShadowPass(frame, lightViewProj);
    this.renderMainPass(frame, lightViewProj);
  }

  private renderShadowPass(frame: FrameData, lightViewProj: Mat4): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
    gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);

    gl.useProgram(this.depth.program);
    gl.uniformMatrix4fv(this.depth.uniform('uLightViewProj'), false, lightViewProj);
    for (const item of frame.items) {
      if (!item.castShadow) continue;
      gl.uniformMatrix4fv(this.depth.uniform('uModel'), false, item.model);
      this.drawMesh(item.mesh);
    }

    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private renderMainPass(frame: FrameData, lightViewProj: Mat4): void {
    const gl = this.gl;
    const env = frame.environment;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(env.background[0], env.background[1], env.background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const p = this.pbr;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowMap);
    gl.uniform1i(p.uniform('uShadowMap'), 0);
    gl.uniform1f(p.uniform('uShadowTexel'), 1 / SHADOW_MAP_SIZE);
    gl.uniformMatrix4fv(p.uniform('uViewProj'), false, frame.viewProj);
    gl.uniformMatrix4fv(p.uniform('uLightViewProj'), false, lightViewProj);
    gl.uniform3fv(p.uniform('uCameraPos'), frame.cameraPosition);
    gl.uniform3fv(p.uniform('uLightDir'), env.lightDirection);
    gl.uniform3fv(p.uniform('uLightColor'), env.lightColor);
    gl.uniform3fv(p.uniform('uSkyColor'), env.skyColor);
    gl.uniform3fv(p.uniform('uGroundColor'), env.groundColor);
    gl.uniform4f(
      p.uniform('uOccluder'),
      frame.occluder.center[0],
      frame.occluder.center[1],
      frame.occluder.center[2],
      frame.occluder.radius,
    );
    const water = frame.water;
    gl.uniform4f(
      p.uniform('uWaterBall'),
      water ? water.center[0] : 0,
      water ? water.center[1] : 0,
      water ? water.center[2] : 0,
      water ? water.radius : 0,
    );
    gl.uniform1f(p.uniform('uWaterOpacity'), water ? water.opacity : 0);
    gl.uniform1f(p.uniform('uTime'), water ? water.time : 0);

    for (const item of frame.items) this.drawPbrItem(item);
    if (water) this.renderWaterSphere(frame, water, lightViewProj);
  }

  private drawPbrItem(item: DrawItem): void {
    const gl = this.gl;
    const p = this.pbr;
    const m = item.material;
    gl.uniformMatrix4fv(p.uniform('uModel'), false, item.model);
    gl.uniformMatrix3fv(p.uniform('uNormalMatrix'), false, item.normal);
    gl.uniform3fv(p.uniform('uBaseColor'), m.baseColor);
    gl.uniform3fv(p.uniform('uEmissive'), m.emissive);
    gl.uniform1f(p.uniform('uMetallic'), m.metallic);
    gl.uniform1f(p.uniform('uRoughness'), m.roughness);
    gl.uniform1i(p.uniform('uPattern'), m.pattern);
    this.drawMesh(item.mesh);
  }

  /** 지금까지 그린 장면을 복사해, 구 안에서 굴절된 배경으로 쓴다. */
  private renderWaterSphere(frame: FrameData, water: WaterSphere, lightViewProj: Mat4): void {
    const gl = this.gl;
    const env = frame.environment;
    this.copySceneColor();

    if (water.opacity < 1) this.drawPbrItem(water.item);

    const w = this.water;
    gl.useProgram(w.program);
    gl.uniform1i(w.uniform('uSceneColor'), 1);
    gl.uniformMatrix4fv(w.uniform('uViewProj'), false, frame.viewProj);
    gl.uniformMatrix4fv(w.uniform('uLightViewProj'), false, lightViewProj);
    gl.uniformMatrix4fv(w.uniform('uModel'), false, water.item.model);
    gl.uniformMatrix3fv(w.uniform('uNormalMatrix'), false, water.item.normal);
    gl.uniform3fv(w.uniform('uCameraPos'), frame.cameraPosition);
    gl.uniform3fv(w.uniform('uLightDir'), env.lightDirection);
    gl.uniform3fv(w.uniform('uLightColor'), env.lightColor);
    gl.uniform3fv(w.uniform('uSkyColor'), env.skyColor);
    gl.uniform3fv(w.uniform('uGroundColor'), env.groundColor);
    gl.uniform4f(w.uniform('uBall'), water.center[0], water.center[1], water.center[2], water.radius);
    gl.uniform4f(
      w.uniform('uSurface'),
      water.surfaceNormal[0],
      water.surfaceNormal[1],
      water.surfaceNormal[2],
      water.level,
    );
    gl.uniform1f(w.uniform('uOpacity'), water.opacity);
    gl.uniform1f(w.uniform('uRipple'), water.ripple);
    gl.uniform1f(w.uniform('uTime'), water.time);

    // 같은 메시를 같은 정점 셰이더로 그리므로 깊이가 같다. 불투명한 구 위에 겹쳐 그린다.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LEQUAL);
    this.drawMesh(water.item.mesh);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
  }

  private copySceneColor(): void {
    const gl = this.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneColor);
    if (width !== this.sceneColorWidth || height !== this.sceneColorHeight) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
      this.sceneColorWidth = width;
      this.sceneColorHeight = height;
    }
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
  }

  private drawMesh(kind: MeshKind): void {
    const gl = this.gl;
    const mesh = this.meshes[kind];
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
  }
}

function computeLightViewProj(env: Environment): Mat4 {
  const r = env.shadowRadius;
  const eye = scale(env.lightDirection, r * 2);
  const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
  const projection = mat4Ortho(-r, r, -r, r, 1, r * 4);
  return mat4Multiply(projection, view);
}
