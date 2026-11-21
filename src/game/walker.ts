import {
  add,
  clamp,
  cross,
  dot,
  length,
  lerp,
  normalize,
  quatFromAxisAngle,
  quatRotateVec3,
  scale,
  sub,
  type Vec3,
} from '../engine/math';
import type { Sphere } from '../physics/collision';

/** 구체 몸의 반지름 */
export const BODY_RADIUS = 0.5;

/** 다리 뼈의 치수 */
export const LEG = {
  /** 엉덩이 관절에서 무릎까지 */
  thigh: 0.62,
  /** 무릎에서 발목까지 */
  shin: 1.06,
  /** 발바닥에서 발목까지 */
  ankleHeight: 0.12,
} as const;

/**
 * 다리 메시의 기본 자세. 오른쪽 다리가 서 있는 모습이며 엉덩이가 원점, +X가 몸 바깥, +Y가 위다 (glTF 좌표).
 * `tools/blender/build_character.py`의 REST_KNEE, REST_ANKLE과 같아야 한다.
 * 몸 높이(`PLAYER_RADIUS`)와 아래 엉덩이·발 위치로 서 있을 때 IK가 푸는 자세와 같다.
 */
export const LEG_REST = {
  knee: [0.566, 0.251, 0] as Vec3,
  ankle: [0.55, -0.81, 0] as Vec3,
} as const;

/** 몸 중심에서 엉덩이 관절까지의 옆 거리와 높이 */
const HIP_SIDE = 0.45;
const HIP_UP = 0.05;
/** 서 있을 때 몸 중심 아래 지점에서 발이 놓이는 옆 거리 */
const STANCE_SIDE = 1.0;
/** 무릎이 향하는 방향의 위쪽 성분 (옆쪽 성분은 1). 무릎이 바깥 위로 솟는다. */
const KNEE_POLE_UP = 2.0;
/** 진행 방향에서 발끝이 바깥으로 돌아간 각도 */
const TOE_OUT = (75 * Math.PI) / 180;

/** 발을 드는 최대 높이 */
const STEP_HEIGHT = 0.28;
/** 움직이는 중에 발이 목표에서 이만큼 벗어나면 내딛는다. */
const STEP_TRIGGER = 0.22;
/** 멈춘 뒤 자세를 정리할 때의 기준. 작을수록 정확히 제자리로 모은다. */
const SETTLE_TRIGGER = 0.05;
/** 이보다 느리면 멈춘 것으로 본다. */
const IDLE_SPEED = 0.4;
/** 한 걸음의 시간 = STRIDE_TIME / 속도. 빠를수록 잰걸음이 된다. */
const STRIDE_TIME = 0.5;
const MIN_STEP_SECONDS = 0.07;
const MAX_STEP_SECONDS = 0.16;
/** 한쪽 발이 이만큼 벗어나면 다른 발이 내딛는 중이어도 함께 내딛는다. */
const EMERGENCY_FACTOR = 2.5;

/** 몸이 진행 방향으로 도는 빠르기 */
const TURN_RATE = 12;
/** 이 시간보다 오래 땅에서 떨어져 있으면 공중 자세로 바꾼다. 튕길 때 발이 떨리지 않게 한다. */
const AIR_DELAY = 0.12;
/** 공중에서 발이 매달리는 위치 (몸 중심 기준 아래쪽 거리, 옆 거리 비율) */
const AIR_HANG_DOWN = 0.75;
const AIR_HANG_SIDE = 0.8;
const AIR_FOLLOW_RATE = 14;
/** 발을 들 때 몸이 따라 올라가는 정도 */
const BODY_BOB = 0.04;

export type Side = -1 | 1;

interface Foot {
  readonly side: Side;
  /** 발바닥 중심. 땅에 있으면 행성 표면 위의 점이다. */
  position: Vec3;
  previousPosition: Vec3;
  /** 걸음의 시작점 (표면 위) */
  from: Vec3;
  stepping: boolean;
  /** 걸음 진행도 0~1 */
  progress: number;
  duration: number;
}

/** 그리기에 쓰는 한 순간의 자세 */
export interface WalkerPose {
  body: Vec3;
  /** 몸이 바라보는 방향. 몸 위치의 표면 접평면에 있다. */
  forward: Vec3;
  /** [왼발, 오른발]의 발바닥 중심 */
  feet: readonly [Vec3, Vec3];
}

/** 다리 뼈 하나의 원점과 정규직교 축 */
export interface BoneTransform {
  bone: 'thigh' | 'shin' | 'foot';
  origin: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

/** 물리 몸체에서 걸음에 필요한 값 */
export interface WalkerBody {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly grounded: boolean;
}

/**
 * 구체 몸과 두 발의 절차적 걸음. 물리는 `Player`가 맡고, 이 클래스는 그 결과를 보고
 * 발을 언제 어디로 내디딜지 정한다. 다리 관절은 그릴 때 `solveLegs`로 푼다.
 */
export class Walker {
  forward: Vec3;
  previousForward: Vec3;
  body: Vec3;
  previousBody: Vec3;
  private readonly feet: [Foot, Foot];
  private airTime = 0;

  constructor(
    position: Vec3,
    private readonly ground: Sphere,
    forward: Vec3 = [0, 0, -1],
  ) {
    const up = this.upAt(position);
    this.forward = tangentDirection(forward, up);
    this.previousForward = this.forward;
    this.body = position;
    this.previousBody = position;
    const foot = (side: Side): Foot => {
      const rest = this.restPoint(position, side);
      return { side, position: rest, previousPosition: rest, from: rest, stepping: false, progress: 0, duration: 0 };
    };
    this.feet = [foot(-1), foot(1)];
  }

  /** 발이 땅을 딛고 있는지. 공중 자세면 false다. */
  get airborne(): boolean {
    return this.airTime > AIR_DELAY;
  }

  /** 내딛는 중인 발의 수 */
  get steppingCount(): number {
    return this.feet.filter((foot) => foot.stepping).length;
  }

  footPosition(side: Side): Vec3 {
    return this.feet[side < 0 ? 0 : 1].position;
  }

  step(dt: number, body: WalkerBody): void {
    this.previousBody = this.body;
    this.previousForward = this.forward;
    for (const foot of this.feet) foot.previousPosition = foot.position;

    const up = this.upAt(body.position);
    const horizontal = sub(body.velocity, scale(up, dot(body.velocity, up)));
    const speed = length(horizontal);
    this.turn(dt, up, horizontal, speed);

    const wasAirborne = this.airborne;
    this.airTime = body.grounded ? 0 : this.airTime + dt;
    if (this.airborne) {
      this.hangFeet(dt, body.position, up);
    } else {
      if (wasAirborne) this.land();
      this.walk(dt, body.position, horizontal, speed);
    }

    let lift = 0;
    for (const foot of this.feet) if (foot.stepping) lift += Math.sin(Math.PI * foot.progress);
    this.body = add(body.position, scale(up, BODY_BOB * Math.min(lift, 1)));
  }

  /** 렌더링 보간이 적용된 자세 */
  pose(alpha: number): WalkerPose {
    const body = lerp(this.previousBody, this.body, alpha);
    const forward = tangentDirection(lerp(this.previousForward, this.forward, alpha), this.upAt(body));
    const [left, right] = this.feet;
    return {
      body,
      forward,
      feet: [lerp(left.previousPosition, left.position, alpha), lerp(right.previousPosition, right.position, alpha)],
    };
  }

  /** 자세에서 다리마다 [허벅지, 정강이, 발] 뼈의 위치와 방향을 구한다. 왼다리가 먼저다. */
  solveLegs(pose: WalkerPose): BoneTransform[] {
    const up = this.upAt(pose.body);
    const right = cross(pose.forward, up);
    const bones: BoneTransform[] = [];
    for (let i = 0; i < 2; i++) {
      const side: Side = i === 0 ? -1 : 1;
      const sole = pose.feet[i];
      const footUp = this.upAt(sole);
      const hip = add(pose.body, add(scale(right, side * HIP_SIDE), scale(up, HIP_UP)));
      const pole = normalize(add(scale(right, side), scale(up, KNEE_POLE_UP)));
      const { knee, ankle } = solveTwoBone(hip, add(sole, scale(footUp, LEG.ankleHeight)), LEG.thigh, LEG.shin, pole);
      bones.push(segment('thigh', hip, knee, pole), segment('shin', knee, ankle, pole));

      const footForward = tangentDirection(pose.forward, footUp);
      const footRight = cross(footForward, footUp);
      const toe = normalize(add(scale(footForward, Math.cos(TOE_OUT)), scale(footRight, side * Math.sin(TOE_OUT))));
      bones.push({ bone: 'foot', origin: ankle, x: cross(footUp, toe), y: footUp, z: toe });
    }
    return bones;
  }

  private turn(dt: number, up: Vec3, horizontal: Vec3, speed: number): void {
    let forward = tangentDirection(this.forward, up);
    if (speed > IDLE_SPEED) {
      const desired = scale(horizontal, 1 / speed);
      const angle = Math.atan2(dot(cross(forward, desired), up), dot(forward, desired));
      const turn = angle * (1 - Math.exp(-TURN_RATE * dt));
      forward = tangentDirection(quatRotateVec3(quatFromAxisAngle(up, turn), forward), up);
    }
    this.forward = forward;
  }

  private walk(dt: number, position: Vec3, horizontal: Vec3, speed: number): void {
    const moving = speed > IDLE_SPEED;
    const duration = clamp(STRIDE_TIME / Math.max(speed, 1e-3), MIN_STEP_SECONDS, MAX_STEP_SECONDS);
    // 걷는 중에는 한 걸음 시간만큼 앞을 노려 발이 몸보다 늦지 않게 한다.
    const lead = moving ? scale(horizontal, duration) : ([0, 0, 0] as Vec3);
    const targets = this.feet.map((foot) => this.project(add(this.restPoint(position, foot.side), lead)));

    // 진행 중인 걸음을 이어간다. 목표가 움직이면 착지점도 따라간다.
    this.feet.forEach((foot, i) => {
      if (!foot.stepping) return;
      foot.progress = Math.min(1, foot.progress + dt / foot.duration);
      const t = smoothstep(foot.progress);
      const flat = this.project(lerp(foot.from, targets[i], t));
      foot.position = add(flat, scale(this.upAt(flat), STEP_HEIGHT * Math.sin(Math.PI * foot.progress)));
      if (foot.progress >= 1) {
        foot.stepping = false;
        foot.position = targets[i];
      }
    });

    // 목표에서 가장 많이 벗어난 발부터 내딛는다. 보통은 한 번에 한 발만 든다.
    const trigger = moving ? STEP_TRIGGER : SETTLE_TRIGGER;
    const order = [0, 1].sort(
      (a, b) => distance(this.feet[b].position, targets[b]) - distance(this.feet[a].position, targets[a]),
    );
    for (const i of order) {
      const foot = this.feet[i];
      if (foot.stepping) continue;
      const off = distance(foot.position, targets[i]);
      if (off < trigger) continue;
      const otherStepping = this.feet[1 - i].stepping;
      if (otherStepping && off < trigger * EMERGENCY_FACTOR) continue;
      foot.stepping = true;
      foot.progress = 0;
      foot.duration = moving ? duration : MAX_STEP_SECONDS;
      foot.from = foot.position;
    }
  }

  private hangFeet(dt: number, position: Vec3, up: Vec3): void {
    const right = cross(this.forward, up);
    const follow = 1 - Math.exp(-AIR_FOLLOW_RATE * dt);
    for (const foot of this.feet) {
      const hang = add(position, add(scale(right, foot.side * STANCE_SIDE * AIR_HANG_SIDE), scale(up, -AIR_HANG_DOWN)));
      foot.position = lerp(foot.position, hang, follow);
      foot.stepping = false;
    }
  }

  /** 착지하면 매달린 발을 걸음 중간에서 이어받아 땅으로 내린다. */
  private land(): void {
    for (const foot of this.feet) {
      foot.from = this.project(foot.position);
      foot.stepping = true;
      foot.progress = 0.5;
      foot.duration = MAX_STEP_SECONDS;
    }
  }

  /** 몸이 `position`에 있을 때 `side`쪽 발이 쉬는 표면 위의 점 */
  private restPoint(position: Vec3, side: Side): Vec3 {
    const up = this.upAt(position);
    const right = cross(tangentDirection(this.forward, up), up);
    return this.project(add(position, scale(right, side * STANCE_SIDE)));
  }

  private upAt(p: Vec3): Vec3 {
    return normalize(sub(p, this.ground.center));
  }

  /** 행성 표면으로 옮긴 점 */
  private project(p: Vec3): Vec3 {
    return add(this.ground.center, scale(this.upAt(p), this.ground.radius));
  }
}

/**
 * 길이가 l1, l2인 두 마디로 hip에서 target에 닿는 무릎 위치를 구한다.
 * 무릎은 pole 쪽으로 굽는다. 닿지 않으면 target 쪽으로 곧게 편다.
 */
export function solveTwoBone(
  hip: Vec3,
  target: Vec3,
  l1: number,
  l2: number,
  pole: Vec3,
): { knee: Vec3; ankle: Vec3 } {
  const toTarget = sub(target, hip);
  const reach = clamp(length(toTarget), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dir = length(toTarget) > 1e-6 ? normalize(toTarget) : normalize(scale(pole, -1));
  const bend = tangentDirection(pole, dir);
  // 코사인 법칙: 엉덩이에서 무릎을 내린 수선의 발까지 거리 a, 수선 길이 h
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  return { knee: add(hip, add(scale(dir, a), scale(bend, h))), ankle: add(hip, scale(dir, reach)) };
}

/**
 * 기본 자세(`LEG_REST`)의 뼈 [허벅지, 정강이, 발]. `solveLegs`와 같은 규약으로 놓으므로,
 * 지금 뼈 × 기본 자세 뼈의 역행렬이 다리 메시의 정점을 옮기는 스키닝 행렬이 된다.
 */
export function restBones(): BoneTransform[] {
  const hip: Vec3 = [0, 0, 0];
  const pole = normalize([1, KNEE_POLE_UP, 0]);
  const up: Vec3 = [0, 1, 0];
  const toe: Vec3 = [1, 0, 0];
  return [
    segment('thigh', hip, LEG_REST.knee, pole),
    segment('shin', LEG_REST.knee, LEG_REST.ankle, pole),
    { bone: 'foot', origin: LEG_REST.ankle, x: cross(up, toe), y: up, z: toe },
  ];
}

/** from에서 to로 뻗는 뼈. 뼈의 +Y가 뻗는 방향이고 +Z가 pole 쪽이다. */
function segment(bone: 'thigh' | 'shin', from: Vec3, to: Vec3, pole: Vec3): BoneTransform {
  const y = normalize(sub(to, from));
  const z = tangentDirection(pole, y);
  return { bone, origin: from, x: cross(y, z), y, z };
}

/** v에서 axis 성분을 빼고 정규화한다. */
function tangentDirection(v: Vec3, axis: Vec3): Vec3 {
  return normalize(sub(v, scale(axis, dot(v, axis))));
}

function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
