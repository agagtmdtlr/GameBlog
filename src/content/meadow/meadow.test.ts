import { describe, expect, it } from 'vitest';
import { dot, length, normalize, sub } from '../../engine/math';
import { groundNormal, groundRadius } from '../../engine/physics/collision';
import { PLAYER_RADIUS } from '../common/character/player';
import { keepInside, MEADOW, MEADOW_CENTER, MEADOW_GROUND, meadowHeight, meadowPoint } from './objects/meadowTerrain';
import { Lightning, LIGHTNING, lightningStrike, strikeFlash } from './objects/lightning';
import { RAIN, rainVelocity } from './objects/rain';
import { growScale, SKY_TVS, SkyTvField, skyTvAt } from './objects/skyTvs';
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

describe('하늘 텔레비전', () => {
  const at = (x: number, z: number) => meadowPoint(x, z, PLAYER_RADIUS);
  const horizontal = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[2] - b[2]);

  it('같은 칸은 늘 같은 텔레비전이다', () => {
    expect(skyTvAt(1, 3, -7)).toEqual(skyTvAt(1, 3, -7));
    expect(skyTvAt(0, 3, -7)).not.toEqual(skyTvAt(0, 4, -7));
  });

  it('크기·높이·회전이 정한 범위 안이다', () => {
    let filled = 0;
    for (let layer = 0; layer < SKY_TVS.layers.length; layer++) {
      for (let ix = -10; ix < 10; ix++) {
        for (let iz = -10; iz < 10; iz++) {
          const tv = skyTvAt(layer, ix, iz);
          if (!tv) continue;
          filled++;
          expect(tv.size).toBeGreaterThanOrEqual(SKY_TVS.size[0]);
          expect(tv.size).toBeLessThanOrEqual(SKY_TVS.size[1]);
          expect(Math.hypot(...tv.rotation)).toBeCloseTo(1, 6);
          // 높이를 더하면 수평 자리도 h/R만큼 바깥으로 밀리므로 비탈에서 조금 어긋난다.
          const ground = meadowPoint(tv.position[0], tv.position[2]);
          const altitude = length(sub(tv.position, MEADOW_CENTER)) - length(sub(ground, MEADOW_CENTER));
          expect(altitude).toBeGreaterThan(SKY_TVS.layers[layer].altitude[0] - 1.5);
          expect(altitude).toBeLessThan(SKY_TVS.layers[layer].altitude[1] + 1.5);
        }
      }
    }
    const total = SKY_TVS.layers.length * 400;
    expect(filled / total).toBeGreaterThan(SKY_TVS.fill - 0.08);
    expect(filled / total).toBeLessThan(SKY_TVS.fill + 0.08);
  });

  it('플레이어 둘레에 스폰하고, 멀어지면 없앤다', () => {
    const field = new SkyTvField();
    const first = field.update(at(0, 0), 0);
    expect(first.spawned).toBeGreaterThan(300);
    for (const tv of field.tvs) expect(horizontal(tv.position, [0, 0, 0])).toBeLessThan(SKY_TVS.despawnRadius);

    const keysBefore = new Set([...field.tvs].map((tv) => tv.key));
    const player = at(120, -60);
    const moved = field.update(player, 10);
    expect(moved.spawned).toBeGreaterThan(0);
    expect(moved.despawned).toBeGreaterThan(0);
    for (const tv of field.tvs) {
      expect(horizontal(tv.position, player)).toBeLessThanOrEqual(SKY_TVS.despawnRadius);
      // 새로 스폰한 것만 새 시각을 갖는다.
      expect(tv.spawnedAt).toBe(keysBefore.has(tv.key) ? 0 : 10);
    }
    // 같은 자리에서 다시 불러도 바뀌지 않는다.
    expect(field.update(player, 11)).toEqual({ spawned: 0, despawned: 0 });
  });

  it('돌아오면 같은 자리에 같은 텔레비전이 있다', () => {
    const field = new SkyTvField();
    field.update(at(0, 0), 0);
    const original = new Map([...field.tvs].map((tv) => [tv.key, tv.position]));
    field.update(at(400, 0), 1);
    field.update(at(0, 0), 2);
    for (const tv of field.tvs) if (original.has(tv.key)) expect(tv.position).toEqual(original.get(tv.key));
    expect(field.count).toBe(original.size);
  });

  it('스폰되면 커지며 나타난다', () => {
    expect(growScale(0)).toBeCloseTo(0, 6);
    expect(growScale(SKY_TVS.growSeconds)).toBeCloseTo(1, 6);
    expect(growScale(Infinity)).toBeCloseTo(1, 6);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((k) => growScale(k * SKY_TVS.growSeconds)))).toBeGreaterThan(1);
  });

  it('월드가 플레이어를 따라 하늘 텔레비전을 스폰한다', () => {
    const world = new MeadowWorld();
    expect(world.skyTvs.count).toBeGreaterThan(300);
    for (const tv of world.skyTvList()) expect(growScale(world.time - tv.spawnedAt)).toBe(1);
  });
});

describe('비', () => {
  it('빗줄기가 아래로 떨어지고 바람 방향으로 밀리며, 바람이 셀수록 더 비스듬하다', () => {
    const calm = rainVelocity({ direction: [0.6, -0.8], strength: 0, gustTravel: 0, time: 0 });
    const gusty = rainVelocity({ direction: [0.6, -0.8], strength: 1, gustTravel: 0, time: 0 });
    expect(calm[1]).toBe(-RAIN.fallSpeed);
    expect(Math.hypot(calm[0], calm[2])).toBeCloseTo(RAIN.drift[0], 6);
    expect(Math.hypot(gusty[0], gusty[2])).toBeCloseTo(RAIN.drift[1], 6);
    expect(gusty[0] / gusty[2]).toBeCloseTo(0.6 / -0.8, 6);
    // 가장 거센 바람에도 빗줄기는 수직에서 45도보다 덜 기운다.
    expect(Math.hypot(gusty[0], gusty[2])).toBeLessThan(RAIN.fallSpeed);
  });
});

describe('번개', () => {
  it('같은 번호의 번개는 늘 같고, 플레이어 둘레 정해진 거리와 구름 높이에서 친다', () => {
    const player = MEADOW_SPAWN;
    for (let i = 0; i < 40; i++) {
      const a = lightningStrike(i, 10, player);
      expect(lightningStrike(i, 10, player)).toEqual(a);
      const distance = Math.hypot(a.cloud[0] - player[0], a.cloud[2] - player[2]);
      expect(distance).toBeGreaterThan(LIGHTNING.distance[0] - 1);
      expect(distance).toBeLessThan(LIGHTNING.distance[1] + 1);
      expect(a.cloud[1]).toBeGreaterThan(LIGHTNING.cloudHeight[0] - 30);
      if (a.bolt.length > 0) {
        expect(a.bolt).toHaveLength(LIGHTNING.segments + 1);
        expect(a.bolt[0]).toEqual(a.cloud);
        // 줄기는 땅까지 내려온다.
        expect(a.bolt[a.bolt.length - 1][1]).toBeLessThan(a.cloud[1] - 40);
      } else {
        expect(a.branches).toHaveLength(0);
      }
    }
  });

  it('번쩍임은 치는 순간 가장 밝고, 잦아들어 끝난다', () => {
    const strike = lightningStrike(3, 5, MEADOW_SPAWN);
    expect(strikeFlash(strike, 4.9)).toBe(0);
    expect(strikeFlash(strike, 5)).toBe(1);
    expect(strikeFlash(strike, 5 + LIGHTNING.duration + 0.01)).toBe(0);
    for (const { offset, strength } of strike.pulses) expect(strikeFlash(strike, 5 + offset + 1e-9)).toBeGreaterThanOrEqual(strength - 1e-6);
  });

  it('번개는 정해진 간격으로 치고, 칠 때 초원이 번개 쪽에서 밝아진다', () => {
    const lightning = new Lightning();
    let strikes = 0;
    let last: unknown;
    for (let t = 0; t < 120; t += 1 / 60) {
      lightning.step(t, MEADOW_SPAWN);
      if (lightning.current !== last) {
        strikes++;
        last = lightning.current;
      }
    }
    expect(strikes).toBeGreaterThanOrEqual(120 / LIGHTNING.interval[1] - 1);
    expect(strikes).toBeLessThanOrEqual(120 / LIGHTNING.interval[0] + 1);

    const world = new MeadowWorld();
    const calm = world.environment(1);
    while (world.lightningFlash() < 0.9) world.fixedStep(1 / 60, { direction: [0, 0, 0] });
    const lit = world.environment(1);
    expect(lit.lightColor[0]).toBeGreaterThan(calm.lightColor[0] * 2);
    expect(lit.background[2]).toBeGreaterThan(calm.background[2]);
    const toward = world.lightning.direction(world.player.position)!;
    expect(dot(lit.lightDirection, toward)).toBeGreaterThan(dot(calm.lightDirection, toward));
  });
});
