import { describe, expect, it } from 'vitest';
import { headProfile, slitPatch, tentacleSkin, visorPatch, ALIEN_SHAPE } from '../shapes/alienShape';
import { cross, dot, length, normalize, sub, type Vec3 } from '../../../engine/math';
import { groundRadius, sphereVsObstacle } from '../../../engine/physics/collision';
import { ALIEN, ALIEN_COLORS } from './alien';
import { seededRandom } from '../../common/character/npc';
import { PLAYER_RADIUS } from '../../common/character/player';
import { SURFACE_OBJECTS } from './surfaceScene';
import { PROP_COLLIDERS, TERRAIN } from './terrain';
import { ALIEN_SPAWNS, NPCS, World } from '../world';

const DT = 1 / 120;
const IDLE = { direction: [0, 0, 0] as Vec3 };
const OBSTACLES = [...SURFACE_OBJECTS.filter((o) => o.collides).map((o) => o.box), ...PROP_COLLIDERS];

const point = (a: Float32Array, i: number): Vec3 => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];

describe('외계인 모양', () => {
  it('머리 단면은 챙 바닥에서 꼭대기까지 이어지고 챙이 반구보다 넓다', () => {
    const profile = headProfile();
    expect(profile[0][0]).toBe(0);
    expect(profile[profile.length - 1]).toEqual([0, ALIEN_SHAPE.domeRadius]);
    expect(Math.max(...profile.map(([r]) => r))).toBeCloseTo(ALIEN_SHAPE.brimRadius, 2);
  });

  it('눈가리개와 틈은 머리 앞쪽 구면에 붙고 앞면이 바깥을 본다', () => {
    for (const [patch, radius] of [[visorPatch(), ALIEN_SHAPE.visor.radius], [slitPatch(), ALIEN_SHAPE.slit.radius]] as const) {
      const { positions, normals, indices } = patch;
      for (let i = 0; i < positions.length / 3; i++) {
        expect(length(point(positions, i))).toBeCloseTo(radius, 5);
        expect(point(positions, i)[2]).toBeGreaterThan(0);
        expect(dot(point(normals, i), normalize(point(positions, i)))).toBeCloseTo(1, 5);
      }
      for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map((i) => point(positions, i));
        const faceNormal = cross(sub(b, a), sub(c, a));
        expect(dot(faceNormal, a)).toBeGreaterThan(0);
      }
    }
  });

  it('촉수 정점은 이웃한 두 뼈에 가중치 합 1로 붙고, 바깥을 보는 면으로 감긴다', () => {
    const skin = tentacleSkin();
    const count = skin.positions.length / 3;
    for (let i = 0; i < count; i++) {
      const w = skin.boneWeights.slice(i * 4, i * 4 + 4);
      expect(w[0] + w[1] + w[2] + w[3]).toBeCloseTo(1, 6);
      expect(Math.max(...skin.boneIndices.slice(i * 4, i * 4 + 4))).toBeLessThan(ALIEN_SHAPE.tentacle.bones);
    }
    for (let t = 0; t < skin.indices.length; t += 3) {
      const [a, b, c] = [skin.indices[t], skin.indices[t + 1], skin.indices[t + 2]].map((i) => point(skin.positions, i));
      const faceNormal = cross(sub(b, a), sub(c, a));
      if (length(faceNormal) < 1e-9) continue;
      const n = point(skin.normals, skin.indices[t]);
      expect(dot(faceNormal, n)).toBeGreaterThan(-1e-9);
    }
  });
});

describe('외계인', () => {
  it('시작 자리가 장애물, 플레이어, NPC와 겹치지 않는다', () => {
    const others = [new World().player.position, ...NPCS.map((npc) => npc.spawn)];
    for (const spawn of ALIEN_SPAWNS) {
      for (const obstacle of OBSTACLES) expect(sphereVsObstacle(spawn, PLAYER_RADIUS, obstacle)).toBeNull();
      for (const other of others) expect(length(sub(spawn, other))).toBeGreaterThan(PLAYER_RADIUS * 4);
    }
  });

  it('머리, 눈가리개, 더듬이, 촉수 여섯, 광선총이 그리기 목록에 들어간다', () => {
    const world = new World(seededRandom(2));
    const items = world.buildDrawList(1);
    const count = (mesh: string) => items.filter((item) => item.mesh === mesh).length;
    expect(count('alienHead')).toBe(ALIEN_SPAWNS.length);
    expect(count('alienVisor')).toBe(ALIEN_SPAWNS.length);
    expect(count('alienSlit')).toBe(ALIEN_SPAWNS.length);
    const tentacles = items.filter((item) => item.mesh === 'tentacle');
    expect(tentacles).toHaveLength(ALIEN_SPAWNS.length * 6);
    for (const t of tentacles) expect(t.skin).toHaveLength(ALIEN_SHAPE.tentacle.bones);
  });

  it('떠서 돌아다니고, 다리 끝은 머리 아래 땅 가까이에 늘어진다', () => {
    const world = new World(seededRandom(4));
    const alien = world.aliens[0];
    const start = alien.body.position;
    let travelled = 0;
    for (let i = 0; i < Math.round(30 / DT); i++) {
      world.fixedStep(DT, IDLE);
      const p = alien.body.position;
      // 물리 몸은 땅 위에 머문다.
      expect(length(p) - groundRadius(TERRAIN, normalize(p))).toBeGreaterThan(PLAYER_RADIUS - 0.2);
      expect(length(p) - groundRadius(TERRAIN, normalize(p))).toBeLessThan(PLAYER_RADIUS + 0.4);
      travelled = Math.max(travelled, length(sub(p, start)));
    }
    expect(travelled).toBeGreaterThan(3);

    // 멈춰 있을 때 다리 넷의 끝은 챙보다 아래, 땅 위 조금 떨어진 곳이다.
    for (let i = 0; i < Math.round(20 / DT) && alien.drag() > 0.05; i++) world.fixedStep(DT, IDLE);
    const frame = alien.frame(1);
    const up = normalize(frame.origin);
    const legs = world.buildDrawList(1).filter((item) => item.mesh === 'tentacle').slice(0, 4);
    for (const leg of legs) {
      const last = leg.skin![leg.skin!.length - 1];
      // 마지막 뼈 행렬은 기본 자세의 끝(아래로 길이만큼)을 월드로 옮긴다.
      const L = ALIEN_SHAPE.tentacle.length;
      const tip: Vec3 = [last[4] * -L + last[12], last[5] * -L + last[13], last[6] * -L + last[14]];
      const height = length(tip) - groundRadius(TERRAIN, normalize(tip));
      expect(dot(sub(tip, frame.origin), up)).toBeLessThan(-1);
      expect(height).toBeGreaterThan(-0.2);
      expect(height).toBeLessThan(0.9);
    }
  });

  it('광선총은 앞쪽을 겨누고 손끝 가까이에 있다', () => {
    const world = new World(seededRandom(1));
    const alien = world.aliens[0];
    const parts = alien.parts(1);
    const frame = alien.frame(1);
    const forward = normalize(frame.z);
    // 총구는 눈가리개 색의 구다.
    const nose = parts.find((p) => p.mesh === 'sphere' && p.color === ALIEN_COLORS.visor)!;
    const center: Vec3 = [nose.model[12], nose.model[13], nose.model[14]];
    expect(dot(sub(center, frame.origin), forward)).toBeGreaterThan(0);
    expect(length(sub(center, frame.origin))).toBeLessThan(ALIEN.scale * 3.5);
  });
});
