import { BufferAttribute, BufferGeometry, GLSL3, Mesh, RawShaderMaterial, Sphere, Vector2, Vector3 } from 'three';
import groundVert from '../shaders/ground.vert?raw';
import groundFrag from '../shaders/ground.frag?raw';
import type { Vec3 } from '../../../engine/math';
import type { CameraView, Environment } from '../../../engine/frame';
import type { RenderLayer } from '../../../engine/render/graphics';
import { GRASS_BLADE } from './grassLayer';
import { meadowTerrainGlsl } from './terrainGlsl';

/**
 * 땅 격자: 칸 크기와 한 변의 칸 수. 카메라 둘레 ±150을 덮어 안개 끝(125) 너머까지 간다.
 * 그 밖은 하늘색(안개 색)이라 땅이 끝나는 곳이 보이지 않는다.
 */
export const GROUND_GRID = { spacing: 1.25, size: 240 };

/** 칸 번호 격자 지오메트리. 정점 셰이더가 칸 번호를 월드 좌표와 너울 높이로 옮긴다. */
function gridGeometry(): BufferGeometry {
  const { size } = GROUND_GRID;
  const row = size + 1;
  const half = size / 2;
  const positions = new Float32Array(row * row * 2);
  for (let j = 0; j <= size; j++) {
    for (let i = 0; i <= size; i++) positions.set([i - half, j - half], (j * row + i) * 2);
  }
  const indices = new Uint32Array(size * size * 6);
  let k = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const a = j * row + i;
      // 위에서 보아 반시계 방향이 앞면이다 (+Z가 아래쪽 줄).
      indices.set([a, a + row, a + 1, a + 1, a + row, a + row + 1], k);
      k += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  // 2성분 `position`으로는 경계 구를 계산할 수 없으므로(NaN) 미리 둔다. 컬링은 끄므로 값은 쓰이지 않는다.
  geometry.boundingSphere = new Sphere();
  return geometry;
}

/**
 * 초원 땅을 그린다. 땅이 바다처럼 너울지므로(`meadowSwell`) 정해진 메시 대신 카메라를 따라가는 격자를
 * 정점 셰이더가 지금 너울 위로 올린다. 잔디와 같은 땅 함수(`meadowTerrainGlsl`)와 같은 시각을 쓰므로 잔디 뿌리와 맞는다.
 */
export class GroundLayer implements RenderLayer {
  readonly object: Mesh<BufferGeometry, RawShaderMaterial>;
  private swellTime = 0;

  /** @param albedo 땅 색 (선형 RGB) */
  constructor(albedo: Vec3) {
    this.object = new Mesh(
      gridGeometry(),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: meadowTerrainGlsl() + groundVert,
        fragmentShader: groundFrag,
        uniforms: {
          uGridCenter: { value: new Int32Array(2) },
          uSpacing: { value: GROUND_GRID.spacing },
          uSwellTime: { value: 0 },
          uCameraPos: { value: new Vector3() },
          uLightDir: { value: new Vector3() },
          uLightColor: { value: new Vector3() },
          uSkyColor: { value: new Vector3() },
          uGroundColor: { value: new Vector3() },
          uAlbedo: { value: new Vector3(...albedo) },
          uSaturation: { value: GRASS_BLADE.saturation },
          uFogColor: { value: new Vector3() },
          uFogRange: { value: new Vector2() },
        },
      }),
    );
    this.object.frustumCulled = false;
  }

  /** 땅 너울의 시각 (`MeadowWorld.time`). 씬이 `frame`을 만들 때 넘긴다. */
  set(swellTime: number): void {
    this.swellTime = swellTime;
  }

  update({ camera, environment }: { camera: CameraView; environment: Environment }): void {
    const u = this.object.material.uniforms;
    const grid = u.uGridCenter.value as Int32Array;
    // 칸에 맞춰 옮겨야 땅이 카메라를 따라 미끄러지지 않는다.
    grid[0] = Math.round(camera.position[0] / GROUND_GRID.spacing);
    grid[1] = Math.round(camera.position[2] / GROUND_GRID.spacing);
    u.uSwellTime.value = this.swellTime;
    u.uCameraPos.value.fromArray(camera.position);
    u.uLightDir.value.fromArray(environment.lightDirection);
    u.uLightColor.value.fromArray(environment.lightColor);
    u.uSkyColor.value.fromArray(environment.skyColor);
    u.uGroundColor.value.fromArray(environment.groundColor);
    u.uFogColor.value.fromArray(environment.background);
    u.uFogRange.value.set(environment.fog?.near ?? 0, environment.fog?.far ?? 0);
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
