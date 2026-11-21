import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from './math';

/**
 * 구 표면을 따라 닫힌 고리를 이루는 스플라인 경로와 그 위에 까는 선로의 모양.
 * three.js를 쓰지 않는 값과 계산만 둔다. 지오메트리는 `renderer.ts`가 `trackMesh`의 배열로 만든다.
 */

/** 선로의 치수. 높이는 표면에서 잰다. */
export const TRACK_SHAPE = {
  /** 두 레일 중심 사이의 거리 */
  gauge: 0.9,
  /** 레일의 폭과 높이 */
  railWidth: 0.09,
  railHeight: 0.1,
  /** 침목의 길이(선로를 가로지르는 방향), 폭, 두께와 간격 */
  sleeperLength: 1.35,
  sleeperWidth: 0.28,
  sleeperHeight: 0.08,
  sleeperSpacing: 0.6,
  /** 행성이 둥글어 침목 끝이 뜨지 않도록 표면 아래로 묻는 깊이 */
  sink: 0.03,
  /** 레일을 나누는 간격. 짧을수록 굽은 곳이 매끄럽다. */
  railStep: 0.2,
  /** 레일 색과 침목 색 (선형 RGB) */
  railColor: [0.32, 0.32, 0.34] as Vec3,
  railRoughness: 0.35,
  railMetallic: 0.7,
  sleeperColor: [0.16, 0.09, 0.05] as Vec3,
  sleeperRoughness: 0.9,
};

/** 레일 윗면의 높이 (표면 기준) */
export const RAIL_TOP = TRACK_SHAPE.sleeperHeight - TRACK_SHAPE.sink + TRACK_SHAPE.railHeight;

/** 경로 위 한 점의 위치와 방향. 세 축은 정규직교이고 `right = forward × up`이다. */
export interface TrackFrame {
  /** 표면 위의 점 */
  position: Vec3;
  /** 진행 방향 (표면 접선) */
  forward: Vec3;
  /** 표면 바깥 방향 */
  up: Vec3;
  /** 진행 방향의 오른쪽 */
  right: Vec3;
}

/** 균일 Catmull-Rom. `t`는 p1(0)에서 p2(1)까지다. */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const c0 = -0.5 * t3 + t2 - 0.5 * t;
  const c1 = 1.5 * t3 - 2.5 * t2 + 1;
  const c2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
  const c3 = 0.5 * t3 - 0.5 * t2;
  return [0, 1, 2].map((i) => c0 * p0[i] + c1 * p1[i] + c2 * p2[i] + c3 * p3[i]) as unknown as Vec3;
}

/**
 * 구 표면의 닫힌 스플라인 경로. 조절점을 지나는 Catmull-Rom 곡선을 구 표면으로 투영하고,
 * 촘촘히 나눈 점의 누적 길이로 호 길이 매개변수화한다. 거리는 길이로 나눈 나머지를 쓰므로 끝없이 돈다.
 */
export class SphereTrackPath {
  /** 고리 한 바퀴의 길이 */
  readonly length: number;
  private readonly points: Vec3[] = [];
  private readonly distances: number[] = [];

  /**
   * @param controls 구 중심에서 조절점을 향하는 방향. 순서대로 잇고 마지막은 첫째로 돌아온다. 4개 이상이어야 한다.
   * @param samplesPerSegment 조절점 사이를 나누는 수
   */
  constructor(
    controls: readonly Vec3[],
    readonly center: Vec3,
    readonly radius: number,
    samplesPerSegment = 48,
  ) {
    if (controls.length < 4) throw new Error('스플라인 조절점은 4개 이상이어야 한다');
    const n = controls.length;
    const at = (i: number): Vec3 => scale(normalize(controls[((i % n) + n) % n]), radius);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < samplesPerSegment; k++) {
        const p = catmullRom(at(i - 1), at(i), at(i + 1), at(i + 2), k / samplesPerSegment);
        this.points.push(add(center, scale(normalize(p), radius)));
      }
    }
    let total = 0;
    for (let i = 0; i < this.points.length; i++) {
      this.distances.push(total);
      total += length(sub(this.points[(i + 1) % this.points.length], this.points[i]));
    }
    this.length = total;
  }

  /** 거리를 [0, length)로 접는다. */
  wrap(distance: number): number {
    const d = distance % this.length;
    return d < 0 ? d + this.length : d;
  }

  /** 경로 시작에서 `distance`만큼 간 표면 위의 점 */
  point(distance: number): Vec3 {
    const d = this.wrap(distance);
    // 누적 거리에서 이분 탐색
    let lo = 0;
    let hi = this.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.distances[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    const a = this.points[lo];
    const b = this.points[(lo + 1) % this.points.length];
    const next = lo + 1 < this.points.length ? this.distances[lo + 1] : this.length;
    const t = (d - this.distances[lo]) / (next - this.distances[lo]);
    const p = add(a, scale(sub(b, a), t));
    return add(this.center, scale(normalize(sub(p, this.center)), this.radius));
  }

  /**
   * `distance` 자리의 방향. 진행 방향은 앞뒤로 `span`/2씩 떨어진 두 점을 잇는 현이다.
   * 차량처럼 길이가 있는 물체를 놓을 때 `span`을 그 길이로 주면 양 끝이 경로 위에 놓인다.
   */
  frame(distance: number, span = 0.1): TrackFrame {
    const front = this.point(distance + span / 2);
    const back = this.point(distance - span / 2);
    const mid = scale(add(front, back), 0.5);
    const up = normalize(sub(mid, this.center));
    const position = add(this.center, scale(up, this.radius));
    const chord = sub(front, back);
    const forward = normalize(sub(chord, scale(up, dot(chord, up))));
    return { position, forward, up, right: cross(forward, up) };
  }

  /** 경로를 `spacing` 간격(마지막 간격은 조금 다를 수 있다)으로 나눈 자리들 */
  frames(spacing: number): TrackFrame[] {
    const count = Math.max(4, Math.round(this.length / spacing));
    return Array.from({ length: count }, (_, i) => this.frame((i * this.length) / count));
  }

  /** 점에서 경로까지의 가장 가까운 거리 (나눈 점 기준 근사) */
  distanceTo(p: Vec3): number {
    let best = Infinity;
    for (const q of this.points) best = Math.min(best, length(sub(p, q)));
    return best;
  }
}

/** 삼각형 목록 지오메트리의 정점 배열. 면마다 정점을 따로 두어 법선이 면을 따른다. */
export interface TriangleMesh {
  positions: Float32Array;
  normals: Float32Array;
}

class MeshBuilder {
  private readonly p: number[] = [];
  private readonly n: number[] = [];

  /** 바깥에서 볼 때 반시계 방향인 사각형 a-b-c-d */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3): void {
    for (const v of [a, b, c, a, c, d]) {
      this.p.push(...v);
      this.n.push(...normal);
    }
  }

  /** 중심과 반폭을 곱한 세 축(x × y = z인 오른손 기저)으로 정한 상자 */
  box(center: Vec3, x: Vec3, y: Vec3, z: Vec3): void {
    // u × v = axis인 순서라 +axis 면은 (u, v) 순서로 돌면 바깥에서 반시계다.
    for (const [axis, u, v] of [
      [x, y, z],
      [y, z, x],
      [z, x, y],
    ] as const) {
      for (const sign of [1, -1]) {
        const c = add(center, scale(axis, sign));
        const p = (a: number, b: number): Vec3 => add(c, add(scale(u, a), scale(v, b)));
        const normal = normalize(scale(axis, sign));
        if (sign > 0) this.quad(p(-1, -1), p(1, -1), p(1, 1), p(-1, 1), normal);
        else this.quad(p(-1, -1), p(-1, 1), p(1, 1), p(1, -1), normal);
      }
    }
  }

  build(): TriangleMesh {
    return { positions: new Float32Array(this.p), normals: new Float32Array(this.n) };
  }
}

/** 선로의 레일 두 줄과 침목. 월드 좌표라 단위 모델 행렬로 그린다. */
export function trackMesh(path: SphereTrackPath): { rails: TriangleMesh; sleepers: TriangleMesh } {
  const s = TRACK_SHAPE;
  const base = s.sleeperHeight - s.sink;

  const rails = new MeshBuilder();
  const frames = path.frames(s.railStep);
  const half = s.railWidth / 2;
  for (const side of [-1, 1]) {
    const edge = (f: TrackFrame, across: number, height: number): Vec3 =>
      add(f.position, add(scale(f.right, side * (s.gauge / 2) + across), scale(f.up, height)));
    for (let i = 0; i < frames.length; i++) {
      const a = frames[i];
      const b = frames[(i + 1) % frames.length];
      const up = normalize(add(a.up, b.up));
      const right = normalize(add(a.right, b.right));
      // 윗면, 오른쪽 옆면, 왼쪽 옆면. a → b가 진행 방향(forward)이다.
      rails.quad(edge(a, -half, RAIL_TOP), edge(a, half, RAIL_TOP), edge(b, half, RAIL_TOP), edge(b, -half, RAIL_TOP), up);
      rails.quad(edge(a, half, RAIL_TOP), edge(a, half, base), edge(b, half, base), edge(b, half, RAIL_TOP), right);
      rails.quad(edge(a, -half, base), edge(a, -half, RAIL_TOP), edge(b, -half, RAIL_TOP), edge(b, -half, base), scale(right, -1));
    }
  }

  const sleepers = new MeshBuilder();
  for (const f of path.frames(s.sleeperSpacing)) {
    const center = add(f.position, scale(f.up, (base - s.sink) / 2));
    const thickness = (base + s.sink) / 2;
    // (right, up, -forward)가 오른손 기저다.
    sleepers.box(center, scale(f.right, s.sleeperLength / 2), scale(f.up, thickness), scale(f.forward, -s.sleeperWidth / 2));
  }
  return { rails: rails.build(), sleepers: sleepers.build() };
}
