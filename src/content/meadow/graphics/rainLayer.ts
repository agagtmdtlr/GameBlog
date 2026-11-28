import {
  BufferAttribute,
  DoubleSide,
  GLSL3,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  RawShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import rainVert from '../shaders/rain.vert?raw';
import rainFrag from '../shaders/rain.frag?raw';
import type { CameraView, Environment } from '../../../engine/frame';
import type { RenderLayer } from '../../../engine/render/graphics';
import { RAIN, rainVelocity } from '../objects/rain';
import type { WindFrame } from '../objects/wind';

/** 프레임 사이 시간이 이보다 길면(탭을 숨겼다 돌아옴 등) 이만큼만 흐른 것으로 친다. */
const MAX_FRAME_SECONDS = 0.1;

/**
 * 카메라 둘레에 내리는 비를 그린다. 빗줄기 자리는 정점 셰이더가 정하고, 이 층은 떨어진 거리와 바람에 밀린 거리를 쌓아 넘긴다.
 * 바람 방향이 바뀌어도 줄기가 튀지 않도록 밀린 거리는 프레임마다 그때의 바람 속도로 더한다.
 * 깊이 검사를 하므로 잔디·땅·텔레비전 뒤의 줄기는 가려진다. 깊이는 쓰지 않는다.
 */
export class RainLayer implements RenderLayer {
  readonly object: Mesh<InstancedBufferGeometry, RawShaderMaterial>;
  private wind: WindFrame | undefined;
  private lastTime: number | undefined;
  private fall = 0;
  private readonly drift = new Vector2();

  constructor() {
    const geometry = new InstancedBufferGeometry();
    // 두 삼각형: (폭 방향, 머리→꼬리). three.js는 `position` 속성의 개수로 그릴 정점 수를 정하므로 이 이름을 쓴다.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1]), 2));
    geometry.instanceCount = RAIN.count;
    this.object = new Mesh(
      geometry,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: rainVert,
        fragmentShader: rainFrag,
        uniforms: {
          uCameraPos: { value: new Vector3() },
          uBoxMin: { value: new Vector3(-RAIN.radius, -RAIN.below, -RAIN.radius) },
          uBoxSize: { value: new Vector3(RAIN.radius * 2, RAIN.below + RAIN.above, RAIN.radius * 2) },
          uFall: { value: 0 },
          uDrift: { value: new Vector2() },
          uVelocity: { value: new Vector3() },
          uFallJitter: { value: RAIN.fallJitter },
          uStreakSeconds: { value: RAIN.streakSeconds },
          uWidth: { value: RAIN.width },
          uColor: { value: new Vector3() },
          uOpacity: { value: RAIN.opacity },
        },
        // 줄기 사각형은 카메라를 향해 돌지만 감긴 방향이 줄기마다 달라 양면을 그린다.
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
      }),
    );
    this.object.frustumCulled = false;
  }

  /** 이번 프레임의 바람. 씬이 `frame`을 만들 때 넘긴다. 바람의 시간으로 비가 흐른다. */
  set(wind: WindFrame): void {
    this.wind = wind;
  }

  update({ camera, environment }: { camera: CameraView; environment: Environment }): void {
    const wind = this.wind;
    if (!wind) return;
    const dt = this.lastTime === undefined ? 0 : Math.max(0, Math.min(MAX_FRAME_SECONDS, wind.time - this.lastTime));
    this.lastTime = wind.time;
    const velocity = rainVelocity(wind);
    // 상자 크기로 되감아 수가 커지지 않게 한다. 셰이더가 상자 크기로 나머지를 구하고, 떨어지는 빠르기 몫이 1/60 단위라 결과는 같다.
    const size = RAIN.radius * 2;
    const height = RAIN.below + RAIN.above;
    this.fall = (this.fall + RAIN.fallSpeed * dt) % (height * 60);
    this.drift.set((this.drift.x + velocity[0] * dt) % size, (this.drift.y + velocity[2] * dt) % size);

    const u = this.object.material.uniforms;
    u.uCameraPos.value.fromArray(camera.position);
    u.uFall.value = this.fall;
    u.uDrift.value.copy(this.drift);
    u.uVelocity.value.fromArray(velocity);
    const [r, g, b] = environment.background;
    const k = RAIN.brighten;
    u.uColor.value.set(r + (1 - r) * k, g + (1 - g) * k, b + (1 - b) * k);
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
