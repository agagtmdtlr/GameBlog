import { describe, expect, it } from 'vitest';
import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES } from '../content/registry';
import { MAX_SURFACE_ZONES } from '../engine/frame';
import type { ContentEntry, GraphicsContent } from '../content/types';
import { cross, dot, length, normalize, scale, sub, type Vec3 } from '../engine/math';
import { CameraRig } from './cameraRig';
import { boxModel, HOUSE, houseBox } from './house';
import { PLANET, surfaceDirection } from './planet';
import { Player, PLAYER_RADIUS, type MoveCommand } from './player';
import { SurfaceZone } from './surfaceZone';
import { MOON } from './moon';
import { SUN } from './sun';
import { STUDIO_ENVIRONMENT, World } from './world';

const DT = 1 / 120;
const IDLE: MoveCommand = { direction: [0, 0, 0] };
/** 구의 중심이 표면에 놓였을 때 행성 중심까지의 거리 */
const REST_DISTANCE = PLANET.radius + PLAYER_RADIUS;
const TOP: Vec3 = [0, REST_DISTANCE, 0];

function simulate(player: Player, seconds: number, command: MoveCommand = IDLE): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) player.step(DT, command, PLANET);
}

/** Z축을 도는 대원을 따라 +X 쪽으로 나아가는 방향 */
function alongEquator(position: Vec3): Vec3 {
  return normalize(cross(position, [0, 0, 1]));
}

describe('구 조작', () => {
  it('떨어지면 튕긴 뒤 표면에 안정된다', () => {
    const player = new Player([0, REST_DISTANCE + 2.35, 0]);
    simulate(player, 3);
    expect(player.grounded).toBe(true);
    expect(length(player.position)).toBeCloseTo(REST_DISTANCE, 2);
    expect(Math.abs(player.velocity[1])).toBeLessThan(0.3);
  });

  it('중력은 어디서나 행성 중심을 향한다', () => {
    const player = new Player([-(REST_DISTANCE + 2), 0, 0]);
    player.step(DT, IDLE, PLANET);
    expect(player.velocity[0]).toBeGreaterThan(0);
    simulate(player, 3);
    expect(player.grounded).toBe(true);
    expect(player.position[0]).toBeCloseTo(-REST_DISTANCE, 2);
  });

  it('이동 입력이 속도를 만들고 최고 속도에서 수렴한다', () => {
    const player = new Player(TOP);
    const roll = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        player.step(DT, { direction: alongEquator(player.position) }, PLANET);
      }
    };
    roll(5);
    const speed = length(player.velocity);
    roll(1);
    expect(speed).toBeGreaterThan(8);
    expect(length(player.velocity)).toBeCloseTo(speed, 3);
  });

  it('행성을 한 바퀴 돌아도 표면에서 떨어지지 않는다', () => {
    const player = new Player(TOP);
    let lowest = Infinity;
    let reachedFarSide = false;
    for (let i = 0; i < 20 / DT; i++) {
      player.step(DT, { direction: alongEquator(player.position) }, PLANET);
      lowest = Math.min(lowest, player.position[1]);
      if (lowest < -REST_DISTANCE + 1 && player.position[1] > REST_DISTANCE - 1) reachedFarSide = true;
      expect(Math.abs(length(player.position) - REST_DISTANCE)).toBeLessThan(0.05);
    }
    expect(reachedFarSide).toBe(true);
  });

  it('표면에 수직인 입력은 구를 움직이지 않는다', () => {
    const player = new Player(TOP);
    simulate(player, 1, { direction: [0, 1, 0] });
    expect(length(sub(player.position, TOP))).toBeLessThan(1e-6);
  });

});

describe('카메라', () => {
  it('구가 행성 어디에 있든 화면의 위쪽은 표면의 바깥 방향이다', () => {
    const camera = new CameraRig(TOP, PLANET.center);
    const side: Vec3 = [REST_DISTANCE, 0, 0];
    for (let i = 0; i < 600; i++) camera.follow(side, 1 / 60);
    expect(camera.view.up[0]).toBeCloseTo(1, 3);
    expect(dot(camera.forward, camera.view.up)).toBeCloseTo(0, 5);
    expect(dot(camera.right, camera.view.up)).toBeCloseTo(0, 5);
    expect(length(camera.forward)).toBeCloseTo(1, 5);
  });

  it('마우스를 오른쪽으로 움직이면 오른쪽으로 돈다', () => {
    const camera = new CameraRig(TOP, PLANET.center);
    const right = camera.right;
    camera.applyLook(100, 0);
    expect(dot(camera.forward, right)).toBeGreaterThan(0.1);
  });
});

describe('작동 영역', () => {
  const RADIUS = 1.5 / PLANET.radius;
  const MARGIN = PLAYER_RADIUS / PLANET.radius;
  const zone = (): SurfaceZone => new SurfaceZone([0, 1, 0], RADIUS, MARGIN);
  /** 영역 중심에서 표면을 따라 `distance`만큼 떨어진 곳에 놓인 구의 중심 */
  const at = (distance: number, height = REST_DISTANCE): Vec3 => {
    const angle = distance / PLANET.radius;
    return [Math.sin(angle) * height, Math.cos(angle) * height, 0];
  };

  it('구가 영역 안으로 들어오면 한 번만 작동한다', () => {
    const z = zone();
    expect(z.update(at(2), PLANET.center)).toBe(false);
    expect(z.update(at(1.4), PLANET.center)).toBe(true);
    for (let i = 0; i < 100; i++) expect(z.update(at(0), PLANET.center)).toBe(false);
  });

  it('영역 위의 공중에 있어도 작동한다', () => {
    expect(zone().update(at(0, REST_DISTANCE + 2), PLANET.center)).toBe(true);
  });

  it('경계를 오가도 충분히 벗어나기 전에는 다시 작동하지 않는다', () => {
    const z = zone();
    z.update(at(1.4), PLANET.center);
    z.update(at(1.6), PLANET.center);
    expect(z.update(at(1.4), PLANET.center)).toBe(false);
  });

  it('충분히 벗어난 뒤 돌아오면 다시 작동한다', () => {
    const z = zone();
    z.update(at(0), PLANET.center);
    z.update(at(3), PLANET.center);
    expect(z.update(at(0), PLANET.center)).toBe(true);
  });

  it('행성 반대편에 있는 구는 작동시키지 않는다', () => {
    const z = zone();
    expect(z.update([0, -REST_DISTANCE, 0], PLANET.center)).toBe(false);
    expect(z.contains([0, -REST_DISTANCE, 0], PLANET.center)).toBe(false);
    expect(z.contains(TOP, PLANET.center)).toBe(true);
  });
});

describe('콘텐츠 관리', () => {
  function fakeContent(id: string, log: string[]): GraphicsContent {
    return {
      id,
      label: id,
      activate: () => log.push(`+${id}`),
      deactivate: () => log.push(`-${id}`),
    };
  }
  const ctx = {};

  it('새 콘텐츠를 켜기 전에 이전 콘텐츠를 끈다', () => {
    const log: string[] = [];
    const manager = new ContentManager(ctx, [fakeContent('a', log), fakeContent('b', log)]);
    manager.activate('a');
    manager.activate('b');
    expect(log).toEqual(['+a', '-a', '+b']);
  });

  it('같은 콘텐츠를 다시 켜면 아무 일도 하지 않는다', () => {
    const log: string[] = [];
    const manager = new ContentManager(ctx, [fakeContent('a', log)]);
    manager.activate('a');
    manager.activate('a');
    expect(log).toEqual(['+a']);
  });

  it('id가 중복되면 바로 알린다', () => {
    const log: string[] = [];
    expect(() => new ContentManager(ctx, [fakeContent('a', log), fakeContent('a', log)])).toThrow();
  });
});

describe('월드 통합', () => {
  const directionOf = ({ zone }: ContentEntry): Vec3 => surfaceDirection(zone.latitude, zone.longitude);

  /** 시험용 콘텐츠 두 개. 켜고 끈 순서를 `log`에 남긴다. */
  function testEntries(log: string[]): ContentEntry[] {
    const entry = (id: string, latitude: number, longitude: number): ContentEntry => ({
      content: {
        id,
        label: id,
        activate: () => log.push(`+${id}`),
        deactivate: () => log.push(`-${id}`),
      },
      zone: { latitude, longitude, color: [1, 0, 0] },
    });
    return [entry('a', 35, 60), entry('b', -5, 115)];
  }

  /** 영역을 향해 표면을 따라 굴러간다. */
  function rollTo(world: World, entry: ContentEntry): void {
    const target = scale(directionOf(entry), REST_DISTANCE);
    for (let i = 0; i < 2400; i++) {
      const position = world.player.position;
      const toTarget = sub(target, position);
      if (length(toTarget) < 0.3) return;
      const up = normalize(position);
      const direction = normalize(sub(toTarget, scale(up, dot(toTarget, up))));
      world.fixedStep(DT, { direction });
    }
  }

  it('처음에는 켜진 콘텐츠가 없다', () => {
    expect(new World().content.activeId).toBeNull();
    expect(new World(testEntries([])).content.activeId).toBeNull();
  });

  it('구는 행성 꼭대기에서 시작한다', () => {
    const world = new World();
    expect(world.player.position).toEqual(TOP);
  });

  it('영역은 서로 겹치지 않고 시작 지점을 덮지 않는다', () => {
    const surfaceDistance = (a: Vec3, b: Vec3): number =>
      Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * PLANET.radius;
    CONTENT_ENTRIES.forEach((entry, i) => {
      expect(Math.abs(entry.zone.latitude)).toBeLessThanOrEqual(90);
      expect(surfaceDistance(directionOf(entry), [0, 1, 0])).toBeGreaterThan(3.4);
      CONTENT_ENTRIES.slice(i + 1).forEach((other) => {
        expect(surfaceDistance(directionOf(entry), directionOf(other))).toBeGreaterThan(3.4);
      });
    });
  });

  it('영역 수는 렌더러가 그릴 수 있는 만큼이다', () => {
    expect(CONTENT_ENTRIES.length).toBeLessThanOrEqual(MAX_SURFACE_ZONES);
  });

  it('모든 영역은 해가 드는 쪽에 있다', () => {
    for (const entry of CONTENT_ENTRIES) {
      expect(dot(directionOf(entry), STUDIO_ENVIRONMENT.lightDirection)).toBeGreaterThan(0.25);
    }
  });

  it('구가 올라선 영역만 강조되고, 켜진 영역은 빛난다', () => {
    const entries = testEntries([]);
    const world = new World(entries);
    rollTo(world, entries[1]);
    // 멈추지 않고 영역 위에 있는 동안 0.3초를 보낸다.
    const p = world.player.position;
    for (let i = 0; i < 36; i++) {
      world.player.position = p;
      world.player.velocity = [0, 0, 0];
      world.fixedStep(DT, IDLE);
    }
    const [other, target] = world.buildSurfaceZones();
    expect(target.presence).toBeGreaterThan(0.8);
    expect(target.glow).toBeGreaterThan(0.8);
    expect(other.presence).toBeLessThan(0.2);
    expect(other.glow).toBeLessThan(0.2);
  });

  it('영역까지 굴러가면 그 콘텐츠가 켜지고, 다른 영역으로 가면 바뀐다', () => {
    const log: string[] = [];
    const entries = testEntries(log);
    const world = new World(entries);
    rollTo(world, entries[0]);
    expect(world.content.activeId).toBe('a');
    rollTo(world, entries[1]);
    expect(world.content.activeId).toBe('b');
    expect(log).toEqual(['+a', '-a', '+b']);
  });

  it('영역을 밟아도 행성과 캐릭터의 재질은 바뀌지 않는다', () => {
    const entries = testEntries([]);
    const world = new World(entries);
    const materials = () => world.buildDrawList(1).map((item) => item.material);
    const before = materials();
    rollTo(world, entries[0]);
    for (let i = 0; i < 60; i++) world.fixedStep(DT, IDLE);
    expect(world.content.activeId).toBe('a');
    expect(materials()).toEqual(before);
  });
});

describe('집 자리', () => {
  const up = surfaceDirection(HOUSE.latitude, HOUSE.longitude);
  const surfaceDistance = (a: Vec3, b: Vec3): number =>
    Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * PLANET.radius;

  it('시작 지점을 덮지 않고, 시작할 때 바라보는 쪽 가까이에 있다', () => {
    const distance = surfaceDistance(up, [0, 1, 0]);
    expect(distance).toBeGreaterThan(HOUSE.size[2] + PLAYER_RADIUS);
    expect(distance).toBeLessThan(10);
  });

  it('해가 드는 쪽에 있다', () => {
    expect(dot(up, STUDIO_ENVIRONMENT.lightDirection)).toBeGreaterThan(0.25);
  });

  it('바닥이 표면에 닿고, 위쪽이 표면 바깥을 향한다', () => {
    const m = boxModel(houseBox());
    const center: Vec3 = [m[12], m[13], m[14]];
    const axisY: Vec3 = [m[4], m[5], m[6]];
    expect(dot(normalize(axisY), up)).toBeCloseTo(1, 6);
    const bottom = length(center) - HOUSE.size[1] / 2;
    expect(bottom).toBeLessThan(PLANET.radius);
    expect(bottom).toBeGreaterThan(PLANET.radius - 0.3);
  });

  it('걸어서 상자를 통과할 수 없다', () => {
    const world = new World();
    const box = houseBox();
    const [, , halfDepth] = box.halfExtents;
    // 시작할 때 바라보는 쪽(-Z)으로 상자를 지나칠 만큼 걷는다.
    let closest = Infinity;
    for (let i = 0; i < 120 * 4; i++) {
      const position = world.player.position;
      const up = normalize(position);
      const forward = normalize(sub(box.center, scale(up, dot(box.center, up))));
      world.fixedStep(DT, { direction: forward });
      const front = dot(sub(world.player.position, box.center), box.axes[2]);
      closest = Math.min(closest, front);
    }
    // 정면까지 와서 부딪혔고, 구의 중심은 정면에서 반지름 이상 떨어져 있다.
    expect(closest).toBeLessThan(halfDepth + PLAYER_RADIUS + 0.1);
    expect(closest).toBeGreaterThan(halfDepth + PLAYER_RADIUS - 0.05);
    expect(length(world.player.position)).toBeCloseTo(REST_DISTANCE, 1);
  });

  it('월드 그리기 목록에 상자로 들어간다', () => {
    const boxes = new World().buildDrawList(1).filter((item) => item.mesh === 'box');
    expect(boxes).toHaveLength(1);
  });
});

describe('해', () => {
  const stepWorld = (world: World, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) world.fixedStep(DT, IDLE);
  };
  const sunItem = (world: World) => world.buildDrawList(1).find((item) => item.material.emissive[0] > 0)!;
  const sunCenter = (world: World): Vec3 => [sunItem(world).model[12], sunItem(world).model[13], sunItem(world).model[14]];

  it('시작할 때 직사광은 기본 조명 방향이다', () => {
    const world = new World();
    expect(dot(world.environment(1).lightDirection, STUDIO_ENVIRONMENT.lightDirection)).toBeCloseTo(1, 6);
  });

  it('직사광은 언제나 행성 중심에서 해 구체를 향한다', () => {
    const world = new World();
    for (let i = 0; i < 6; i++) {
      stepWorld(world, SUN.periodSeconds / 7);
      const center = sunCenter(world);
      expect(length(center)).toBeCloseTo(SUN.orbitRadius, 4);
      expect(dot(normalize(center), world.environment(1).lightDirection)).toBeCloseTo(1, 6);
    }
  });

  it('행성 둘레를 돌아 한 주기 뒤 제자리로 온다', () => {
    const world = new World();
    stepWorld(world, SUN.periodSeconds / 2);
    expect(dot(world.environment(1).lightDirection, STUDIO_ENVIRONMENT.lightDirection)).toBeCloseTo(-1, 3);
    stepWorld(world, SUN.periodSeconds / 2);
    expect(dot(world.environment(1).lightDirection, STUDIO_ENVIRONMENT.lightDirection)).toBeCloseTo(1, 3);
  });

  it('시작 지점의 머리 위를 지난다', () => {
    const world = new World();
    let highest = -1;
    for (let i = 0; i < 240; i++) {
      stepWorld(world, SUN.periodSeconds / 240);
      highest = Math.max(highest, world.environment(1).lightDirection[1]);
    }
    expect(highest).toBeGreaterThan(0.999);
  });

  it('궤적 고리는 해가 지나는 궤도와 같은 원이고 그림자를 드리우지 않는다', () => {
    const world = new World();
    const ring = world.buildDrawList(1).find((item) => item.mesh === 'ring')!;
    expect(ring.castShadow).toBe(false);
    const m = ring.model;
    // 고리 위의 점 (cos t, sin t, 0)을 옮겨 해 궤도 위에 있는지 본다.
    const normal = normalize(world.sun.axis);
    for (let t = 0; t < 2 * Math.PI; t += 0.7) {
      const p: Vec3 = [
        m[0] * Math.cos(t) + m[4] * Math.sin(t) + m[12],
        m[1] * Math.cos(t) + m[5] * Math.sin(t) + m[13],
        m[2] * Math.cos(t) + m[6] * Math.sin(t) + m[14],
      ];
      expect(length(p)).toBeCloseTo(SUN.orbitRadius, 4);
      expect(dot(p, normal)).toBeCloseTo(0, 4);
    }
    for (let i = 0; i < 5; i++) {
      stepWorld(world, SUN.periodSeconds / 6);
      expect(dot(world.sun.position(1), normal)).toBeCloseTo(0, 4);
    }
  });

  it('햇살은 해를 감싸고, 카메라 쪽을 보며 화면 위쪽에 맞춰 선다', () => {
    const world = new World();
    stepWorld(world, SUN.periodSeconds / 5);
    const view = { position: [6, 30, -9] as Vec3, up: normalize([0.1, 1, 0.2]) };
    const rays = world.buildDrawList(1, view).find((item) => item.mesh === 'sunRays')!;
    const m = rays.model;
    const center: Vec3 = [m[12], m[13], m[14]];
    const x: Vec3 = [m[0], m[1], m[2]];
    const y: Vec3 = [m[4], m[5], m[6]];
    const z: Vec3 = [m[8], m[9], m[10]];
    expect(length(sub(center, world.sun.position(1)))).toBeCloseTo(0, 4);
    expect(length(x)).toBeCloseTo(SUN.radius, 4);
    expect(dot(normalize(z), normalize(sub(view.position, center)))).toBeCloseTo(1, 4);
    expect(dot(x, view.up)).toBeCloseTo(0, 4);
    expect(dot(y, view.up)).toBeGreaterThan(0);
    expect(rays.castShadow).toBe(false);
  });

  it('그림자를 드리우지 않는다', () => {
    expect(sunItem(new World()).castShadow).toBe(false);
  });
});

describe('위성', () => {
  const moonItem = (world: World) => world.buildDrawList(1).find((item) => item.mesh === 'moon')!;

  it('행성과 해의 궤도에서 떨어진 고정된 자리에서 자전한다', () => {
    const world = new World();
    const before = moonItem(world).model.slice();
    for (let i = 0; i < Math.round(MOON.spinPeriodSeconds / 4 / DT); i++) world.fixedStep(DT, IDLE);
    const after = moonItem(world).model;
    // 자리는 그대로
    expect([after[12], after[13], after[14]]).toEqual([before[12], before[13], before[14]]);
    // 4분의 1바퀴 돌았으므로 자전축에 수직인 축은 방향이 바뀐다.
    expect(Math.abs(after[0] - before[0]) + Math.abs(after[2] - before[2])).toBeGreaterThan(0.5);

    const center: Vec3 = [after[12], after[13], after[14]];
    expect(length(center) - MOON.radius * 1.25).toBeGreaterThan(PLANET.radius + 10);
    // 해 궤도면에서 해 반지름과 위성 반지름보다 멀다.
    expect(Math.abs(dot(center, normalize(world.sun.axis)))).toBeGreaterThan(SUN.radius + MOON.radius * 1.25);
  });

  it('그림자를 드리우지 않는다', () => {
    expect(moonItem(new World()).castShadow).toBe(false);
  });
});
