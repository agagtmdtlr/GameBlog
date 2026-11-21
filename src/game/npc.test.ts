import { describe, expect, it } from 'vitest';
import { dot, length, normalize, sub } from '../engine/math';
import { sphereVsBox } from '../physics/collision';
import { separateBodies, seededRandom, Wanderer } from './npc';
import { PLANET } from './planet';
import { PLAYER_RADIUS, Player } from './player';
import { SURFACE_OBJECTS } from './surfaceScene';
import { NPC_COLOR, NPC_SPAWN, World } from './world';

const DT = 1 / 120;
const OBSTACLES = SURFACE_OBJECTS.filter((o) => o.collides).map((o) => o.box);
const IDLE = { direction: [0, 0, 0] as [number, number, number] };

describe('돌아다니는 NPC', () => {
  it('시작 위치가 장애물과 플레이어 시작 지점에 겹치지 않는다', () => {
    for (const box of OBSTACLES) expect(sphereVsBox(NPC_SPAWN, PLAYER_RADIUS, box)).toBeNull();
    expect(length(sub(NPC_SPAWN, new World().player.position))).toBeGreaterThan(PLAYER_RADIUS * 4);
  });

  it('쉬다가 목표를 골라 걸어가고, 행성 표면을 벗어나지 않는다', () => {
    const npc = new Wanderer(NPC_SPAWN, PLANET, seededRandom(7));
    let walked = 0;
    let maxSpeed = 0;
    let targets = 0;
    let lastTarget = npc.target;
    for (let i = 0; i < 120 * 40; i++) {
      const before = npc.body.position;
      npc.move(DT, OBSTACLES);
      npc.animate(DT);
      walked += length(sub(npc.body.position, before));
      maxSpeed = Math.max(maxSpeed, length(npc.body.velocity));
      if (npc.target && npc.target !== lastTarget) targets++;
      lastTarget = npc.target;
      if (i > 120) expect(Math.abs(length(npc.body.position) - (PLANET.radius + PLAYER_RADIUS))).toBeLessThan(0.05);
      for (const box of OBSTACLES) expect(sphereVsBox(npc.body.position, PLAYER_RADIUS * 0.95, box)).toBeNull();
    }
    expect(targets).toBeGreaterThanOrEqual(3);
    expect(walked).toBeGreaterThan(20);
    // 산책 속도: 걷기 클립을 쓸 만큼 빠르고 플레이어 최고 속도(약 10.6)보다 느리다.
    expect(maxSpeed).toBeGreaterThan(1.5);
    expect(maxSpeed).toBeLessThan(5);
  });

  it('목표에 다가가면 멈춰 서서 숨쉬기 자세로 돌아간다', () => {
    const npc = new Wanderer(NPC_SPAWN, PLANET, seededRandom(3));
    let rested = false;
    let walkedOnce = false;
    for (let i = 0; i < 120 * 30 && !rested; i++) {
      npc.move(DT, OBSTACLES);
      npc.animate(DT);
      if (npc.walker.walkWeight > 0.9) walkedOnce = true;
      if (walkedOnce && npc.walker.walkWeight < 0.05) rested = true;
    }
    expect(walkedOnce).toBe(true);
    expect(rested).toBe(true);
  });

  it('같은 시드면 같은 길을 걷는다', () => {
    const run = () => {
      const npc = new Wanderer(NPC_SPAWN, PLANET, seededRandom(11));
      for (let i = 0; i < 120 * 10; i++) npc.move(DT, OBSTACLES);
      return npc.body.position;
    };
    expect(run()).toEqual(run());
  });
});

describe('캐릭터끼리 밀어내기', () => {
  it('겹친 두 몸을 떨어뜨리고 다가가는 속도를 없앤다', () => {
    const a = new Player([0, PLANET.radius + PLAYER_RADIUS, 0]);
    const b = new Player([PLAYER_RADIUS, PLANET.radius + PLAYER_RADIUS, 0]);
    a.velocity = [2, 0, 0];
    b.velocity = [-1, 0, 0];
    separateBodies(a, b);
    expect(length(sub(b.position, a.position))).toBeCloseTo(PLAYER_RADIUS * 2, 6);
    const normal = normalize(sub(b.position, a.position));
    expect(dot(sub(b.velocity, a.velocity), normal)).toBeCloseTo(0, 6);
  });

  it('월드에서 플레이어가 NPC를 통과하지 못한다', () => {
    const world = new World(undefined, undefined, seededRandom(1));
    // NPC를 멈춰 세워 두고 플레이어를 그쪽으로 민다.
    let closest = Infinity;
    for (let i = 0; i < 120 * 6; i++) {
      const toward = normalize(sub(world.npc.body.position, world.player.position));
      world.fixedStep(DT, { direction: toward });
      closest = Math.min(closest, length(sub(world.npc.body.position, world.player.position)));
    }
    expect(closest).toBeGreaterThan(PLAYER_RADIUS * 2 - 0.1);
  });
});

describe('NPC 그리기', () => {
  it('플레이어와 같은 몸·다리 항목을 다른 색으로 그린다', () => {
    const items = new World(undefined, undefined, seededRandom(1)).buildDrawList(1);
    const legs = items.filter((item) => item.mesh === 'leg');
    expect(legs).toHaveLength(4);
    expect(legs[2].material.baseColor).toEqual(NPC_COLOR);
    expect(legs[0].material.baseColor).not.toEqual(NPC_COLOR);
    const npcBody = items.filter((item) => item.mesh === 'sphere' && item.material.baseColor === NPC_COLOR);
    expect(npcBody).toHaveLength(1);
  });
});

it('기본 난수의 월드도 NPC를 함께 진행한다', () => {
  const world = new World();
  for (let i = 0; i < 240; i++) world.fixedStep(DT, IDLE);
  expect(Number.isFinite(world.npc.body.position[0])).toBe(true);
});
