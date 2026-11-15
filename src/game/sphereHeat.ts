import { SMOKE_CAPACITY, SMOKE_STRIDE } from '../engine/frame';
import { normalize, type Vec3 } from '../engine/math';

const HEAT_UP_SECONDS = 0.7;
const COOL_DOWN_SECONDS = 1.6;

const EMIT_PER_SECOND = 40;
const MIN_LIFE_SECONDS = 1.3;
const MAX_LIFE_SECONDS = 2.4;
/** 표면에서 뿜어져 나오는 속도와, 그 뒤 위로 떠오르는 가속도 */
const PUFF_SPEED = 0.9;
const BUOYANCY = 2.4;
const DRAG = 1.3;
/** 구 반지름 기준 연기 크기 (처음, 사라질 때) */
const START_SIZE = 0.35;
const END_SIZE = 1.7;
const MAX_OPACITY = 0.5;

interface SmokeParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  seed: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 달아오른 구의 상태. 열이 오르내리고, 표면에서 연기가 뿜어져 나와 위로 흩어진다. */
export class SphereHeat {
  /** 0이면 식어 있고 1이면 완전히 달아올랐다. */
  amount = 0;
  time = 0;

  private target = 0;
  private emitDebt = 0;
  private readonly particles: SmokeParticle[] = [];
  private readonly buffer = new Float32Array(SMOKE_CAPACITY * SMOKE_STRIDE);
  // 테스트가 같은 결과를 얻도록 난수를 직접 만든다 (mulberry32).
  private randomState = 0x9e3779b9;

  setHeated(heated: boolean): void {
    this.target = heated ? 1 : 0;
  }

  get smokeCount(): number {
    return this.particles.length;
  }

  /** 열도 연기도 남아 있지 않으면 그릴 것이 없다. */
  get visible(): boolean {
    return this.amount > 0 || this.particles.length > 0;
  }

  /**
   * @param center 구의 중심
   * @param radius 구의 반지름
   * @param planetCenter 연기가 멀어지는 기준점. 위쪽은 입자마다 다르다.
   */
  update(dt: number, center: Vec3, radius: number, planetCenter: Vec3): void {
    this.time += dt;
    this.amount =
      this.target > this.amount
        ? Math.min(this.target, this.amount + dt / HEAT_UP_SECONDS)
        : Math.max(this.target, this.amount - dt / COOL_DOWN_SECONDS);

    const drag = Math.exp(-DRAG * dt);
    const particles = this.particles;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      const up = normalize([p.x - planetCenter[0], p.y - planetCenter[1], p.z - planetCenter[2]]);
      p.vx = (p.vx + up[0] * BUOYANCY * dt) * drag;
      p.vy = (p.vy + up[1] * BUOYANCY * dt) * drag;
      p.vz = (p.vz + up[2] * BUOYANCY * dt) * drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }

    this.emitDebt += EMIT_PER_SECOND * this.amount * dt;
    const up = normalize([
      center[0] - planetCenter[0],
      center[1] - planetCenter[1],
      center[2] - planetCenter[2],
    ]);
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      if (particles.length < SMOKE_CAPACITY) particles.push(this.spawn(center, radius, up));
    }
  }

  /**
   * 렌더러에 넘기는 연기 값. 입자마다 x, y, z, 크기, 불투명도, 무늬 씨앗, 열기 순서로
   * `SMOKE_STRIDE`개씩 들어 있다. 다음 호출 때 같은 배열을 덮어쓴다.
   */
  smokeData(radius: number): Float32Array {
    const out = this.buffer;
    this.particles.forEach((p, i) => {
      const t = p.age / p.life;
      const o = i * SMOKE_STRIDE;
      out[o] = p.x;
      out[o + 1] = p.y;
      out[o + 2] = p.z;
      out[o + 3] = radius * (START_SIZE + (END_SIZE - START_SIZE) * Math.sqrt(t));
      out[o + 4] = MAX_OPACITY * smoothstep(0, 0.12, t) * (1 - t) ** 1.5;
      out[o + 5] = p.seed;
      // 갓 나온 연기는 구의 열기에 물든다.
      out[o + 6] = (1 - t) ** 4;
    });
    return out;
  }

  private spawn(center: Vec3, radius: number, up: Vec3): SmokeParticle {
    // 구 표면 전체에서 나오되 위쪽에 더 몰리게 한다.
    const z = this.random() * 2 - 1;
    const angle = this.random() * Math.PI * 2;
    const ring = Math.sqrt(1 - z * z);
    const direction = normalize([
      ring * Math.cos(angle) + up[0] * 0.7,
      z + up[1] * 0.7,
      ring * Math.sin(angle) + up[2] * 0.7,
    ]);
    const speed = PUFF_SPEED * (0.5 + this.random());
    return {
      x: center[0] + direction[0] * radius * 0.9,
      y: center[1] + direction[1] * radius * 0.9,
      z: center[2] + direction[2] * radius * 0.9,
      vx: direction[0] * speed,
      vy: direction[1] * speed,
      vz: direction[2] * speed,
      age: 0,
      life: MIN_LIFE_SECONDS + (MAX_LIFE_SECONDS - MIN_LIFE_SECONDS) * this.random(),
      seed: this.random(),
    };
  }

  private random(): number {
    this.randomState = (this.randomState + 0x6d2b79f5) | 0;
    let t = this.randomState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
