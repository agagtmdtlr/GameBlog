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
import { IDLE_CLIP, STEP_CLIP, WALK_CLIP } from './characterClips';
import { sampleClip } from './keyframes';

/**
 * 캐릭터 전체의 크기 배율. 아래 `LEG`, `LEG_REST`와 Blender 모델은 배율 1의 설계 치수이고,
 * 게임 안의 몸, 다리, 걸음, 물리 몸체(`PLAYER_RADIUS`)는 모두 이 배율을 곱해 쓴다.
 */
export const CHARACTER_SCALE = 1.5;
const S = CHARACTER_SCALE;

/** 구체 몸의 반지름 */
export const BODY_RADIUS = 0.5 * S;

/** 다리 뼈의 설계 치수 (배율 1) */
export const LEG = {
  /** 엉덩이 관절에서 무릎까지 */
  thigh: 0.781,
  /** 무릎에서 발목까지 */
  shin: 1.31,
  /** 발바닥에서 발목까지 */
  ankleHeight: 0.12,
} as const;

/**
 * 다리 메시의 기본 자세 (배율 1). 오른쪽 다리가 서 있는 모습이며 엉덩이가 원점, +X가 몸 바깥, +Y가 위다 (glTF 좌표).
 * `tools/blender/build_character.py`의 REST_KNEE, REST_ANKLE과 같아야 한다.
 * 몸 높이(`PLAYER_RADIUS`)와 아래 엉덩이·발 위치로 서 있을 때 IK가 푸는 자세와 같다.
 */
export const LEG_REST = {
  knee: [0.749, 0.22, 0] as Vec3,
  ankle: [0.72, -1.09, 0] as Vec3,
} as const;

/** 다리 뼈의 게임 안 치수 */
const THIGH = LEG.thigh * S;
const SHIN = LEG.shin * S;
const ANKLE_HEIGHT = LEG.ankleHeight * S;
/** 몸 중심에서 엉덩이 관절까지의 옆 거리와 높이. 다리가 몸 구의 바깥 위쪽(약 43°)에 붙는다. */
const HIP_SIDE = 0.35 * S;
const HIP_UP = 0.33 * S;
/** 서 있을 때 몸 중심 아래 지점에서 발이 놓이는 옆 거리 */
const STANCE_SIDE = 1.07 * S;
/** 무릎이 향하는 방향의 위쪽 성분 (옆쪽 성분은 1). 무릎이 바깥 위로 솟는다. */
const KNEE_POLE_UP = 2.0;
/** 진행 방향에서 발끝이 바깥으로 돌아간 각도 */
const TOE_OUT = (75 * Math.PI) / 180;

/** 발을 드는 최대 높이 */
const STEP_HEIGHT = 0.3 * S;
/** 이보다 느리면 멈춘 것으로 본다. */
const IDLE_SPEED = 0.4;
/** 걷기 한 주기(두 걸음)에 몸이 나아가는 거리 = STRIDE_BASE + STRIDE_PER_SPEED × 속도. 빠를수록 보폭이 길다. */
const STRIDE_BASE = 0.9 * S;
const STRIDE_PER_SPEED = 0.16 * S;
const MAX_STRIDE = 2.6 * S;
/** 한 주기에서 발이 땅을 딛고 있는 비율. 0.5보다 조금 커서 두 발이 잠깐 함께 딛는다. */
const DUTY = 0.55;
const MIN_STEP_SECONDS = 0.08;
const MAX_STEP_SECONDS = 0.4;
/** 멈춘 뒤 발을 제자리로 모으는 걸음 */
const SETTLE_TRIGGER = 0.05 * S;
const SETTLE_SECONDS = 0.22;
const SETTLE_LIFT = 0.5;
/** 딛고 있는 발이 쉬는 위치에서 이만큼 벗어나면 위상과 상관없이 바로 내딛는다 (급회전, 밀려남). */
const REACH_LIMIT = 1.5 * S;
const RECOVER_SECONDS = 0.14;

/** 걷기 클립의 진폭 (몸 높이, 옆, 앞, 엉덩이 기울기 라디안) */
const WALK_AMPLITUDE = { bob: 0.07 * S, sway: 0.08 * S, surge: 0.035 * S, roll: (7 * Math.PI) / 180 } as const;
/** 숨쉬기 클립의 진폭 */
const IDLE_AMPLITUDE = { bob: 0.045 * S, sway: 0.025 * S, roll: (2.5 * Math.PI) / 180 } as const;
/** 서기와 걷기 클립을 섞는 비율이 따라가는 빠르기 */
const BLEND_RATE = 7;

/** 몸이 진행 방향으로 도는 빠르기 */
const TURN_RATE = 12;
/** 이 시간보다 오래 땅에서 떨어져 있으면 공중 자세로 바꾼다. 튕길 때 발이 떨리지 않게 한다. */
const AIR_DELAY = 0.12;
/** 공중에서 발이 매달리는 위치 (몸 중심 기준 아래쪽 거리, 옆 거리 비율) */
const AIR_HANG_DOWN = 0.75 * S;
const AIR_HANG_SIDE = 0.8;
const AIR_FOLLOW_RATE = 14;

export type Side = -1 | 1;

interface Foot {
  readonly side: Side;
  /** 발바닥 중심. 땅에 있으면 행성 표면 위의 점이다. */
  position: Vec3;
  previousPosition: Vec3;
  /** 발이 향하는 진행 방향. 딛고 있는 동안에는 고정된다. */
  heading: Vec3;
  previousHeading: Vec3;
  /** 걸음의 시작점(표면 위)과 시작할 때의 방향 */
  from: Vec3;
  fromHeading: Vec3;
  stepping: boolean;
  /** 걸음 진행도 0~1 */
  progress: number;
  duration: number;
  /** 발 높이 배율 */
  lift: number;
  /** 이번 주기의 딛는 구간을 지나 다음 걸음을 시작할 수 있는지 */
  armed: boolean;
}

/** 그리기에 쓰는 한 순간의 자세 */
export interface WalkerPose {
  body: Vec3;
  /** 몸이 바라보는 방향. 몸 위치의 표면 접평면에 있다. */
  forward: Vec3;
  /** 엉덩이가 진행 방향 축으로 기운 각도(라디안). 양수면 오른쪽 엉덩이가 올라간다. */
  roll: number;
  /** [왼발, 오른발]의 발바닥 중심 */
  feet: readonly [Vec3, Vec3];
  /** [왼발, 오른발]이 향하는 방향 */
  footHeadings: readonly [Vec3, Vec3];
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
 * 구체 몸과 두 발의 걸음. 물리는 `Player`가 맡고, 이 클래스는 그 결과를 보고 키프레임 클립을 재생한다.
 *
 * - 서기(`IDLE_CLIP`): 시간으로 재생하는 숨쉬기. 발은 제자리에 둔다.
 * - 걷기(`WALK_CLIP`): 걸은 거리로 위상을 진행한다. 위상이 발을 들 때를 정하고, 몸은 걸음에 맞춰 오르내리고 흔들린다.
 * - 내딛기(`STEP_CLIP`): 발 하나의 궤적. 딛고 있는 발은 땅에 고정되어 몸이 그 위로 지나간다.
 *
 * 두 몸 클립은 속도에 따라 섞는다. 다리 관절은 그릴 때 `solveLegs`가 IK로 푼다.
 */
export class Walker {
  forward: Vec3;
  previousForward: Vec3;
  body: Vec3;
  previousBody: Vec3;
  roll = 0;
  previousRoll = 0;
  /** 걷기 클립을 섞는 비율 0~1 */
  walkWeight = 0;
  /** 걷기 위상 0~1. 0에서 왼발이, 0.5에서 오른발이 땅에 닿는다. */
  phase = 0;
  private readonly feet: [Foot, Foot];
  private airTime = 0;
  private idleTime = 0;
  private walking = false;

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
      return {
        side,
        position: rest,
        previousPosition: rest,
        heading: this.forward,
        previousHeading: this.forward,
        from: rest,
        fromHeading: this.forward,
        stepping: false,
        progress: 0,
        duration: 0,
        lift: 1,
        armed: false,
      };
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
    this.previousRoll = this.roll;
    for (const foot of this.feet) {
      foot.previousPosition = foot.position;
      foot.previousHeading = foot.heading;
    }

    const up = this.upAt(body.position);
    const horizontal = sub(body.velocity, scale(up, dot(body.velocity, up)));
    const speed = length(horizontal);
    this.turn(dt, up, horizontal, speed);

    const wasAirborne = this.airborne;
    this.airTime = body.grounded ? 0 : this.airTime + dt;
    const walking = !this.airborne && speed > IDLE_SPEED;
    if (this.airborne) {
      this.hangFeet(dt, body.position, up);
    } else {
      if (wasAirborne) this.land();
      if (walking && !this.walking) this.startWalking(body.position);
      this.advanceSteps(dt, body.position, horizontal, speed, walking);
    }
    this.walking = walking;

    this.idleTime += dt;
    this.walkWeight += ((walking ? 1 : 0) - this.walkWeight) * (1 - Math.exp(-BLEND_RATE * dt));
    this.animateBody(body.position, up);
  }

  /** 렌더링 보간이 적용된 자세 */
  pose(alpha: number): WalkerPose {
    const body = lerp(this.previousBody, this.body, alpha);
    const forward = tangentDirection(lerp(this.previousForward, this.forward, alpha), this.upAt(body));
    const [left, right] = this.feet;
    const heading = (foot: Foot) => normalize(lerp(foot.previousHeading, foot.heading, alpha));
    return {
      body,
      forward,
      roll: this.previousRoll + (this.roll - this.previousRoll) * alpha,
      feet: [lerp(left.previousPosition, left.position, alpha), lerp(right.previousPosition, right.position, alpha)],
      footHeadings: [heading(left), heading(right)],
    };
  }

  /** 자세에서 다리마다 [허벅지, 정강이, 발] 뼈의 위치와 방향을 구한다. 왼다리가 먼저다. */
  solveLegs(pose: WalkerPose): BoneTransform[] {
    const up = this.upAt(pose.body);
    const right = cross(pose.forward, up);
    // 엉덩이 기울기: 진행 방향 축으로 오른쪽 축과 위쪽 축을 돌린다.
    const hipRight = add(scale(right, Math.cos(pose.roll)), scale(up, Math.sin(pose.roll)));
    const hipUp = sub(scale(up, Math.cos(pose.roll)), scale(right, Math.sin(pose.roll)));
    const bones: BoneTransform[] = [];
    for (let i = 0; i < 2; i++) {
      const side: Side = i === 0 ? -1 : 1;
      const sole = pose.feet[i];
      const footUp = this.upAt(sole);
      const hip = add(pose.body, add(scale(hipRight, side * HIP_SIDE), scale(hipUp, HIP_UP)));
      const pole = normalize(add(scale(right, side), scale(up, KNEE_POLE_UP)));
      const { knee, ankle } = solveTwoBone(hip, add(sole, scale(footUp, ANKLE_HEIGHT)), THIGH, SHIN, pole);
      bones.push(segment('thigh', hip, knee, pole), segment('shin', knee, ankle, pole));

      const footForward = tangentDirection(pose.footHeadings[i], footUp);
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

  /** 걷기 시작: 들려 있거나 목표에서 더 먼 발이 바로 내딛도록 위상을 맞춘다. */
  private startWalking(position: Vec3): void {
    const [left, right] = this.feet;
    let leftFirst: boolean;
    if (left.stepping || right.stepping) {
      leftFirst = left.stepping;
    } else {
      const off = (foot: Foot) => distance(foot.position, this.restPoint(position, foot.side));
      leftFirst = off(left) >= off(right);
    }
    // 왼발의 드는 구간은 위상 DUTY에서, 오른발은 DUTY - 0.5에서 시작한다.
    const phase = leftFirst ? DUTY : DUTY - 0.5;
    this.phase = phase - Math.floor(phase);
    for (const foot of this.feet) foot.armed = !foot.stepping;
  }

  private advanceSteps(dt: number, position: Vec3, horizontal: Vec3, speed: number, walking: boolean): void {
    const stride = Math.min(STRIDE_BASE + STRIDE_PER_SPEED * speed, MAX_STRIDE);
    const heading = walking ? scale(horizontal, 1 / speed) : this.forward;
    if (walking) this.phase = (this.phase + (speed / stride) * dt) % 1;

    /** 걸음이 끝날 때 발이 닿을 곳. 걷는 중이면 그때의 몸 위치에서 반 보 앞이다. */
    const target = (foot: Foot): Vec3 => {
      if (!walking) return this.restPoint(position, foot.side);
      const remaining = foot.stepping ? (1 - foot.progress) * foot.duration : 0;
      const landing = add(position, scale(horizontal, remaining));
      return this.project(add(this.restPoint(landing, foot.side), scale(heading, (DUTY * stride) / 2)));
    };

    // 진행 중인 걸음을 클립대로 이어간다. 목표가 움직이면 착지점도 따라간다.
    for (const foot of this.feet) {
      if (!foot.stepping) continue;
      foot.progress = Math.min(1, foot.progress + dt / foot.duration);
      const goal = target(foot);
      const { travel, lift } = sampleClip(STEP_CLIP, foot.progress);
      const flat = this.project(lerp(foot.from, goal, travel));
      foot.position = add(flat, scale(this.upAt(flat), STEP_HEIGHT * foot.lift * Math.max(lift, 0)));
      foot.heading = tangentDirection(lerp(foot.fromHeading, heading, Math.min(travel, 1)), this.upAt(flat));
      if (foot.progress >= 1) {
        foot.stepping = false;
        foot.position = goal;
      }
    }

    // 딛고 있는 발은 땅에 고정한다. 언제 들지만 정한다.
    for (const foot of this.feet) {
      if (foot.stepping) continue;
      const other = this.feet[foot.side < 0 ? 1 : 0];
      const off = distance(foot.position, this.restPoint(position, foot.side));
      if (off > REACH_LIMIT) {
        this.beginStep(foot, RECOVER_SECONDS, 1);
      } else if (walking) {
        // 위상이 이 발의 드는 구간에 들어서면 내딛고, 그 구간이 끝날 때 디딘다.
        const footPhase = (this.phase + (foot.side < 0 ? 0 : 0.5)) % 1;
        if (footPhase < DUTY) {
          foot.armed = true;
        } else if (foot.armed) {
          const seconds = ((1 - footPhase) * stride) / speed;
          this.beginStep(foot, clamp(seconds, MIN_STEP_SECONDS, MAX_STEP_SECONDS), 1);
        }
      } else if (!other.stepping && off > SETTLE_TRIGGER) {
        this.beginStep(foot, SETTLE_SECONDS, SETTLE_LIFT);
      }
    }
  }

  private beginStep(foot: Foot, duration: number, lift: number): void {
    foot.stepping = true;
    foot.armed = false;
    foot.progress = 0;
    foot.duration = duration;
    foot.lift = lift;
    foot.from = this.project(foot.position);
    foot.fromHeading = foot.heading;
  }

  /** 서기·걷기 클립을 섞어 몸의 위치와 엉덩이 기울기를 정한다. 공중에서는 쓰지 않는다. */
  private animateBody(position: Vec3, up: Vec3): void {
    const idle = sampleClip(IDLE_CLIP, this.idleTime);
    const walk = sampleClip(WALK_CLIP, this.phase);
    const w = this.walkWeight;
    const onGround = this.airborne ? 0 : 1;
    const mix = (idleValue: number, walkValue: number) => onGround * (idleValue * (1 - w) + walkValue * w);
    const bob = mix(idle.bob * IDLE_AMPLITUDE.bob, walk.bob * WALK_AMPLITUDE.bob);
    const sway = mix(idle.sway * IDLE_AMPLITUDE.sway, walk.sway * WALK_AMPLITUDE.sway);
    const surge = mix(0, walk.surge * WALK_AMPLITUDE.surge);
    this.roll = mix(idle.roll * IDLE_AMPLITUDE.roll, walk.roll * WALK_AMPLITUDE.roll);
    const right = cross(this.forward, up);
    this.body = add(position, add(scale(up, bob), add(scale(right, sway), scale(this.forward, surge))));
  }

  private hangFeet(dt: number, position: Vec3, up: Vec3): void {
    const right = cross(this.forward, up);
    const follow = 1 - Math.exp(-AIR_FOLLOW_RATE * dt);
    for (const foot of this.feet) {
      const hang = add(position, add(scale(right, foot.side * STANCE_SIDE * AIR_HANG_SIDE), scale(up, -AIR_HANG_DOWN)));
      foot.position = lerp(foot.position, hang, follow);
      foot.heading = this.forward;
      foot.stepping = false;
    }
  }

  /** 착지하면 매달린 발을 걸음 중간에서 이어받아 땅으로 내린다. */
  private land(): void {
    for (const foot of this.feet) {
      this.beginStep(foot, SETTLE_SECONDS, 1);
      foot.progress = 0.5;
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
