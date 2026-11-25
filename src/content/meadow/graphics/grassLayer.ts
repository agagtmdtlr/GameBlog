import {
  BufferAttribute,
  DoubleSide,
  GLSL3,
  Group,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import grassVert from '../shaders/grass.vert?raw';
import grassFrag from '../shaders/grass.frag?raw';
import type { Vec3 } from '../../../engine/math';
import type { CameraView, Environment } from '../../../engine/frame';
import type { RenderLayer } from '../../../engine/render/graphics';
import type { WindFrame } from '../objects/wind';
import { meadowTerrainGlsl } from './terrainGlsl';

/** 잎 하나의 마디 수. 마디마다 정점 두 개, 끝에 하나다. */
const SEGMENTS = 4;

/**
 * 잔디 격자. 가까운 격자는 촘촘하고, 먼 격자는 성기고 잎이 넓다. 둘은 카메라 거리 `band`로 몫을 나눠 맞물린다.
 * 격자 가운데는 카메라에서 바라보는 쪽으로 `ahead`만큼 앞이다.
 */
export const GRASS_RINGS = [
  { spacing: 0.13, size: 320, ahead: 15, band: [-2, -1, 16, 21], widthScale: 1 },
  { spacing: 0.4, size: 260, ahead: 40, band: [16, 21, 46, 54], widthScale: 2.6 },
] as const;

/** 카메라 수평 거리: 이 사이에서 잎 색이 땅 색으로 녹아든다. */
const COLOR_FADE: readonly [number, number] = [30, 54];

/** 밑동에서 끝으로 가며 가늘어지는 잎 하나 */
function bladeGeometry(): InstancedBufferGeometry {
  const position: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = i / SEGMENTS;
    position.push(-0.5, t, 0, 0.5, t, 0);
  }
  position.push(0, 1, 0);
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (SEGMENTS - 1) * 2;
  index.push(last, last + 1, SEGMENTS * 2);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(new BufferAttribute(new Uint16Array(index), 1));
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  return geometry;
}

/**
 * 초원 잔디를 그린다. 잔디는 버퍼에 담지 않고, 정점 셰이더가 격자 칸의 월드 좌표에서 해시로 잎을 만든다.
 * 그래서 초원이 아무리 넓어도 카메라 둘레 격자만큼(약 17만 잎)만 그린다. 바람은 정점 셰이더가 휜다.
 */
export class GrassLayer implements RenderLayer {
  readonly object = new Group();
  private readonly meshes: Mesh<InstancedBufferGeometry, RawShaderMaterial>[];
  private wind: WindFrame | undefined;
  private pusher: { center: Vec3; radius: number } | undefined;

  /** @param groundColor 잔디 아래 땅의 색 (선형 RGB). 먼 잎이 이 색을 받은 땅으로 녹아든다. */
  constructor(private readonly groundColor: Vec3) {
    const vertexShader = meadowTerrainGlsl() + grassVert;
    this.meshes = GRASS_RINGS.map((ring) => {
      const geometry = bladeGeometry();
      geometry.instanceCount = ring.size * ring.size;
      const material = new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader: grassFrag,
        uniforms: {
          uCameraPos: { value: new Vector3() },
          uCameraForward: { value: new Vector2(0, -1) },
          // ivec2 uniform은 three.js가 배열로 받는다.
          uGridCenter: { value: new Int32Array(2) },
          uSpacing: { value: ring.spacing },
          uGridSize: { value: ring.size },
          uBand: { value: new Vector4(...ring.band) },
          uWidthScale: { value: ring.widthScale },
          uTime: { value: 0 },
          uWindDir: { value: new Vector2(1, 0) },
          uWindStrength: { value: 0 },
          uGustTravel: { value: 0 },
          uPusher: { value: new Vector4() },
          uLightDir: { value: new Vector3() },
          uLightColor: { value: new Vector3() },
          uSkyColor: { value: new Vector3() },
          uGroundColor: { value: new Vector3() },
          uFadeColor: { value: new Vector3() },
          uColorFade: { value: new Vector2(...COLOR_FADE) },
        },
        side: DoubleSide,
      });
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.object.add(mesh);
      return mesh;
    });
  }

  /** 이번 프레임의 바람과 잔디를 밀어내는 몸. 씬이 `frame`을 만들 때 넘긴다. */
  set(wind: WindFrame, pusher: { center: Vec3; radius: number }): void {
    this.wind = wind;
    this.pusher = pusher;
  }

  update({ camera, environment }: { camera: CameraView; environment: Environment }): void {
    const [cx, , cz] = camera.position;
    const fx = camera.target[0] - cx;
    const fz = camera.target[2] - cz;
    const fl = Math.hypot(fx, fz) || 1;
    const forward = [fx / fl, fz / fl];
    // 먼 잎이 녹아드는 색: 해를 정면으로 받은 땅의 툰 색 (밝은 단계 + 앰비언트)
    const ambient = environment.groundColor.map((g, i) => g * 0.4 + environment.skyColor[i] * 0.6);
    const fade = this.groundColor.map((c, i) => c * (environment.lightColor[i] / Math.PI + ambient[i]));

    GRASS_RINGS.forEach((ring, index) => {
      const u = this.meshes[index].material.uniforms;
      u.uCameraPos.value.fromArray(camera.position);
      u.uCameraForward.value.set(forward[0], forward[1]);
      // 칸에 맞춰 옮겨야 잎이 카메라를 따라 미끄러지지 않는다.
      const grid = u.uGridCenter.value as Int32Array;
      grid[0] = Math.round((cx + forward[0] * ring.ahead) / ring.spacing);
      grid[1] = Math.round((cz + forward[1] * ring.ahead) / ring.spacing);
      u.uLightDir.value.fromArray(environment.lightDirection);
      u.uLightColor.value.fromArray(environment.lightColor);
      u.uSkyColor.value.fromArray(environment.skyColor);
      u.uGroundColor.value.fromArray(environment.groundColor);
      u.uFadeColor.value.fromArray(fade);
      const wind = this.wind;
      if (wind) {
        u.uTime.value = wind.time;
        u.uWindDir.value.set(wind.direction[0], wind.direction[1]);
        u.uWindStrength.value = wind.strength;
        u.uGustTravel.value = wind.gustTravel;
      }
      const p = this.pusher;
      if (p) u.uPusher.value.set(p.center[0], p.center[1], p.center[2], p.radius);
    });
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
