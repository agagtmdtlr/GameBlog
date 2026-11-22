import { describe, expect, it } from 'vitest';
import { dot, length, scale, sub, type Vec3 } from '../engine/math';
import { RAIL_TOP, SphereTrackPath, TRACK_SHAPE, trackMesh } from '../engine/trackPath';
import { sphereVsBox } from '../physics/collision';
import { PLANET, surfaceDirection } from './planet';
import { PLAYER_RADIUS } from './player';
import { SURFACE_OBJECTS } from './surfaceScene';
import { TRACK_PATH, TRACK_ROUTE, Train, TRAIN, TRAIN_CARS } from './train';
import { NPCS, World } from './world';

const DT = 1 / 120;

describe('선로 스플라인', () => {
  it('조절점을 지나고 표면 위에 있다', () => {
    for (let d = 0; d < TRACK_PATH.length; d += 0.37) {
      expect(length(TRACK_PATH.point(d))).toBeCloseTo(PLANET.radius, 6);
    }
    for (const [lat, lon] of TRACK_ROUTE) {
      expect(TRACK_PATH.distanceTo(scale(surfaceDirection(lat, lon), PLANET.radius))).toBeLessThan(1e-6);
    }
  });

  it('닫힌 고리라 한 바퀴 돌면 같은 자리로 돌아온다', () => {
    const a = TRACK_PATH.point(3);
    const b = TRACK_PATH.point(3 + TRACK_PATH.length);
    expect(length(sub(a, b))).toBeLessThan(1e-9);
    expect(length(sub(TRACK_PATH.point(-1), TRACK_PATH.point(TRACK_PATH.length - 1)))).toBeLessThan(1e-9);
  });

  it('호 길이로 매개변수화되어 같은 거리만큼 가면 같은 만큼 움직인다', () => {
    const steps: number[] = [];
    for (let d = 0; d < TRACK_PATH.length; d += 1) steps.push(length(sub(TRACK_PATH.point(d + 1), TRACK_PATH.point(d))));
    expect(Math.min(...steps)).toBeGreaterThan(0.99);
    expect(Math.max(...steps)).toBeLessThanOrEqual(1.0001);
  });

  it('방향 축이 정규직교이고 위쪽은 표면 바깥이다', () => {
    for (const f of TRACK_PATH.frames(2.5)) {
      expect(dot(f.forward, f.up)).toBeCloseTo(0, 9);
      expect(dot(f.right, f.up)).toBeCloseTo(0, 9);
      expect(length(f.right)).toBeCloseTo(1, 9);
      expect(dot(f.up, scale(f.position, 1 / PLANET.radius))).toBeCloseTo(1, 9);
    }
  });

  it('부드럽게 굽어 차량 길이 안에서 크게 꺾이지 않는다', () => {
    for (let d = 0; d < TRACK_PATH.length; d += 0.5) {
      const a = TRACK_PATH.frame(d).forward;
      const b = TRACK_PATH.frame(d + 2.2).forward;
      // 위도 50 둘레를 도는 것만으로 2.2마다 약 11도 돈다. 물결이 더해져도 35도 안이다.
      expect(dot(a, b)).toBeGreaterThan(Math.cos((35 * Math.PI) / 180));
    }
  });

  it('조절점이 4개보다 적으면 거부한다', () => {
    expect(() => new SphereTrackPath([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 0, 0], 1)).toThrow();
  });
});

describe('선로 자리', () => {
  const clearance = TRACK_SHAPE.sleeperLength / 2 + PLAYER_RADIUS;

  it('시작 지점, 집 자리, 로켓과 겹치지 않는다', () => {
    expect(TRACK_PATH.distanceTo([0, PLANET.radius, 0])).toBeGreaterThan(8);
    for (const o of SURFACE_OBJECTS) {
      for (let d = 0; d < TRACK_PATH.length; d += 0.2) {
        const p = TRACK_PATH.point(d);
        // 기차 폭만큼 부푼 점이 상자에 닿으면 안 된다.
        expect(sphereVsBox(p, TRAIN.width, o.box), `${o.id} @ ${d.toFixed(1)}`).toBeNull();
      }
    }
  });

  it('NPC 시작 자리 위에 깔리지 않는다', () => {
    for (const npc of NPCS) expect(TRACK_PATH.distanceTo(npc.spawn)).toBeGreaterThan(clearance);
  });

  it('레일 윗면은 바퀴 바닥 높이와 같다', () => {
    const { rails, sleepers } = trackMesh(TRACK_PATH);
    expect(rails.positions.length).toBe(rails.normals.length);
    expect(sleepers.positions.length % 9).toBe(0);
    const tops: number[] = [];
    for (let i = 0; i < rails.positions.length; i += 3) {
      tops.push(Math.hypot(rails.positions[i], rails.positions[i + 1], rails.positions[i + 2]) - PLANET.radius);
    }
    // 레일은 표면 접선으로 옆에 놓이므로 행성이 둥근 만큼(약 0.007) 조금 높다.
    expect(Math.max(...tops)).toBeGreaterThanOrEqual(RAIL_TOP);
    expect(Math.max(...tops)).toBeLessThan(RAIL_TOP + 0.01);
  });
});

describe('기차', () => {
  it('한 바퀴를 일정한 빠르기로 돌아 처음 자리로 온다', () => {
    const train = new Train();
    const start = train.poses()[0].frame.position;
    const lap = TRACK_PATH.length / TRAIN.speed;
    for (let i = 0; i < Math.round(lap / DT); i++) train.step(DT);
    expect(length(sub(train.poses()[0].frame.position, start))).toBeLessThan(TRAIN.speed * DT * 2);
  });

  it('바퀴를 돌아도 보간 위치가 거꾸로 가지 않는다', () => {
    const train = new Train(TRACK_PATH, TRAIN_CARS, TRACK_PATH.length - TRAIN.speed * DT * 0.5);
    train.step(DT);
    expect(train.position(1) - train.position(0)).toBeCloseTo(TRAIN.speed * DT, 9);
  });

  it('차량이 순서대로 틈을 두고 이어진다', () => {
    const poses = new Train().poses();
    expect(poses).toHaveLength(TRAIN_CARS.length);
    for (let i = 1; i < poses.length; i++) {
      const gap = length(sub(poses[i - 1].frame.position, poses[i].frame.position));
      const expected = (poses[i - 1].spec.length + poses[i].spec.length) / 2 + TRAIN.gap;
      expect(gap).toBeGreaterThan(expected * 0.97);
      expect(gap).toBeLessThan(expected * 1.001);
    }
  });

  it('부품의 모델 행렬이 뒤집히지 않는다 (행렬식 양수)', () => {
    for (const part of new Train().parts()) {
      const m = part.model;
      const col = (c: number): Vec3 => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
      const [x, y, z] = [col(0), col(1), col(2)];
      const det = x[0] * (y[1] * z[2] - y[2] * z[1]) - y[0] * (x[1] * z[2] - x[2] * z[1]) + z[0] * (x[1] * y[2] - x[2] * y[1]);
      expect(det).toBeGreaterThan(0);
    }
  });

  it('선로 위에 선 캐릭터를 밀어낸다', () => {
    const world = new World();
    const ahead = world.train.position() + 6;
    const spot = TRACK_PATH.point(ahead);
    const standing = scale(spot, (PLANET.radius + PLAYER_RADIUS) / PLANET.radius);
    world.player.position = standing;
    world.player.previousPosition = standing;
    for (let i = 0; i < Math.round(4 / DT); i++) world.fixedStep(DT, { direction: [0, 0, 0] });
    for (const box of world.train.obstacles()) {
      expect(sphereVsBox(world.player.position, PLAYER_RADIUS * 0.9, box)).toBeNull();
    }
  });
});
