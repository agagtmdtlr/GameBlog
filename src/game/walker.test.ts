import { describe, expect, it } from 'vitest';
import {
  add,
  cross,
  dot,
  length,
  mat4FromBasis,
  mat4Multiply,
  mat4RigidInverse,
  mat4TransformPoint,
  normalize,
  scale,
  sub,
  type Vec3,
} from '../engine/math';
import { skinVertices } from '../engine/skinning';
import blenderScript from '../../tools/blender/build_character.py?raw';
import { PLANET } from './planet';
import { Player, PLAYER_RADIUS, type MoveCommand } from './player';
import { IDLE_CLIP, STEP_CLIP, WALK_CLIP } from './characterClips';
import { sampleTrack, track } from './keyframes';
import {
  CHARACTER_SCALE,
  LEG,
  LEG_REST,
  restBones,
  solveTwoBone,
  Walker,
  type BoneTransform,
  type Side,
} from './walker';

const DT = 1 / 120;
const TOP: Vec3 = [0, PLANET.radius + PLAYER_RADIUS, 0];
const IDLE: MoveCommand = { direction: [0, 0, 0] };

function heightAboveSurface(p: Vec3): number {
  return length(sub(p, PLANET.center)) - PLANET.radius;
}

function run(player: Player, walker: Walker, seconds: number, command: (p: Player) => MoveCommand): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    player.step(DT, command(player), PLANET);
    walker.step(DT, player);
  }
}

const alongEquator = (p: Player): MoveCommand => ({ direction: normalize(cross(p.position, [0, 0, 1])) });

describe('두 마디 IK', () => {
  const hip: Vec3 = [0, 0, 0];
  const pole: Vec3 = [1, 1, 0];

  it('닿는 목표에서는 마디 길이를 지키며 발목이 목표에 닿는다', () => {
    const target: Vec3 = [0.4, -1.2, 0.1];
    const { knee, ankle } = solveTwoBone(hip, target, LEG.thigh, LEG.shin, pole);
    expect(length(sub(knee, hip))).toBeCloseTo(LEG.thigh, 5);
    expect(length(sub(ankle, knee))).toBeCloseTo(LEG.shin, 5);
    expect(length(sub(ankle, target))).toBeCloseTo(0, 5);
  });

  it('무릎은 pole 쪽으로 굽는다', () => {
    const target: Vec3 = [0, -1.2, 0];
    const { knee } = solveTwoBone(hip, target, LEG.thigh, LEG.shin, pole);
    expect(dot(knee, normalize(pole))).toBeGreaterThan(0);
  });

  it('닿지 않으면 목표 쪽으로 곧게 편다', () => {
    const target: Vec3 = [0, -5, 0];
    const { ankle } = solveTwoBone(hip, target, LEG.thigh, LEG.shin, pole);
    expect(length(ankle)).toBeCloseTo(LEG.thigh + LEG.shin, 3);
    expect(ankle[1]).toBeLessThan(-1.5);
  });
});

describe('키프레임 트랙', () => {
  it('키에서는 키 값을 지나고 사이는 부드럽게 잇는다', () => {
    const keys = track([0, 0], [0.5, 1], [1, 0]);
    expect(sampleTrack(keys, 0, false)).toBeCloseTo(0, 6);
    expect(sampleTrack(keys, 0.5, false)).toBeCloseTo(1, 6);
    expect(sampleTrack(keys, 1, false)).toBeCloseTo(0, 6);
    const quarter = sampleTrack(keys, 0.25, false);
    expect(quarter).toBeGreaterThan(0.4);
    expect(quarter).toBeLessThan(1);
  });

  it('반복 트랙은 1을 넘으면 처음부터 다시 재생하고 이음매에서 끊기지 않는다', () => {
    const keys = WALK_CLIP.tracks.bob;
    expect(sampleTrack(keys, 1.3, true)).toBeCloseTo(sampleTrack(keys, 0.3, true), 6);
    expect(sampleTrack(keys, 0.9999, true)).toBeCloseTo(sampleTrack(keys, 0.0001, true), 2);
  });

  it('반복 클립의 트랙은 끝 값과 처음 값이 같고, 내딛기는 땅에서 시작해 땅에서 끝난다', () => {
    for (const clip of [IDLE_CLIP, WALK_CLIP]) {
      for (const keys of Object.values(clip.tracks)) {
        expect(keys[0].time).toBe(0);
        expect(keys[keys.length - 1].time).toBe(1);
        expect(keys[keys.length - 1].value).toBe(keys[0].value);
      }
    }
    expect(sampleTrack(STEP_CLIP.tracks.lift, 0, false)).toBe(0);
    expect(sampleTrack(STEP_CLIP.tracks.lift, 1, false)).toBe(0);
    expect(sampleTrack(STEP_CLIP.tracks.travel, 1, false)).toBe(1);
  });
});

describe('서기와 걷기 애니메이션', () => {
  it('서 있으면 숨쉬기 클립대로 몸만 오르내리고 발은 그대로다', () => {
    const player = new Player(TOP);
    const walker = new Walker(TOP, PLANET);
    run(player, walker, 0.5, () => IDLE);
    const feet = [walker.footPosition(-1), walker.footPosition(1)];
    const heights: number[] = [];
    for (let i = 0; i < IDLE_CLIP.duration / DT; i++) {
      run(player, walker, DT, () => IDLE);
      heights.push(dot(sub(walker.body, player.position), normalize(player.position)));
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.03);
    expect(walker.walkWeight).toBeLessThan(0.01);
    expect(length(sub(walker.footPosition(-1), feet[0]))).toBeLessThan(1e-9);
    expect(length(sub(walker.footPosition(1), feet[1]))).toBeLessThan(1e-9);
  });

  it('걸으면 걷기 클립으로 바뀌고, 딛고 있는 발은 땅에 고정된다', () => {
    const player = new Player(TOP);
    const walker = new Walker(TOP, PLANET);
    run(player, walker, 1, alongEquator);
    expect(walker.walkWeight).toBeGreaterThan(0.95);
    let planted = 0;
    for (let i = 0; i < 2 / DT; i++) {
      const before = [walker.footPosition(-1), walker.footPosition(1)];
      const wasStepping = walker.steppingCount;
      run(player, walker, DT, alongEquator);
      for (let leg = 0; leg < 2; leg++) {
        const side: Side = leg === 0 ? -1 : 1;
        const now = walker.footPosition(side);
        const onGround = heightAboveSurface(before[leg]) < 1e-6 && heightAboveSurface(now) < 1e-6;
        // 땅에 있던 발이 그대로 땅에 있으면 움직이지 않아야 한다 (착지 순간 제외).
        if (onGround && wasStepping === walker.steppingCount) {
          planted++;
          expect(length(sub(now, before[leg]))).toBeLessThan(1e-9);
        }
      }
    }
    expect(planted).toBeGreaterThan(100);
  });
});

describe('절차적 걸음', () => {
  it('서 있으면 두 발이 몸 양옆 땅에 놓이고 움직이지 않는다', () => {
    const player = new Player(TOP);
    const walker = new Walker(TOP, PLANET);
    run(player, walker, 1, () => IDLE);
    for (const side of [-1, 1] as Side[]) {
      const foot = walker.footPosition(side);
      expect(heightAboveSurface(foot)).toBeCloseTo(0, 5);
      expect(Math.sign(foot[0])).toBe(side);
    }
    expect(walker.steppingCount).toBe(0);
  });

  it('걸으면 발을 번갈아 내딛고, 발이 다리가 닿는 범위를 벗어나지 않는다', () => {
    const player = new Player(TOP);
    const walker = new Walker(TOP, PLANET);
    const steps = { [-1]: 0, [1]: 0 };
    const wasStepping = { [-1]: false, [1]: false };
    let bothSteppingFrames = 0;
    let frames = 0;
    for (let i = 0; i < 4 / DT; i++) {
      player.step(DT, alongEquator(player), PLANET);
      walker.step(DT, player);
      frames++;
      const pose = walker.pose(1);
      const bones = walker.solveLegs(pose);
      for (const side of [-1, 1] as Side[]) {
        const foot = pose.feet[side < 0 ? 0 : 1];
        const lifted = heightAboveSurface(foot) > 1e-4;
        if (lifted && !wasStepping[side]) steps[side]++;
        wasStepping[side] = lifted;
      }
      if (wasStepping[-1] && wasStepping[1]) bothSteppingFrames++;
      // 발목(발 부품의 원점)이 발바닥 위 발목 높이에서 크게 벗어나지 않는다.
      for (let leg = 0; leg < 2; leg++) {
        const ankle = bones[leg * 3 + 2].origin;
        const sole = pose.feet[leg];
        const expected = add(sole, scale(normalize(sub(sole, PLANET.center)), LEG.ankleHeight * CHARACTER_SCALE));
        expect(length(sub(ankle, expected))).toBeLessThan(0.15);
      }
    }
    expect(steps[-1]).toBeGreaterThan(5);
    expect(steps[1]).toBeGreaterThan(5);
    expect(Math.abs(steps[-1] - steps[1])).toBeLessThanOrEqual(2);
    expect(bothSteppingFrames / frames).toBeLessThan(0.2);
  });

  it('진행 방향으로 몸을 돌린다', () => {
    const player = new Player(TOP);
    const walker = new Walker(TOP, PLANET);
    run(player, walker, 1, alongEquator);
    const heading = normalize(player.velocity);
    expect(dot(walker.forward, heading)).toBeGreaterThan(0.95);
  });

  it('멈추면 두 발을 모으고 걸음을 끝낸다', () => {
    const player = new Player(TOP);
    const walker = new Walker(TOP, PLANET);
    run(player, walker, 1.5, alongEquator);
    run(player, walker, 3, () => IDLE);
    expect(walker.steppingCount).toBe(0);
    const up = normalize(sub(player.position, PLANET.center));
    const right = cross(walker.forward, up);
    for (const side of [-1, 1] as Side[]) {
      const offset = sub(walker.footPosition(side), player.position);
      expect(dot(offset, right) * side).toBeGreaterThan(0.8);
      expect(Math.abs(dot(offset, walker.forward))).toBeLessThan(0.1);
    }
  });

  it('공중에서는 발이 땅을 딛지 않고, 착지하면 다시 땅을 딛는다', () => {
    const start: Vec3 = [0, PLANET.radius + PLAYER_RADIUS + 3, 0];
    const player = new Player(start);
    const walker = new Walker(start, PLANET);
    run(player, walker, 0.3, () => IDLE);
    expect(walker.airborne).toBe(true);
    expect(heightAboveSurface(walker.footPosition(-1))).toBeGreaterThan(0.5);
    run(player, walker, 3, () => IDLE);
    expect(walker.airborne).toBe(false);
    expect(heightAboveSurface(walker.footPosition(-1))).toBeCloseTo(0, 4);
  });
});

describe('다리 스킨 메시의 기본 자세', () => {
  const matrix = ({ origin, x, y, z }: BoneTransform) => mat4FromBasis(origin, x, y, z);

  it('Blender 스크립트의 기본 자세와 같다', () => {
    const number = (pattern: RegExp): number[] => blenderScript.match(pattern)!.slice(1).map(Number);
    expect(number(/^REST_KNEE = \(([-\d.]+), ([-\d.]+)\)/m)).toEqual([LEG_REST.knee[0], LEG_REST.knee[1]]);
    expect(number(/^REST_ANKLE = \(([-\d.]+), ([-\d.]+)\)/m)).toEqual([LEG_REST.ankle[0], LEG_REST.ankle[1]]);
    expect(number(/^ANKLE_HEIGHT = ([\d.]+)/m)).toEqual([LEG.ankleHeight]);
  });

  it('마디 길이가 다리 뼈 치수와 같다', () => {
    expect(length(LEG_REST.knee)).toBeCloseTo(LEG.thigh, 2);
    expect(length(sub(LEG_REST.ankle, LEG_REST.knee))).toBeCloseTo(LEG.shin, 2);
  });

  it('서 있는 자세의 스키닝은 기본 자세 발목을 IK가 푼 발목으로 옮긴다', () => {
    const player = new Player(TOP);
    const walker = new Walker(TOP, PLANET);
    // 숨쉬기 클립이 한 바퀴 돌아 몸 높이와 기울기가 0인 순간을 본다.
    run(player, walker, IDLE_CLIP.duration, () => IDLE);
    const bones = walker.solveLegs(walker.pose(1));
    const rest = restBones();
    for (let leg = 0; leg < 2; leg++) {
      // 게임의 뼈 행렬은 설계 치수의 메시를 CHARACTER_SCALE만큼 키운다 (world.ts와 같다).
      const posed = ({ origin, x, y, z }: BoneTransform) =>
        mat4FromBasis(origin, scale(x, CHARACTER_SCALE), scale(y, CHARACTER_SCALE), scale(z, CHARACTER_SCALE));
      const skin = (i: number) => mat4Multiply(posed(bones[leg * 3 + i]), mat4RigidInverse(matrix(rest[i])));
      const ankle = bones[leg * 3 + 2].origin;
      // 이웃한 뼈가 기본 자세의 관절을 같은 곳으로 옮겨야 관절에서 메시가 끊기지 않는다.
      // 기본 자세 좌표는 소수 셋째 자리로 반올림해 두어 마디 길이와 1mm쯤 다르다.
      const knee = bones[leg * 3 + 1].origin;
      expect(length(sub(mat4TransformPoint(skin(0), LEG_REST.knee), knee))).toBeLessThan(0.005);
      expect(length(sub(mat4TransformPoint(skin(1), LEG_REST.knee), knee))).toBeLessThan(0.005);
      expect(length(sub(mat4TransformPoint(skin(1), LEG_REST.ankle), ankle))).toBeLessThan(0.005);
      expect(length(sub(mat4TransformPoint(skin(2), LEG_REST.ankle), ankle))).toBeLessThan(0.005);
    }
    // 서 있는 자세의 무릎 높이는 기본 자세와 거의 같다 (몸 높이와 엉덩이·발 위치가 기본 자세에 맞춰져 있다).
    // 행성이 둥글어 발이 옆으로 약 1.6 떨어진 곳의 땅이 약 0.07 낮으므로 그만큼 차이를 둔다.
    const up = normalize(sub(player.position, PLANET.center));
    const hipToKnee = sub(bones[4].origin, bones[3].origin);
    expect(Math.abs(dot(hipToKnee, up) - LEG_REST.knee[1] * CHARACTER_SCALE)).toBeLessThan(0.08);
  });

  it('CPU 스키닝은 가중치대로 뼈 행렬을 섞는다', () => {
    const shift = mat4FromBasis([0, 2, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const identity = mat4FromBasis([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const source = {
      positions: new Float32Array([1, 0, 0]),
      normals: new Float32Array([0, 0, 1]),
      boneIndices: new Uint8Array([0, 1, 0, 0]),
      boneWeights: new Float32Array([0.25, 0.75, 0, 0]),
    };
    const outPositions = new Float32Array(3);
    const outNormals = new Float32Array(3);
    skinVertices(source, [identity, shift], outPositions, outNormals);
    expect([...outPositions]).toEqual([1, 1.5, 0]);
    expect([...outNormals]).toEqual([0, 0, 1]);
  });
});
