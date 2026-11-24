import { add, cross, dot, mat4FromBasis, normalize, scale, type Mat4, type Vec3 } from '../../../engine/math';
import type { Billboard } from '../../../engine/render/billboard';
import { SIGNAL_ARC, signalArcFrame } from '../shapes/signalArc';
import { sunBillboardBasis, type BillboardView } from './sunFace';
import type { MeshKind } from '../../../engine/frame';
import { SATELLITE_DISH } from '../shapes/satelliteShape';

/**
 * 행성 둘레를 도는 인공위성. 몸통, 아래(행성 쪽)를 보는 접시 안테나, 위로 솟은 안테나 막대,
 * 양옆으로 펼친 태양 전지판 두 장으로 이루어진다. 전지판은 붐을 축으로 돌아 해를 향한다.
 * 충돌은 없다. 카메라가 닿는 높이(약 29)와 비눗방울 띠(방울 포함 약 46까지), 위성(40)보다 바깥, 해(70)보다 안쪽을 돈다.
 */
export const SATELLITE = {
  /** 행성 중심에서 궤도까지의 거리 */
  orbitRadius: 57,
  /** 한 바퀴 도는 데 걸리는 시간 (초) */
  periodSeconds: 36,
  /** 시작할 때 인공위성이 있는 방향. 시작 시점의 앞쪽 하늘이다. */
  start: normalize([0.15, 0.45, -0.88]),
  /** 궤도면을 정하는, 시작 방향에서 나아가는 쪽. 시작 방향과 나란하지 않아야 한다. */
  toward: normalize([0.6, 1, 0.3]),
  /** 아래 부품 치수의 단위 길이 (월드). 전지판 끝에서 끝까지 약 15.2단위다. */
  scale: 1.05,
  /** 몸통 상자 크기 */
  body: [1.6, 1.8, 1.6] as Vec3,
  /** 붐이 몸통에서 뻗는 길이와 전지판 크기 */
  boomLength: 0.8,
  panel: { length: 6, width: 2.2, cellsAlong: 4, cellsAcross: 2, gap: 0.1 },
  /** 접시 안테나의 반지름과 몸통 중심에서 접시 가운데까지의 거리 (아래쪽) */
  dishRadius: 1.15,
  dishOffset: 1.2,
  /** 안테나 막대의 길이 */
  mastLength: 1.5,
  /**
   * 접시 안테나에서 행성 쪽으로 퍼져 나가는 신호 물결. 물결은 접시 초점에서 나와 `interval`초마다 하나씩 생기고,
   * `lifetime`초 동안 반지름이 `startRadius`에서 `endRadius`(월드)까지 넓어지며 가늘어지고 흐려진다.
   */
  signal: {
    interval: 0.3,
    lifetime: 3,
    startRadius: 0.4,
    endRadius: 10,
    /** 선형 RGB. 톤 매핑을 거쳐 옅은 하늘색으로 보인다. */
    color: [0.55, 1.3, 2.2] as Vec3,
    /** 화면에서 본 신호 방향의 길이(0~1)가 이 범위보다 짧으면, 곧 정면이나 뒤에서 보면 흐리게 감춘다. */
    fadeProjection: [0.15, 0.45] as [number, number],
  },
};

/** 궤적 고리의 색 (선형 RGB). 해 궤적(주황)과 구별되는 옅은 하늘색이다. */
export const SATELLITE_ORBIT_EMISSIVE: Vec3 = [0.06, 0.2, 0.38];

const SILVER: Vec3 = [0.72, 0.73, 0.76];
const GOLD: Vec3 = [0.85, 0.58, 0.16];
const PANEL_FRAME: Vec3 = [0.82, 0.83, 0.86];
const PANEL_CELL: Vec3 = [0.04, 0.1, 0.42];
const DISH: Vec3 = [0.88, 0.89, 0.91];

/** 인공위성 부품 하나. 모델 행렬은 월드 기준이다. */
export interface SatellitePart {
  mesh: MeshKind;
  model: Mat4;
  color: Vec3;
  roughness: number;
  metallic: number;
}

/** 인공위성 몸에 붙은 축. x는 궤도면 법선(전지판이 뻗는 쪽), y는 행성 바깥, z는 나아가는 쪽이다. */
interface Frame {
  center: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

export class Satellite {
  readonly start: Vec3;
  /** 궤도면 안에서 `start`와 직교하고, 인공위성이 나아가는 쪽의 방향 */
  readonly ahead: Vec3;
  /** 궤도면의 법선. `start`, `ahead`와 함께 오른손 좌표계를 이룬다. */
  readonly axis: Vec3;
  private angle = 0;
  private previousAngle = 0;
  /** 신호 물결에 쓰는 흐른 시간 (초) */
  private time = 0;
  private previousTime = 0;

  constructor() {
    this.start = SATELLITE.start;
    this.axis = normalize(cross(this.start, SATELLITE.toward));
    this.ahead = cross(this.axis, this.start);
  }

  step(dt: number): void {
    this.previousTime = this.time;
    this.time += dt;
    this.previousAngle = this.angle;
    this.angle = (this.angle + (2 * Math.PI * dt) / SATELLITE.periodSeconds) % (2 * Math.PI);
    if (this.angle < this.previousAngle) this.previousAngle -= 2 * Math.PI;
  }

  /** 행성 중심에서 인공위성을 향하는 단위 벡터 */
  direction(alpha = 1): Vec3 {
    const angle = this.previousAngle + (this.angle - this.previousAngle) * alpha;
    return normalize(add(scale(this.start, Math.cos(angle)), scale(this.ahead, Math.sin(angle))));
  }

  /** 인공위성 몸통의 중심 */
  position(alpha = 1): Vec3 {
    return scale(this.direction(alpha), SATELLITE.orbitRadius);
  }

  /** 궤적 고리(`ring`)의 모델 행렬. 고리의 XY 평면을 궤도면에 맞추고 궤도 반지름만큼 키운다. */
  orbitModel(): Mat4 {
    const r = SATELLITE.orbitRadius;
    return mat4FromBasis([0, 0, 0], scale(this.start, r), scale(this.ahead, r), scale(this.axis, r));
  }

  /** 접시 초점, 곧 신호 물결이 나오는 점 (월드) */
  signalSource(alpha = 1): Vec3 {
    const focusY = -SATELLITE.dishOffset - SATELLITE.dishRadius / (4 * SATELLITE_DISH.depth);
    return scale(this.direction(alpha), SATELLITE.orbitRadius + focusY * SATELLITE.scale);
  }

  /**
   * 신호 물결 빌보드. 늘 카메라를 보는 평면이므로, 호가 화면에서 행성 쪽(접시가 보는 쪽)을 향하도록 돌린다.
   * 빌보드 가운데가 물결이 나오는 점이고, 크기가 커지면 호가 그 점에서 멀어진다 (`signalArc.ts`).
   */
  signalBillboards(alpha: number, view: BillboardView): Billboard[] {
    const { interval, lifetime, startRadius, endRadius, color, fadeProjection } = SATELLITE.signal;
    const source = this.signalSource(alpha);
    const toward = scale(this.direction(alpha), -1);
    const basis = sunBillboardBasis(source, view);
    const u = dot(toward, basis.x);
    const v = dot(toward, basis.y);
    // 빌보드의 +Y(호가 볼록한 쪽)를 화면 위 (u, v)로 돌린다. 반시계 θ만큼 돌리면 +Y가 (-sinθ, cosθ)가 된다.
    const rotation = Math.atan2(-u, v);
    const [f0, f1] = fadeProjection;
    const facing = Math.min(1, Math.max(0, (Math.hypot(u, v) - f0) / (f1 - f0)));
    if (facing <= 0) return [];

    const t = this.previousTime + (this.time - this.previousTime) * alpha;
    const waves: Billboard[] = [];
    // 가장 최근에 생긴 물결부터 수명 안의 것만 그린다.
    for (let born = Math.floor(t / interval) * interval; born > t - lifetime; born -= interval) {
      if (born < 0) break;
      const progress = (t - born) / lifetime;
      const radius = startRadius + (endRadius - startRadius) * progress;
      const size = (2 * radius) / SIGNAL_ARC.radius;
      const opacity = Math.min(1, progress / 0.08) * (1 - progress) ** 0.7 * facing;
      waves.push({
        image: 'signalArc',
        frame: signalArcFrame(progress),
        position: source,
        size: [size, size],
        rotation,
        color,
        toneMapped: true,
        opacity,
      });
    }
    return waves;
  }

  /**
   * 그릴 부품. `sunDirection`은 행성 중심에서 해를 향하는 단위 벡터이고, 전지판이 그쪽으로 돈다.
   */
  parts(alpha: number, sunDirection: Vec3): SatellitePart[] {
    const y = this.direction(alpha);
    const x = this.axis;
    const frame: Frame = { center: scale(y, SATELLITE.orbitRadius), x, y, z: cross(x, y) };
    const s = SATELLITE.scale;
    const [bx, by, bz] = SATELLITE.body;
    const parts: SatellitePart[] = [];
    const push = (mesh: MeshKind, model: Mat4, color: Vec3, roughness: number, metallic = 0) =>
      parts.push({ mesh, model, color, roughness, metallic });

    // 몸통과 금색 단열재 띠
    push('box', place(frame, [0, 0, 0], [[bx, 0, 0], [0, by, 0], [0, 0, bz]], s), SILVER, 0.35, 0.6);
    push('box', place(frame, [0, by * 0.12, 0], [[bx * 1.05, 0, 0], [0, by * 0.3, 0], [0, 0, bz * 1.05]], s), GOLD, 0.3, 0.7);

    // 접시 안테나: 오목한 쪽이 행성을 본다. 받침대, 초점의 수신기, 수신기를 잡는 지지대 셋.
    const dishR = SATELLITE.dishRadius;
    const dishY = -SATELLITE.dishOffset;
    push('satelliteDish', place(frame, [0, dishY, 0], [[dishR, 0, 0], [0, dishR, 0], [0, 0, dishR]], s), DISH, 0.4, 0.3);
    push('cylinder', rod(frame, [0, -by / 2, 0], [0, dishY + SATELLITE_DISH.thickness * dishR, 0], 0.35, s), SILVER, 0.4, 0.5);
    // 접시 y = -(depth / R)·r²의 초점 거리는 R / (4·depth)이다.
    const focusY = dishY - dishR / (4 * SATELLITE_DISH.depth);
    push('cylinder', rod(frame, [0, focusY - 0.15, 0], [0, focusY + 0.15, 0], 0.22, s), GOLD, 0.3, 0.7);
    const rimY = dishY - SATELLITE_DISH.depth * dishR;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const rim: Vec3 = [Math.cos(a) * dishR * 0.95, rimY, Math.sin(a) * dishR * 0.95];
      push('cylinder', rod(frame, rim, [0, focusY + 0.1, 0], 0.05, s), SILVER, 0.4, 0.5);
    }

    // 위로 솟은 안테나 막대와 끝의 작은 공
    const mastTop = by / 2 + SATELLITE.mastLength;
    push('cylinder', rod(frame, [0, by / 2, 0], [0, mastTop, 0], 0.07, s), SILVER, 0.4, 0.5);
    push('sphere', place(frame, [0, mastTop, 0], [[0.12, 0, 0], [0, 0.12, 0], [0, 0, 0.12]], s), GOLD, 0.3, 0.7);

    // 태양 전지판: 붐(x축)을 축으로 돌아 넓은 면이 해를 본다. 판은 앞뒤가 같아 반 바퀴 차이는 구별되지 않는다.
    const sun: Vec3 = [dot(sunDirection, frame.x), dot(sunDirection, frame.y), dot(sunDirection, frame.z)];
    const tilt = Math.atan2(sun[2], sun[1]);
    const { length, width, cellsAlong, cellsAcross, gap } = SATELLITE.panel;
    const cellLength = (length - gap * (cellsAlong + 1)) / cellsAlong;
    const cellWidth = (width - gap * (cellsAcross + 1)) / cellsAcross;
    for (const side of [-1, 1]) {
      const root = side * (bx / 2);
      const tip = side * (bx / 2 + SATELLITE.boomLength);
      push('cylinder', rod(frame, [root, 0, 0], [tip, 0, 0], 0.14, s), SILVER, 0.4, 0.5);
      const mid = tip + (side * length) / 2;
      push('box', place(frame, rotateX([mid, 0, 0], tilt), panelAxes(tilt, length, 0.06, width), s), PANEL_FRAME, 0.4, 0.5);
      for (let i = 0; i < cellsAlong; i++) {
        for (let j = 0; j < cellsAcross; j++) {
          const cx = mid + (i - (cellsAlong - 1) / 2) * (cellLength + gap);
          const cz = (j - (cellsAcross - 1) / 2) * (cellWidth + gap);
          push('box', place(frame, rotateX([cx, 0, cz], tilt), panelAxes(tilt, cellLength, 0.1, cellWidth), s), PANEL_CELL, 0.25, 0.3);
        }
      }
    }
    return parts;
  }
}

/** 몸 축 기준 좌표를 x축 둘레로 `angle`만큼 돌린다. y가 (0, cos, sin)으로 간다. */
function rotateX([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x, y * c - z * s, y * s + z * c];
}

/** x축 둘레로 돌린 판의 세 축 (몸 축 기준, 길이 = 크기) */
function panelAxes(angle: number, sx: number, sy: number, sz: number): [Vec3, Vec3, Vec3] {
  return [
    [sx, 0, 0],
    scale(rotateX([0, 1, 0], angle), sy),
    scale(rotateX([0, 0, 1], angle), sz),
  ];
}

/** 몸 축 기준 좌표를 월드로 옮긴다. */
function toWorld(frame: Frame, [a, b, c]: Vec3): Vec3 {
  return add(add(scale(frame.x, a), scale(frame.y, b)), scale(frame.z, c));
}

/** 몸 축 기준 위치와 세 축(길이가 크기)으로 모델 행렬을 만든다. `s`는 단위 길이다. */
function place(frame: Frame, position: Vec3, axes: [Vec3, Vec3, Vec3], s: number): Mat4 {
  const [ax, ay, az] = axes.map((axis) => scale(toWorld(frame, axis), s));
  return mat4FromBasis(add(frame.center, scale(toWorld(frame, position), s)), ax, ay, az);
}

/** `from`에서 `to`까지 이어진 지름 `diameter`의 원기둥(`cylinder`, 축 Z) 모델 행렬 */
function rod(frame: Frame, from: Vec3, to: Vec3, diameter: number, s: number): Mat4 {
  const along: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(...along);
  const z = normalize(along);
  const helper: Vec3 = Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const x = normalize(cross(helper, z));
  const y = cross(z, x);
  const mid: Vec3 = scale(add(from, to), 0.5);
  return place(frame, mid, [scale(x, diameter), scale(y, diameter), scale(z, len)], s);
}
