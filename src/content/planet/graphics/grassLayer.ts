import {
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import grassVert from '../shaders/grass.vert?raw';
import grassFrag from '../shaders/grass.frag?raw';
import { normalize, type Vec3 } from '../../../engine/math';
import type { CameraView, Environment } from '../../../engine/frame';
import type { RenderLayer } from '../../../engine/render/graphics';
import { BLADE_STRIDE, cellsWithin, grassField, type GrassField } from '../objects/grass';
import type { WindFrame } from '../objects/wind';

/** 잎 하나의 마디 수. 마디마다 정점 두 개, 끝에 하나다. */
const SEGMENTS = 4;
/** 카메라에서 잎이 줄기 시작하는 거리와 다 사라지는 거리 */
const FADE: readonly [number, number] = [12, 19];
/** 셀을 고르는 표면 거리. 사라지는 거리보다 넉넉하다. */
const REACH = FADE[1] + 2;
/** 셰이더가 받는 밀어내는 몸의 수 (`grass.vert`의 `uPushers`) */
const MAX_PUSHERS = 8;

/** 렌더러에 넘기는 잔디를 밀어내는 몸 */
export interface GrassPusher {
  center: Vec3;
  radius: number;
}

/** 밑동에서 끝으로 가며 가늘어지는 잎 하나 */
function bladeGeometry(): { position: Float32Array; index: Uint16Array } {
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
  return { position: new Float32Array(position), index: new Uint16Array(index) };
}

/**
 * 행성 잔디밭을 한 번에 그린다. 잎 하나를 포기마다 인스턴스로 늘리고, 바람은 정점 셰이더가 휜다.
 * 카메라 둘레의 셀만 인스턴스 버퍼에 옮겨 담는다. 고른 셀이 바뀔 때만 다시 담는다.
 * 불투명하게 깊이를 쓰며, 투명한 비눗방울 층보다 먼저 등록해야 방울이 잔디에 덮이지 않는다.
 */
export class GrassLayer implements RenderLayer {
  readonly object: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  private readonly field: GrassField;
  private readonly roots: InstancedBufferAttribute;
  private readonly blades: InstancedBufferAttribute;
  private picked: number[] = [];
  private wind: WindFrame | undefined;
  private pushers: readonly GrassPusher[] = [];

  constructor(field: GrassField = grassField()) {
    this.field = field;
    const { position, index } = bladeGeometry();
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.setAttribute('position', new BufferAttribute(position, 3));

    // 가장 많이 고를 때도 담을 수 있게 전체 포기 수만큼 잡는다.
    this.roots = new InstancedBufferAttribute(new Float32Array(field.count * 3), 3);
    this.blades = new InstancedBufferAttribute(new Float32Array(field.count * 4), 4);
    for (const attribute of [this.roots, this.blades]) attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('iRoot', this.roots);
    geometry.setAttribute('iBlade', this.blades);
    geometry.instanceCount = 0;

    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: grassVert,
      fragmentShader: grassFrag,
      uniforms: {
        uCameraPos: { value: new Vector3() },
        uTime: { value: 0 },
        uWindAxis: { value: new Vector3(1, 0, 0) },
        uWindStrength: { value: 0 },
        uGustPhase: { value: 0 },
        uFade: { value: new Vector2(FADE[0], FADE[1]) },
        uPushers: { value: Array.from({ length: MAX_PUSHERS }, () => new Vector4()) },
        uLightDir: { value: new Vector3() },
        uLightColor: { value: new Vector3() },
        uSkyColor: { value: new Vector3() },
        uGroundColor: { value: new Vector3() },
        uMoonColor: { value: new Vector3() },
        uNightAmbient: { value: new Vector3() },
      },
      side: DoubleSide,
    });

    this.object = new Mesh(geometry, material);
    this.object.frustumCulled = false;
  }

  /** 이번 프레임의 바람과 잔디를 밀어내는 몸. 씬이 `frame`을 만들 때 넘긴다. */
  set(wind: WindFrame, pushers: readonly GrassPusher[]): void {
    this.wind = wind;
    this.pushers = pushers;
  }

  update({ camera, environment }: { camera: CameraView; environment: Environment }): void {
    const u = this.object.material.uniforms;
    u.uCameraPos.value.fromArray(camera.position);
    u.uLightDir.value.fromArray(environment.lightDirection);
    u.uLightColor.value.fromArray(environment.lightColor);
    u.uSkyColor.value.fromArray(environment.skyColor);
    u.uGroundColor.value.fromArray(environment.groundColor);
    u.uMoonColor.value.fromArray(environment.moonColor);
    u.uNightAmbient.value.fromArray(environment.nightAmbient);
    const wind = this.wind;
    if (wind) {
      u.uTime.value = wind.time;
      u.uWindAxis.value.fromArray(wind.axis);
      u.uWindStrength.value = wind.strength;
      u.uGustPhase.value = wind.gustPhase;
    }
    const pushers = u.uPushers.value as Vector4[];
    for (let i = 0; i < MAX_PUSHERS; i++) {
      const p = this.pushers[i];
      if (p) pushers[i].set(p.center[0], p.center[1], p.center[2], p.radius);
      else pushers[i].set(0, 0, 0, 0);
    }
    this.pickCells(camera.position);
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }

  /** 카메라 둘레의 셀을 고르고, 바뀌었으면 그 셀들의 포기를 인스턴스 버퍼에 옮겨 담는다. */
  private pickCells(cameraPosition: Vec3): void {
    const { cells, blades } = this.field;
    const picked = cellsWithin(cells, normalize(cameraPosition), REACH);
    if (picked.length === this.picked.length && picked.every((cell, i) => cell === this.picked[i])) return;
    this.picked = picked;

    const roots = this.roots.array as Float32Array;
    const shape = this.blades.array as Float32Array;
    let n = 0;
    for (const index of picked) {
      const cell = cells[index];
      for (let b = cell.start; b < cell.start + cell.count; b++, n++) {
        const o = b * BLADE_STRIDE;
        roots[n * 3] = blades[o];
        roots[n * 3 + 1] = blades[o + 1];
        roots[n * 3 + 2] = blades[o + 2];
        shape[n * 4] = blades[o + 3];
        shape[n * 4 + 1] = blades[o + 4];
        shape[n * 4 + 2] = blades[o + 5];
        shape[n * 4 + 3] = blades[o + 6];
      }
    }
    for (const attribute of [this.roots, this.blades]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, n * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.object.geometry.instanceCount = n;
    this.object.visible = n > 0;
  }
}
