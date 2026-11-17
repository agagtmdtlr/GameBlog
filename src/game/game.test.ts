import { describe, expect, it } from 'vitest';
import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES, DEFAULT_PLANET_COLOR } from '../content/registry';
import type { GraphicsContent } from '../content/types';
import { cross, dot, length, normalize, scale, sub, type Vec3 } from '../engine/math';
import { CameraRig } from './cameraRig';
import { ColorTransition } from './colorTransition';
import { PLANET, surfaceDirection } from './planet';
import { Player, PLAYER_RADIUS, type MoveCommand } from './player';
import { PressurePlate } from './pressurePlate';
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

  it('+X로 구르면 윗면이 진행 방향으로 회전한다', () => {
    const player = new Player(TOP);
    simulate(player, 0.1);
    const start = player.orientation;
    player.velocity = [1, 0, 0];
    player.step(DT, IDLE, PLANET);
    expect(player.orientation).not.toEqual(start);
    // 작은 회전에서 쿼터니언 벡터부는 회전축 방향을 가리키며, +X 구름의 축은 -Z다.
    expect(player.orientation[2]).toBeLessThan(0);
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

describe('발판', () => {
  const R = PLAYER_RADIUS;

  it('구가 닿으면 한 번만 작동한다', () => {
    const plate = new PressurePlate([0, 0, 0], [0, 1, 0], 1.4);
    expect(plate.update(DT, [0, R, 0], R)).toBe(true);
    for (let i = 0; i < 100; i++) expect(plate.update(DT, [0, R, 0], R)).toBe(false);
  });

  it('공중의 구는 작동시키지 않는다', () => {
    const plate = new PressurePlate([0, 0, 0], [0, 1, 0], 1.4);
    expect(plate.update(DT, [0, R + 1, 0], R)).toBe(false);
  });

  it('제자리에서 튀어도 다시 작동하지 않는다', () => {
    const plate = new PressurePlate([0, 0, 0], [0, 1, 0], 1.4);
    plate.update(DT, [0, R, 0], R);
    plate.update(DT, [0, R + 1, 0], R);
    expect(plate.update(DT, [0, R, 0], R)).toBe(false);
  });

  it('경계를 오가도 완전히 벗어나기 전에는 작동하지 않는다', () => {
    const plate = new PressurePlate([0, 0, 0], [0, 1, 0], 1.4);
    plate.update(DT, [1.3, R, 0], R);
    plate.update(DT, [1.5, R, 0], R);
    expect(plate.update(DT, [1.3, R, 0], R)).toBe(false);
  });

  it('완전히 벗어난 뒤 돌아오면 다시 작동한다', () => {
    const plate = new PressurePlate([0, 0, 0], [0, 1, 0], 1.4);
    plate.update(DT, [0, R, 0], R);
    plate.update(DT, [3, R, 0], R);
    expect(plate.update(DT, [0, R, 0], R)).toBe(true);
  });

  it('행성 반대편에 있는 구는 작동시키지 않는다', () => {
    const plate = new PressurePlate([0, PLANET.radius, 0], [0, 1, 0], 1.4);
    expect(plate.update(DT, [0, -REST_DISTANCE, 0], R)).toBe(false);
    expect(plate.update(DT, [0, REST_DISTANCE, 0], R)).toBe(true);
  });

  it('눌림 값은 밟으면 1로, 떠나면 0으로 돌아간다', () => {
    const plate = new PressurePlate([0, 0, 0], [0, 1, 0], 1.4);
    for (let i = 0; i < 120; i++) plate.update(DT, [0, R, 0], R);
    expect(plate.depression).toBeGreaterThan(0.95);
    for (let i = 0; i < 240; i++) plate.update(DT, [5, R, 0], R);
    expect(plate.depression).toBeLessThan(0.05);
  });
});

describe('색 전환', () => {
  it('지정한 시간 뒤 목표 색에 도달한다', () => {
    const transition = new ColorTransition([0, 0, 0], 0.3);
    transition.setTarget([1, 0, 0]);
    transition.update(0.15);
    expect(transition.current[0]).toBeCloseTo(0.5);
    transition.update(0.15);
    expect(transition.current).toEqual([1, 0, 0]);
  });

  it('전환 도중 목표가 바뀌면 현재 색에서 이어간다', () => {
    const transition = new ColorTransition([0, 0, 0], 0.3);
    transition.setTarget([1, 0, 0]);
    transition.update(0.15);
    transition.setTarget([0, 1, 0]);
    expect(transition.current[0]).toBeCloseTo(0.5);
    transition.update(0.01);
    expect(transition.current[0]).toBeGreaterThan(0.4);
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
  const ctx = { planet: { setSurfaceColor: () => {} } };

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
  type Entry = (typeof CONTENT_ENTRIES)[number];
  const find = (id: string): Entry => CONTENT_ENTRIES.find((e) => e.content.id === id)!;
  const directionOf = ({ plate }: Entry): Vec3 => surfaceDirection(plate.latitude, plate.longitude);

  /** 발판을 향해 표면을 따라 굴러간다. */
  function rollTo(world: World, entry: Entry): void {
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

  it('처음에는 기본색 콘텐츠가 켜져 있다', () => {
    const world = new World();
    expect(world.content.activeId).toBe('color-default');
    expect(world.currentPlanetColor).toEqual(DEFAULT_PLANET_COLOR);
  });

  it('구는 행성 꼭대기에서 시작한다', () => {
    const world = new World();
    expect(world.player.position).toEqual(TOP);
  });

  it('발판은 서로 겹치지 않고 시작 지점을 덮지 않는다', () => {
    const surfaceDistance = (a: Vec3, b: Vec3): number =>
      Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * PLANET.radius;
    CONTENT_ENTRIES.forEach((entry, i) => {
      expect(Math.abs(entry.plate.latitude)).toBeLessThanOrEqual(90);
      expect(surfaceDistance(directionOf(entry), [0, 1, 0])).toBeGreaterThan(3.4);
      CONTENT_ENTRIES.slice(i + 1).forEach((other) => {
        expect(surfaceDistance(directionOf(entry), directionOf(other))).toBeGreaterThan(3.4);
      });
    });
  });

  it('모든 발판은 해가 드는 쪽에 있다', () => {
    for (const entry of CONTENT_ENTRIES) {
      expect(dot(directionOf(entry), STUDIO_ENVIRONMENT.lightDirection)).toBeGreaterThan(0.25);
    }
  });

  it('발판까지 굴러가면 행성 표면의 색이 바뀌고, 기본 발판으로 돌아오면 복귀한다', () => {
    const world = new World();
    const coral = find('color-coral');

    rollTo(world, coral);
    expect(world.content.activeId).toBe('color-coral');
    for (let i = 0; i < 60; i++) world.fixedStep(DT, IDLE);
    const expectColor = (actual: Vec3, expected: Vec3): void =>
      actual.forEach((c, i) => expect(c).toBeCloseTo(expected[i], 9));
    expectColor(world.currentPlanetColor, coral.plate.color);
    const [planet] = world.buildDrawList(1);
    expectColor(planet.material.baseColor, coral.plate.color);

    rollTo(world, find('color-default'));
    expect(world.content.activeId).toBe('color-default');
    for (let i = 0; i < 60; i++) world.fixedStep(DT, IDLE);
    expectColor(world.currentPlanetColor, DEFAULT_PLANET_COLOR);
  });

  it('발판을 밟아도 플레이어 구의 재질은 바뀌지 않는다', () => {
    const world = new World();
    const playerMaterial = () => world.buildDrawList(1).at(-1)!.material;
    const before = playerMaterial();
    rollTo(world, find('color-blue'));
    for (let i = 0; i < 60; i++) world.fixedStep(DT, IDLE);
    expect(world.content.activeId).toBe('color-blue');
    expect(playerMaterial()).toEqual(before);
  });
});
