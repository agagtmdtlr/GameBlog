import { describe, expect, it } from 'vitest';
import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES, DEFAULT_SPHERE_COLOR } from '../content/registry';
import type { GraphicsContent } from '../content/types';
import type { Vec3 } from '../engine/math';
import { ColorTransition } from './colorTransition';
import { Player, PLAYER_RADIUS, type MoveCommand } from './player';
import { PressurePlate } from './pressurePlate';
import { World } from './world';

const DT = 1 / 120;
const IDLE: MoveCommand = { direction: [0, 0, 0], jumpPressed: false };
const FLOOR = [{ min: [-500, -1, -500] as Vec3, max: [500, 0, 500] as Vec3 }];

function simulate(player: Player, seconds: number, command: MoveCommand = IDLE): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) player.step(DT, command, FLOOR);
}

describe('구 조작', () => {
  it('떨어지면 튕긴 뒤 바닥에 안정된다', () => {
    const player = new Player([0, 3, 0]);
    simulate(player, 3);
    expect(player.grounded).toBe(true);
    expect(player.position[1]).toBeCloseTo(PLAYER_RADIUS, 2);
    expect(Math.abs(player.velocity[1])).toBeLessThan(0.3);
  });

  it('점프는 접지 상태에서만 된다', () => {
    const player = new Player([0, PLAYER_RADIUS, 0]);
    simulate(player, 0.1);
    player.step(DT, { direction: [0, 0, 0], jumpPressed: true }, FLOOR);
    expect(player.velocity[1]).toBeGreaterThan(5);

    simulate(player, 0.25);
    expect(player.grounded).toBe(false);
    const before = player.velocity[1];
    player.step(DT, { direction: [0, 0, 0], jumpPressed: true }, FLOOR);
    expect(player.velocity[1]).toBeLessThan(before);
  });

  it('착지 직전에 누른 점프도 입력을 잃지 않는다', () => {
    const player = new Player([0, PLAYER_RADIUS + 0.05, 0]);
    player.step(DT, { direction: [0, 0, 0], jumpPressed: true }, FLOOR);
    simulate(player, 0.09);
    expect(player.velocity[1]).toBeGreaterThan(5);
  });

  it('이동 입력이 속도를 만들고 최고 속도에서 수렴한다', () => {
    const player = new Player([0, PLAYER_RADIUS, 0]);
    simulate(player, 5, { direction: [1, 0, 0], jumpPressed: false });
    const speed = player.velocity[0];
    simulate(player, 1, { direction: [1, 0, 0], jumpPressed: false });
    expect(speed).toBeGreaterThan(8);
    expect(player.velocity[0]).toBeCloseTo(speed, 3);
  });

  it('+X로 구르면 윗면이 진행 방향으로 회전한다', () => {
    const player = new Player([0, PLAYER_RADIUS, 0]);
    simulate(player, 0.1);
    const start = player.orientation;
    player.velocity = [1, 0, 0];
    player.step(DT, IDLE, FLOOR);
    expect(player.orientation).not.toEqual(start);
    // 작은 회전에서 쿼터니언 벡터부는 회전축 방향을 가리키며, +X 구름의 축은 -Z다.
    expect(player.orientation[2]).toBeLessThan(0);
  });
});

describe('발판', () => {
  const R = PLAYER_RADIUS;

  it('구가 닿으면 한 번만 작동한다', () => {
    const plate = new PressurePlate(0, 0, 1.4);
    expect(plate.update(DT, [0, R, 0], R)).toBe(true);
    for (let i = 0; i < 100; i++) expect(plate.update(DT, [0, R, 0], R)).toBe(false);
  });

  it('공중의 구는 작동시키지 않는다', () => {
    const plate = new PressurePlate(0, 0, 1.4);
    expect(plate.update(DT, [0, R + 1, 0], R)).toBe(false);
  });

  it('제자리에서 튀어도 다시 작동하지 않는다', () => {
    const plate = new PressurePlate(0, 0, 1.4);
    plate.update(DT, [0, R, 0], R);
    plate.update(DT, [0, R + 1, 0], R);
    expect(plate.update(DT, [0, R, 0], R)).toBe(false);
  });

  it('경계를 오가도 완전히 벗어나기 전에는 작동하지 않는다', () => {
    const plate = new PressurePlate(0, 0, 1.4);
    plate.update(DT, [1.3, R, 0], R);
    plate.update(DT, [1.5, R, 0], R);
    expect(plate.update(DT, [1.3, R, 0], R)).toBe(false);
  });

  it('완전히 벗어난 뒤 돌아오면 다시 작동한다', () => {
    const plate = new PressurePlate(0, 0, 1.4);
    plate.update(DT, [0, R, 0], R);
    plate.update(DT, [3, R, 0], R);
    expect(plate.update(DT, [0, R, 0], R)).toBe(true);
  });

  it('눌림 값은 밟으면 1로, 떠나면 0으로 돌아간다', () => {
    const plate = new PressurePlate(0, 0, 1.4);
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
  const ctx = { sphere: { setColor: () => {} } };

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
  function rollTo(world: World, x: number, z: number): void {
    for (let i = 0; i < 1200; i++) {
      const [px, , pz] = world.player.position;
      const dx = x - px;
      const dz = z - pz;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.3) return;
      world.fixedStep(DT, { direction: [dx / distance, 0, dz / distance], jumpPressed: false });
    }
  }

  it('처음에는 기본색 콘텐츠가 켜져 있다', () => {
    const world = new World();
    expect(world.content.activeId).toBe('color-default');
    expect(world.currentSphereColor).toEqual(DEFAULT_SPHERE_COLOR);
  });

  it('모든 발판은 벽 안쪽에 있고 서로 겹치지 않는다', () => {
    CONTENT_ENTRIES.forEach(({ plate }, i) => {
      expect(Math.abs(plate.x)).toBeLessThan(13);
      expect(Math.abs(plate.z)).toBeLessThan(13);
      CONTENT_ENTRIES.slice(i + 1).forEach((other) => {
        expect(Math.hypot(plate.x - other.plate.x, plate.z - other.plate.z)).toBeGreaterThan(3.4);
      });
    });
  });

  it('발판까지 굴러가면 구의 색이 바뀌고, 기본 발판으로 돌아오면 복귀한다', () => {
    const world = new World();
    const coral = CONTENT_ENTRIES.find((e) => e.content.id === 'color-coral')!;
    const fallback = CONTENT_ENTRIES.find((e) => e.content.id === 'color-default')!;

    rollTo(world, coral.plate.x, coral.plate.z);
    expect(world.content.activeId).toBe('color-coral');
    for (let i = 0; i < 60; i++) world.fixedStep(DT, IDLE);
    expect(world.currentSphereColor).toEqual(coral.plate.color);

    rollTo(world, fallback.plate.x, fallback.plate.z);
    expect(world.content.activeId).toBe('color-default');
  });

  it('벽이 구를 가둔다', () => {
    const world = new World();
    for (let i = 0; i < 1200; i++) world.fixedStep(DT, { direction: [1, 0, 0], jumpPressed: false });
    expect(world.player.position[0]).toBeLessThan(16);
    expect(world.player.position[1]).toBeCloseTo(PLAYER_RADIUS, 1);
  });

  it('밖으로 떨어지면 시작 지점으로 돌아간다', () => {
    const world = new World();
    world.player.position = [30, 0, 0];
    world.fixedStep(DT, IDLE);
    for (let i = 0; i < 240; i++) world.fixedStep(DT, IDLE);
    expect(Math.abs(world.player.position[0])).toBeLessThan(16);
  });
});
