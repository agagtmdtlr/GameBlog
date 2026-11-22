import { describe, expect, it } from 'vitest';
import { dot, length, normalize, scale, sub, type Vec3 } from '../engine/math';
import { groundNormal, groundRadius, sphereVsCapsule, sphereVsGround } from '../physics/collision';
import { PLANET } from './planet';
import { Player, PLAYER_RADIUS } from './player';
import { SURFACE_OBJECTS } from './surfaceScene';
import { DREAM_PROPS, PROP_COLLIDERS, PROP_LAYOUT, TERRAIN, terrainHeight, type PropShape } from './terrain';
import { TRACK_PATH } from './train';

/** 구 표면을 고르게 덮는 피보나치 점 */
function sampleDirections(count: number): Vec3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r] as Vec3;
  });
}

const SAMPLES = sampleDirections(6000);

describe('땅의 높낮이', () => {
  it('언덕과 움푹한 곳이 있다', () => {
    const heights = SAMPLES.map(terrainHeight);
    expect(Math.max(...heights)).toBeGreaterThan(1);
    expect(Math.min(...heights)).toBeLessThan(-0.2);
    expect(Math.max(...heights.map(Math.abs))).toBeLessThan(3);
  });

  it('선로, 시작 지점, 표면 객체 아래는 평평하다', () => {
    for (const frame of TRACK_PATH.frames(0.5)) expect(terrainHeight(frame.up)).toBe(0);
    expect(terrainHeight([0, 1, 0])).toBe(0);
    for (const o of SURFACE_OBJECTS) expect(terrainHeight(normalize(o.box.center))).toBe(0);
  });

  it('비탈이 걸어 오를 수 있을 만큼 완만하다', () => {
    const steepest = Math.min(...SAMPLES.map((dir) => dot(groundNormal(TERRAIN, dir), dir)));
    // 50도보다 가파른 곳이 없다.
    expect(steepest).toBeGreaterThan(Math.cos((50 * Math.PI) / 180));
  });

  it('언덕 꼭대기에 선 캐릭터는 땅 높이에 맞춰 쉰다', () => {
    const peak = SAMPLES.reduce((best, dir) => (terrainHeight(dir) > terrainHeight(best) ? dir : best));
    const start = scale(peak, groundRadius(TERRAIN, peak) + PLAYER_RADIUS + 0.5);
    const player = new Player(start);
    for (let i = 0; i < 240; i++) player.step(1 / 120, { direction: [0, 0, 0] }, TERRAIN);
    const dir = normalize(player.position);
    expect(player.grounded).toBe(true);
    // 비탈에서는 접평면에 닿는 만큼 조금 더 떠 있다.
    const rest = groundRadius(TERRAIN, dir) + PLAYER_RADIUS / dot(groundNormal(TERRAIN, dir), dir);
    expect(length(player.position)).toBeCloseTo(rest, 1);
    // 가만히 있으면 비탈에서 미끄러지지 않는다.
    expect(length(player.velocity)).toBeLessThan(0.05);
    expect(length(player.position)).toBeGreaterThan(PLANET.radius + PLAYER_RADIUS + 0.8);
  });
});

describe('땅 충돌', () => {
  it('높이 함수가 없으면 구와 같다', () => {
    const contact = sphereVsGround([0, 18.5, 0], 1, PLANET)!;
    expect(contact.depth).toBeCloseTo(0.5, 6);
    expect(contact.normal[1]).toBeCloseTo(1, 6);
  });

  it('캡슐의 가장 가까운 축 위 점에서 밀어낸다', () => {
    const capsule = { a: [0, 0, 0] as Vec3, b: [0, 4, 0] as Vec3, radius: 1 };
    const side = sphereVsCapsule([1.5, 2, 0], 1, capsule)!;
    expect(side.normal[0]).toBeCloseTo(1, 6);
    expect(side.depth).toBeCloseTo(0.5, 6);
    expect(sphereVsCapsule([0, 6.5, 0], 1, capsule)).toBeNull();
  });
});

describe('몽환적인 지형물', () => {
  it('모양마다 정한 수만큼 놓인다', () => {
    for (const [shape, count] of Object.entries(PROP_LAYOUT.counts)) {
      expect(DREAM_PROPS.filter((p) => p.shape === (shape as PropShape))).toHaveLength(count);
    }
  });

  it('선로와 시작 지점, 표면 객체를 막지 않는다', () => {
    for (const capsule of PROP_COLLIDERS) {
      for (const end of [capsule.a, capsule.b]) {
        // 선로 위를 지나는 기차(폭 약 1.1)와 캐릭터가 지나갈 틈이 있다.
        expect(TRACK_PATH.distanceTo(end) - capsule.radius).toBeGreaterThan(1.5);
        expect(length(sub(normalize(end), [0, 1, 0])) * PLANET.radius - capsule.radius).toBeGreaterThan(3);
        for (const o of SURFACE_OBJECTS) {
          expect(length(sub(end, o.box.center)) - capsule.radius).toBeGreaterThan(2);
        }
      }
    }
  });

  it('바닥이 땅에 묻혀 뜨지 않는다', () => {
    for (const prop of DREAM_PROPS.filter((p) => p.shape === 'mound' || p.shape === 'pillar')) {
      const model = prop.parts[0].model;
      const origin: Vec3 = [model[12], model[13], model[14]];
      expect(length(origin)).toBeLessThan(groundRadius(TERRAIN, prop.direction));
    }
  });
});
