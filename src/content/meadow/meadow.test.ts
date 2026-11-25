import { describe, expect, it } from 'vitest';
import { dot, length, normalize, sub } from '../../engine/math';
import { groundNormal, groundRadius } from '../../engine/physics/collision';
import { PLAYER_RADIUS } from '../common/character/player';
import { keepInside, MEADOW, MEADOW_CENTER, MEADOW_GROUND, meadowHeight, meadowPoint } from './objects/meadowTerrain';
import { Wind, windDirection, windStrength, WIND } from './objects/wind';
import { MEADOW_SPAWN, MeadowWorld } from './world';

describe('초원 땅', () => {
  it('땅 위의 점이 캐릭터가 걷는 땅의 높이와 맞는다', () => {
    for (const [x, z] of [[0, 0], [37, -12], [-80, 64], [120, 30], [-140, -60]]) {
      const p = meadowPoint(x, z);
      const fromCenter = sub(p, MEADOW_CENTER);
      const dir = normalize(fromCenter);
      expect(length(fromCenter)).toBeCloseTo(groundRadius(MEADOW_GROUND, dir), 4);
      // 수평 좌표를 그대로 되찾는다 (높이 함수가 수평 좌표로 정해진다).
      expect(dir[0] * MEADOW.curvature).toBeCloseTo(x, 2);
      expect(dir[2] * MEADOW.curvature).toBeCloseTo(z, 2);
    }
  });

  it('분지 안은 걸어 오를 수 있을 만큼 완만하다', () => {
    let steepest = 0;
    for (let x = -MEADOW.bound; x <= MEADOW.bound; x += 3.7) {
      for (let z = -MEADOW.bound; z <= MEADOW.bound; z += 3.7) {
        if (Math.hypot(x, z) > MEADOW.bound) continue;
        const dir = normalize(sub(meadowPoint(x, z), MEADOW_CENTER));
        steepest = Math.max(steepest, Math.acos(dot(dir, groundNormal(MEADOW_GROUND, dir))));
      }
    }
    expect((steepest * 180) / Math.PI).toBeLessThan(35);
  });

  it('가장자리가 분지 안쪽보다 높이 솟는다', () => {
    const inner = Math.max(...[0, 1, 2, 3].map((k) => meadowHeight(60 * Math.cos(k), 60 * Math.sin(k))));
    expect(meadowHeight(0, 200)).toBeGreaterThan(inner + 8);
  });

  it('분지 밖으로 나간 자리를 안으로 되돌린다', () => {
    expect(keepInside([10, 0, 20])).toBeNull();
    const back = keepInside([300, 5, 0]);
    expect(back?.position).toEqual([MEADOW.bound, 5, 0]);
    expect(back?.outward).toEqual([1, 0, 0]);
  });
});

describe('초원 월드', () => {
  it('시작 지점 캐릭터가 땅에 서 있다', () => {
    expect(length(sub(MEADOW_SPAWN, meadowPoint(0, 0)))).toBeCloseTo(PLAYER_RADIUS, 4);
    const world = new MeadowWorld();
    for (let i = 0; i < 240; i++) world.fixedStep(1 / 120, { direction: [0, 0, 0] });
    const p = world.player.position;
    const above = length(sub(p, MEADOW_CENTER)) - groundRadius(MEADOW_GROUND, normalize(sub(p, MEADOW_CENTER)));
    expect(above).toBeGreaterThan(PLAYER_RADIUS * 0.8);
    expect(above).toBeLessThan(PLAYER_RADIUS * 1.3);
  });

  it('걸어서 분지 밖으로 나가지 못한다', () => {
    const world = new MeadowWorld();
    world.player.position = meadowPoint(MEADOW.bound - 2, 0, PLAYER_RADIUS);
    world.player.previousPosition = world.player.position;
    for (let i = 0; i < 600; i++) world.fixedStep(1 / 120, { direction: [1, 0, 0] });
    expect(Math.hypot(world.player.position[0], world.player.position[2])).toBeLessThanOrEqual(MEADOW.bound + 1e-6);
  });

  it('그림자가 캐릭터를 따라가고 밤은 땅 중심으로 정한다', () => {
    const world = new MeadowWorld();
    const env = world.environment(1);
    expect(env.shadowCenter).toEqual(world.interpolatedPlayerPosition(1));
    expect(env.worldCenter).toEqual(MEADOW_CENTER);
    // 해는 땅 위에 떠 있다 (낮).
    expect(env.lightDirection[1]).toBeGreaterThan(0.5);
  });
});

describe('초원 바람', () => {
  it('세기가 잔잔함과 거셈 사이를 오간다', () => {
    const samples = Array.from({ length: 800 }, (_, i) => windStrength(i * 0.25));
    expect(Math.min(...samples)).toBeCloseTo(WIND.calm, 2);
    expect(Math.max(...samples)).toBeGreaterThan(0.95);
  });

  it('방향은 단위 벡터이고 기본 방향 둘레에서 흔들린다', () => {
    for (let t = 0; t < WIND.headingPeriod; t += 5) {
      const [x, z] = windDirection(t);
      expect(Math.hypot(x, z)).toBeCloseTo(1, 6);
      expect(x * Math.cos(WIND.heading) + z * Math.sin(WIND.heading)).toBeGreaterThan(Math.cos(WIND.headingSwing) - 1e-9);
    }
  });

  it('첫 화면에서 바람이 불고, 돌풍 띠가 앞으로 나아간다', () => {
    const wind = new Wind();
    expect(wind.frame(1).strength).toBeGreaterThan(0.5);
    for (let i = 0; i < 120; i++) wind.step(1 / 120);
    const after = wind.frame(1);
    expect(after.gustTravel).toBeGreaterThan(WIND.gustSpeed[0] * 0.99);
    expect(after.time).toBeCloseTo(WIND.startTime + 1, 6);
    expect(wind.frame(0.5).gustTravel).toBeLessThan(after.gustTravel);
  });
});
