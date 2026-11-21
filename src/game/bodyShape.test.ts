import { describe, expect, it } from 'vitest';
import { dot, length, sub, type Vec3 } from '../engine/math';
import { BODY_FORMS, type BodyShape } from './bodyShape';
import { PLANET } from './planet';
import { PLAYER_RADIUS } from './player';
import { SPHERE_HIP, Walker } from './walker';
import { NPCS, World } from './world';

const SHAPES = Object.keys(BODY_FORMS) as BodyShape[];

/** 몸 중심 기준 [오른쪽, 위, 앞] 좌표의 점이 몸 모양 안에 있는지 */
function inside(shape: BodyShape, [x, y, z]: Vec3): boolean {
  const { size, lift } = BODY_FORMS[shape];
  const ly = y - lift;
  if (shape === 'sphere') return length([x, y, z]) < size[0];
  if (shape === 'cube') return Math.abs(x) < size[0] / 2 && Math.abs(ly) < size[1] / 2 && Math.abs(z) < size[2] / 2;
  // 피라미드: 높이에 따라 밑면 폭에서 꼭짓점 0까지 좁아진다.
  const t = ly / size[1] + 0.5;
  if (t <= 0 || t >= 1) return false;
  return Math.abs(x) < ((1 - t) * size[0]) / 2 && Math.abs(z) < ((1 - t) * size[2]) / 2;
}

describe('몸 모양', () => {
  it('구의 엉덩이 자리는 플레이어와 같다', () => {
    expect(BODY_FORMS.sphere.hip).toEqual(SPHERE_HIP);
  });

  it.each(SHAPES)('%s: 엉덩이 관절이 몸 안에 있어 다리가 몸에서 나온다', (shape) => {
    const { hip } = BODY_FORMS[shape];
    expect(inside(shape, [hip.side, hip.up, 0])).toBe(true);
    expect(inside(shape, [-hip.side, hip.up, 0])).toBe(true);
  });

  it.each(SHAPES)('%s: 몸이 땅에 닿지 않는다', (shape) => {
    const { size, lift, mesh } = BODY_FORMS[shape];
    const bottom = mesh === 'sphere' ? size[1] : size[1] / 2 - lift;
    expect(bottom).toBeLessThan(PLAYER_RADIUS * 0.9);
  });

  it('NPC들이 세 모양을 모두 쓴다', () => {
    expect(new Set(NPCS.map((npc) => npc.shape))).toEqual(new Set(SHAPES));
  });

  it('모난 몸은 진행 방향을 보고 몸 중심에 놓인다', () => {
    const world = new World();
    const index = NPCS.findIndex((npc) => npc.shape === 'cube');
    const walker = world.npcs[index].walker;
    const pose = walker.pose(1);
    const items = world.buildDrawList(1).filter((item) => item.material.baseColor === NPCS[index].color);
    const body = items.find((item) => item.mesh === 'box')!;
    const m = body.model;
    const axisX: Vec3 = [m[0], m[1], m[2]];
    const axisZ: Vec3 = [m[8], m[9], m[10]];
    const origin: Vec3 = [m[12], m[13], m[14]];
    const { right, up } = walker.hipAxes(pose);
    // 모델 행렬은 Float32라 그 정밀도로 비교한다.
    expect(length(sub(origin, pose.body))).toBeLessThan(1e-5);
    expect(dot(axisX, right) / length(axisX)).toBeCloseTo(1, 5);
    expect(dot(axisZ, pose.forward) / length(axisZ)).toBeCloseTo(-1, 5);
    // 오른손 기저: X × Y가 Z 쪽이어야 면이 뒤집히지 않는다.
    const axisY: Vec3 = [m[4], m[5], m[6]];
    const crossXY: Vec3 = [
      axisX[1] * axisY[2] - axisX[2] * axisY[1],
      axisX[2] * axisY[0] - axisX[0] * axisY[2],
      axisX[0] * axisY[1] - axisX[1] * axisY[0],
    ];
    expect(dot(crossXY, axisZ)).toBeGreaterThan(0);
    expect(dot(up, axisY)).toBeGreaterThan(0);
  });

  it('피라미드 몸의 엉덩이 자리로 다리를 풀면 엉덩이가 몸 중심 높이에 붙는다', () => {
    const spawn: Vec3 = [0, PLANET.radius + PLAYER_RADIUS, 0];
    const walker = new Walker(spawn, PLANET, undefined, BODY_FORMS.pyramid.hip);
    const pose = walker.pose(1);
    const thighs = walker.solveLegs(pose).filter((bone) => bone.bone === 'thigh');
    for (const thigh of thighs) {
      const offset = sub(thigh.origin, pose.body);
      expect(Math.abs(dot(offset, [0, 1, 0]))).toBeLessThan(1e-9);
      expect(length(offset)).toBeCloseTo(BODY_FORMS.pyramid.hip.side, 9);
    }
  });
});
