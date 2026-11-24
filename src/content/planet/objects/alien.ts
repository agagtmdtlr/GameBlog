import { ALIEN_SHAPE, sphereDirection, tentacleBoneSpacing } from '../shapes/alienShape';
import type { MeshKind } from '../../../engine/frame';
import {
  add,
  cross,
  dot,
  length,
  lerp,
  mat4FromBasis,
  mat4FromTRS,
  mat4Identity,
  mat4Multiply,
  normalize,
  quatFromAxisAngle,
  quatFromUnitVectors,
  quatMultiply,
  quatRotateVec3,
  scale,
  sub,
  QUAT_IDENTITY,
  type Mat4,
  type Quat,
  type Vec3,
} from '../../../engine/math';
import type { Ground, Obstacle } from '../../../engine/physics/collision';
import { Wanderer, type Random } from '../../common/character/npc';
import { PLAYER_RADIUS } from '../../common/character/player';

/**
 * 행성 위를 둥둥 떠다니는 문어 꼴 외계인. 챙 달린 반구 머리에 눈가리개를 쓰고, 더듬이 둘, 아래로 늘어진 다리 넷,
 * 말린 팔 하나, 광선총을 든 팔 하나가 있다. 모양 값은 `engine/alienShape.ts`에 있다.
 *
 * 돌아다니는 행동과 물리는 NPC와 같은 `Wanderer`를 쓴다. 걷는 다리 대신 촉수가 흔들리며, 몸은 땅 위에 떠서 오르내린다.
 */
export const ALIEN = {
  /** 머리 반구 반지름(모양 단위 1)의 월드 크기 */
  scale: 1.1,
  /** 물리 몸 중심에서 챙 바닥까지 올리는 높이. 다리 끝이 땅에 살짝 닿지 않게 둔다. */
  hover: 0.55,
  /** 위아래로 둥실거리는 폭과 빠르기 (라디안/초) */
  bobAmplitude: 0.1,
  bobRate: 1.7,
  /** 이 속도(NPC 최고 속도 언저리)에서 다리가 가장 많이 뒤로 끌린다. */
  dragSpeed: 3.4,
};

/** 선형 RGB. 그림의 민트색 몸, 파란 눈가리개, 보라 틈, 노란 더듬이 끝과 총 */
export const ALIEN_COLORS = {
  body: [0.15, 0.552, 0.434] as Vec3,
  visor: [0.023, 0.346, 0.672] as Vec3,
  slit: [0.33, 0.078, 0.352] as Vec3,
  antennaStalk: [0.024, 0.016, 0.014] as Vec3,
  yellow: [0.913, 0.632, 0.021] as Vec3,
};
export const ALIEN_ROUGHNESS = 0.5;

/** 그리기 한 덩이. `World`가 재질을 입혀 그리기 항목으로 바꾼다. */
export interface AlienPart {
  mesh: MeshKind;
  model: Mat4;
  color: Vec3;
  /** 촉수 스킨 메시의 뼈 행렬 (`tentacle` 메시) */
  skin?: Mat4[];
}

type Bend = (time: number, drag: number, joint: number) => [side: number, pitch: number];

interface TentacleSpec {
  /** 챙 아래 뿌리 자리 (모양 단위) */
  root: Vec3;
  /** 마디마다 굽는 각도. side는 +X 쪽으로, pitch는 양수면 뒤(-Z)로 굽는다. */
  bend: Bend;
}

const sway = (phase: number, amount = 1): Bend => (time, drag, j) => [
  amount * 0.1 * Math.sin(1.7 * time + phase * 1.3 + j * 0.9),
  drag * 0.28 + amount * 0.12 * Math.sin(2.1 * time + phase + j * 0.9),
];

/** 아래로 늘어진 다리 넷 */
const LEGS: TentacleSpec[] = [
  { root: [-0.4, 0, 0.08], bend: (t, d, j) => add2(sway(0)(t, d, j), j === 0 ? [-0.22, 0] : [0, 0]) },
  { root: [-0.14, 0, -0.06], bend: (t, d, j) => add2(sway(1.7)(t, d, j), j === 0 ? [-0.07, 0] : [0, 0]) },
  { root: [0.14, 0, -0.06], bend: (t, d, j) => add2(sway(3.1)(t, d, j), j === 0 ? [0.07, 0] : [0, 0]) },
  { root: [0.4, 0, 0.08], bend: (t, d, j) => add2(sway(4.6)(t, d, j), j === 0 ? [0.22, 0] : [0, 0]) },
];

/** -X 쪽 팔: 옆으로 뻗었다가 끝이 위로 말려 올라간다. */
const CURLED_ARM: TentacleSpec = {
  root: [-0.66, 0, 0.12],
  bend: (t, d, j) => {
    const curl = [-1.15, -0.35, -0.6, -0.5, -0.45][j];
    return [curl + 0.08 * Math.sin(1.9 * t + j * 0.8), d * 0.1 + 0.08 * Math.sin(1.3 * t + j)];
  },
};

/** +X 쪽 팔: 옆으로 뻗었다가 앞쪽 위로 들어 광선총을 쥔다. */
const GUN_ARM: TentacleSpec = {
  root: [0.66, 0, 0.12],
  bend: (t, _d, j) => {
    const [side, pitch] = [
      [1.05, 0],
      [0.35, -0.25],
      [0.25, -0.35],
      [0.1, -0.3],
      [0, -0.15],
    ][j];
    return [side, pitch + 0.04 * Math.sin(1.5 * t + j * 0.7)];
  },
};

function add2(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]];
}

/** 광선총의 부품 (총 기준 좌표, 모양 단위). 총은 손끝에 붙고 외계인의 앞(+Z)을 겨눈다. */
const GUN_PARTS: { mesh: MeshKind; center: Vec3; size: Vec3; color: keyof typeof ALIEN_COLORS }[] = [
  { mesh: 'box', center: [0, -0.05, 0.02], size: [0.14, 0.32, 0.16], color: 'yellow' },
  { mesh: 'cylinder', center: [0, 0.16, 0.16], size: [0.3, 0.3, 0.5], color: 'yellow' },
  { mesh: 'sphere', center: [0, 0.16, 0.43], size: [0.13, 0.13, 0.2], color: 'visor' },
  { mesh: 'sphere', center: [0.15, 0.17, 0.12], size: [0.055, 0.055, 0.055], color: 'slit' },
];

/** 몸 기준 좌표계의 마디 하나 (위치와 방향) */
interface Joint {
  origin: Vec3;
  rotation: Quat;
}

const X_AXIS: Vec3 = [1, 0, 0];
const Z_AXIS: Vec3 = [0, 0, 1];

/** 뿌리부터 마디마다 굽혀 촉수 뼈의 자리를 구한다. 마지막 원소는 촉수 끝이다. */
export function tentacleJoints(spec: TentacleSpec, time: number, drag: number): Joint[] {
  const spacing = tentacleBoneSpacing();
  const joints: Joint[] = [];
  let origin = spec.root;
  let rotation: Quat = QUAT_IDENTITY;
  for (let j = 0; j < ALIEN_SHAPE.tentacle.bones; j++) {
    const [side, pitch] = spec.bend(time, drag, j);
    // 옆으로 굽힘(Z축)과 뒤로 굽힘(X축). -Y로 뻗은 관이 Z축 양의 회전이면 +X 쪽으로 간다.
    rotation = quatMultiply(rotation, quatMultiply(quatFromAxisAngle(Z_AXIS, side), quatFromAxisAngle(X_AXIS, pitch)));
    joints.push({ origin, rotation });
    origin = add(origin, quatRotateVec3(rotation, [0, -spacing, 0]));
  }
  joints.push({ origin, rotation });
  return joints;
}

/** 몸 기준 좌표를 월드로 옮기는 기저. X는 외계인의 왼쪽(마주 보면 오른쪽)이라 오른손 기저가 된다. */
interface Frame {
  origin: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

const toWorld = (f: Frame, p: Vec3): Vec3 =>
  add(f.origin, add(scale(f.x, p[0]), add(scale(f.y, p[1]), scale(f.z, p[2]))));
const dirToWorld = (f: Frame, d: Vec3): Vec3 => add(scale(f.x, d[0]), add(scale(f.y, d[1]), scale(f.z, d[2])));

/** 몸 기준의 자리·방향·크기를 월드 모델 행렬로 */
function localModel(f: Frame, center: Vec3, rotation: Quat, size: Vec3): Mat4 {
  const axis = (v: Vec3, s: number) => scale(dirToWorld(f, quatRotateVec3(rotation, v)), s);
  return mat4FromBasis(toWorld(f, center), axis([1, 0, 0], size[0]), axis([0, 1, 0], size[1]), axis([0, 0, 1], size[2]));
}

export class Alien {
  readonly wanderer: Wanderer;
  private time = 0;
  private previousTime = 0;

  constructor(spawn: Vec3, ground: Ground, random?: Random, timeOffset = 0) {
    this.wanderer = new Wanderer(spawn, ground, random);
    this.time = this.previousTime = timeOffset;
  }

  get body() {
    return this.wanderer.body;
  }

  move(dt: number, obstacles: readonly Obstacle[]): void {
    this.wanderer.move(dt, obstacles);
  }

  /** 진행 방향을 정하는 데만 걸음(`Walker`)을 쓴다. 다리는 그리지 않는다. */
  animate(dt: number): void {
    this.previousTime = this.time;
    this.time += dt;
    this.wanderer.animate(dt);
  }

  /** 몸 기준 좌표계. 원점은 챙 바닥 가운데이고 모양 단위 1이 `ALIEN.scale`이다. */
  frame(alpha: number): Frame {
    const body = this.body;
    const center = lerp(body.previousPosition, body.position, alpha);
    const up = normalize(center);
    const forward = this.wanderer.walker.pose(alpha).forward;
    const time = this.timeAt(alpha);
    const s = ALIEN.scale;
    const lift = ALIEN.hover + ALIEN.bobAmplitude * Math.sin(ALIEN.bobRate * time);
    return {
      origin: add(center, scale(up, lift)),
      x: scale(cross(up, forward), s),
      y: scale(up, s),
      z: scale(forward, s),
    };
  }

  /** 다리가 뒤로 끌리는 정도 (0~1). 수평 속도에 비례한다. */
  drag(): number {
    const { position, velocity } = this.body;
    const up = normalize(position);
    const horizontal = sub(velocity, scale(up, dot(velocity, up)));
    return Math.min(1, length(horizontal) / ALIEN.dragSpeed);
  }

  timeAt(alpha: number): number {
    return this.previousTime + (this.time - this.previousTime) * alpha;
  }

  /** 머리, 눈가리개, 틈, 더듬이, 촉수 여섯, 광선총 순서의 그리기 덩이 */
  parts(alpha: number): AlienPart[] {
    const f = this.frame(alpha);
    const time = this.timeAt(alpha);
    const drag = this.drag();
    const c = ALIEN_COLORS;
    const one: Vec3 = [1, 1, 1];
    const parts: AlienPart[] = [
      { mesh: 'alienHead', model: localModel(f, [0, 0, 0], QUAT_IDENTITY, one), color: c.body },
      { mesh: 'alienVisor', model: localModel(f, [0, 0, 0], QUAT_IDENTITY, one), color: c.visor },
      { mesh: 'alienSlit', model: localModel(f, [0, 0, 0], QUAT_IDENTITY, one), color: c.slit },
    ];

    ALIEN_SHAPE.antennae.forEach(({ azimuth, elevation, tilt }, i) => {
      const base = sphereDirection(azimuth, elevation);
      // 머리 바깥으로 기울어진 줄기. 끝이 살짝 흔들린다.
      const wobble = 0.08 * Math.sin(2.4 * time + i * 2);
      const outward = normalize([base[0], 0, base[2]]);
      const dir = normalize(add(scale([0, 1, 0], Math.cos(tilt + wobble)), scale(outward, Math.sin(tilt + wobble))));
      const L = ALIEN_SHAPE.antennaLength;
      const start = scale(base, ALIEN_SHAPE.domeRadius * 0.97);
      const mid = add(start, scale(dir, L / 2));
      const tip = add(start, scale(dir, L));
      const rotation = quatFromUnitVectors(Z_AXIS, dir);
      const t = ALIEN_SHAPE.antennaThickness;
      const b = ALIEN_SHAPE.antennaBall;
      parts.push(
        { mesh: 'cylinder', model: localModel(f, mid, rotation, [t, t, L]), color: c.antennaStalk },
        { mesh: 'sphere', model: localModel(f, tip, QUAT_IDENTITY, [b, b, b]), color: c.yellow },
      );
    });

    const spacing = tentacleBoneSpacing();
    for (const spec of [...LEGS, CURLED_ARM, GUN_ARM]) {
      const joints = tentacleJoints(spec, time, drag);
      const skin = joints.slice(0, -1).map((joint, i) =>
        mat4Multiply(localModel(f, joint.origin, joint.rotation, one), mat4FromTRS([0, i * spacing, 0], QUAT_IDENTITY, one)),
      );
      // 스키닝한 정점이 이미 월드 좌표라 모델 행렬은 단위 행렬이다.
      parts.push({ mesh: 'tentacle', model: mat4Identity(), color: c.body, skin });
      if (spec === GUN_ARM) {
        const hand = joints[joints.length - 1].origin;
        for (const gun of GUN_PARTS) {
          parts.push({ mesh: gun.mesh, model: localModel(f, add(hand, gun.center), QUAT_IDENTITY, gun.size), color: c[gun.color] });
        }
      }
    }
    return parts;
  }
}

/** 시작 위치: 몸 중심이 땅 위 `PLAYER_RADIUS`에 오는 자리 */
export const alienSpawn = (direction: Vec3, groundRadius: number): Vec3 => scale(direction, groundRadius + PLAYER_RADIUS);
