import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  GLSL3,
  Group,
  Mesh,
  RawShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import lightningVert from '../shaders/lightning.vert?raw';
import lightningFrag from '../shaders/lightning.frag?raw';
import lightningGlowVert from '../shaders/lightningGlow.vert?raw';
import lightningGlowFrag from '../shaders/lightningGlow.frag?raw';
import type { Vec3 } from '../../../engine/math';
import type { CameraView, Environment } from '../../../engine/frame';
import type { RenderLayer } from '../../../engine/render/graphics';
import { LIGHTNING, type LightningStrike } from '../objects/lightning';

/** 번개 줄기 심과 번짐의 폭 */
const BOLT_WIDTH: [number, number] = [0.6, 5];
/** 구름 속 번쩍임의 크기 (반지름) */
const CLOUD_GLOW_SIZE = 45;
/** 번개 밝기를 화면 빛으로 바꾸는 몫. 첫 번쩍임에서 1을 넘겨 심이 하얗게 타게 한다. */
const FLASH_GAIN = 2;

/** 선형 RGB를 화면 출력값(sRGB)으로 */
const srgb = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const toSrgb = ([r, g, b]: Vec3): Vec3 => [srgb(r), srgb(g), srgb(b)];

/** 사각형 하나의 여섯 모서리 (폭 방향, 시작→끝) */
const QUAD: [number, number][] = [
  [-1, 0],
  [1, 0],
  [1, 1],
  [-1, 0],
  [1, 1],
  [-1, 1],
];

/** 번개 하나의 줄기·곁가지 마디를 심과 번짐 두 벌의 사각형으로 만든다. */
function boltGeometry(strike: LightningStrike): BufferGeometry {
  const lines = [
    { points: strike.bolt, weight: 1 },
    ...strike.branches.map((points) => ({ points, weight: 0 })),
  ];
  const start: number[] = [];
  const end: number[] = [];
  const corner: number[] = [];
  const weight: number[] = [];
  const glow: number[] = [];
  for (const g of [1, 0]) {
    for (const line of lines) {
      for (let i = 0; i + 1 < line.points.length; i++) {
        for (const [x, y] of QUAD) {
          start.push(...line.points[i]);
          end.push(...line.points[i + 1]);
          corner.push(x, y);
          weight.push(line.weight);
          glow.push(g);
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(start), 3));
  geometry.setAttribute('aEnd', new BufferAttribute(new Float32Array(end), 3));
  geometry.setAttribute('aCorner', new BufferAttribute(new Float32Array(corner), 2));
  geometry.setAttribute('aWeight', new BufferAttribute(new Float32Array(weight), 1));
  geometry.setAttribute('aGlow', new BufferAttribute(new Float32Array(glow), 1));
  return geometry;
}

/**
 * 번개를 그린다: 땅까지 내리꽂히는 갈라진 줄기와, 번개가 친 구름 속의 번쩍임.
 * 번개가 바뀔 때만 줄기 지오메트리를 새로 만들고, 번쩍임은 프레임마다 밝기만 바꾼다. 번개가 없으면 그리지 않는다.
 * 장면을 비추는 번개 빛은 `MeadowWorld.environment`가 맡는다.
 */
export class LightningLayer implements RenderLayer {
  readonly object = new Group();
  private readonly bolt: Mesh<BufferGeometry, RawShaderMaterial>;
  private readonly cloudGlow: Mesh<BufferGeometry, RawShaderMaterial>;
  private strike: LightningStrike | undefined;
  private shownStrike: LightningStrike | undefined;
  private flash = 0;

  constructor() {
    const color = new Vector3(...toSrgb(LIGHTNING.color));
    const cameraPos = { value: new Vector3() };
    const flash = { value: 0 };
    const blend = { side: DoubleSide, transparent: true, depthWrite: false, blending: AdditiveBlending } as const;

    this.bolt = new Mesh(
      new BufferGeometry(),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: lightningVert,
        fragmentShader: lightningFrag,
        uniforms: {
          uCameraPos: cameraPos,
          uWidth: { value: new Vector2(...BOLT_WIDTH) },
          uColor: { value: color },
          uFlash: flash,
          uFogRange: { value: new Vector2() },
        },
        ...blend,
      }),
    );
    this.bolt.frustumCulled = false;

    const glowGeometry = new BufferGeometry();
    glowGeometry.setAttribute('position', new BufferAttribute(new Float32Array(QUAD.flatMap(([x, y]) => [x, y * 2 - 1])), 2));
    // 2성분 `position`으로는 경계 구를 계산할 수 없으므로(NaN) 미리 둔다. 컬링은 끄므로 값은 쓰이지 않는다.
    glowGeometry.boundingSphere = new Sphere();
    this.cloudGlow = new Mesh(
      glowGeometry,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: lightningGlowVert,
        fragmentShader: lightningGlowFrag,
        uniforms: {
          uCameraPos: cameraPos,
          uCenter: { value: new Vector3() },
          uSize: { value: CLOUD_GLOW_SIZE },
          uColor: { value: color },
          uFlash: flash,
        },
        ...blend,
      }),
    );
    this.cloudGlow.frustumCulled = false;
    this.object.add(this.cloudGlow, this.bolt);
    this.object.visible = false;
  }

  /** 지금 번개와 그 밝기. 씬이 `frame`을 만들 때 넘긴다. */
  set(strike: LightningStrike | undefined, flash: number): void {
    this.strike = strike;
    this.flash = flash;
  }

  update({ camera, environment }: { camera: CameraView; environment: Environment }): void {
    const strike = this.strike;
    this.object.visible = !!strike && this.flash > 0.002;
    if (!strike || !this.object.visible) return;
    if (strike !== this.shownStrike) {
      this.shownStrike = strike;
      this.bolt.geometry.dispose();
      this.bolt.geometry = boltGeometry(strike);
      this.bolt.visible = strike.bolt.length > 0;
    }
    const u = this.bolt.material.uniforms;
    u.uCameraPos.value.fromArray(camera.position);
    // 제곱근으로 줄기가 장면 빛보다 조금 더 오래 남아 눈에 걸린다.
    u.uFlash.value = Math.sqrt(this.flash) * FLASH_GAIN;
    u.uFogRange.value.set(environment.fog?.near ?? 0, environment.fog?.far ?? 0);
    this.cloudGlow.material.uniforms.uCenter.value.fromArray(strike.cloud);
  }

  dispose(): void {
    for (const mesh of [this.bolt, this.cloudGlow]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
