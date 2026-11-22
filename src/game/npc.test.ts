import { describe, expect, it } from 'vitest';
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from '../engine/math';
import { GREETINGS } from '../engine/speechBubble';
import { sphereVsBox } from '../physics/collision';
import { GREET_DISTANCE, GREET_LEAVE_DISTANCE, separateBodies, seededRandom, Wanderer } from './npc';
import { PLANET } from './planet';
import { PLAYER_RADIUS, Player } from './player';
import { SURFACE_OBJECTS } from './surfaceScene';
import { BODY_FORMS } from './bodyShape';
import { NPCS, World } from './world';

const DT = 1 / 120;
const OBSTACLES = SURFACE_OBJECTS.filter((o) => o.collides).map((o) => o.box);
const IDLE = { direction: [0, 0, 0] as [number, number, number] };

describe('돌아다니는 NPC', () => {
  it('시작 위치가 장애물, 플레이어, 서로에게 겹치지 않고 색이 모두 다르다', () => {
    expect(NPCS.length).toBeGreaterThan(1);
    const spawns = [new World().player.position, ...NPCS.map((npc) => npc.spawn)];
    for (const spawn of spawns.slice(1)) {
      for (const box of OBSTACLES) expect(sphereVsBox(spawn, PLAYER_RADIUS, box)).toBeNull();
    }
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        expect(length(sub(spawns[i], spawns[j]))).toBeGreaterThan(PLAYER_RADIUS * 4);
      }
    }
    expect(new Set(NPCS.map((npc) => npc.color.join())).size).toBe(NPCS.length);
  });

  it('쉬다가 목표를 골라 걸어가고, 행성 표면을 벗어나지 않는다', () => {
    const npc = new Wanderer(NPCS[0].spawn, PLANET, seededRandom(7));
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
    const npc = new Wanderer(NPCS[0].spawn, PLANET, seededRandom(3));
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
      const npc = new Wanderer(NPCS[0].spawn, PLANET, seededRandom(11));
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
    const world = new World(seededRandom(1));
    const npc = world.npcs[0];
    let closest = Infinity;
    for (let i = 0; i < 120 * 6; i++) {
      const toward = normalize(sub(npc.body.position, world.player.position));
      world.fixedStep(DT, { direction: toward });
      closest = Math.min(closest, length(sub(npc.body.position, world.player.position)));
    }
    expect(closest).toBeGreaterThan(PLAYER_RADIUS * 2 - 0.1);
  });

  it('NPC끼리도 오래 돌아다니는 동안 서로 통과하지 못한다', () => {
    const world = new World(seededRandom(5));
    // 모두 1분 동안 돌아다니게 두고 매 순간 간격을 본다.
    const [a, b] = world.npcs;
    for (let i = 0; i < 120 * 60; i++) {
      world.fixedStep(DT, IDLE);
      for (let x = 0; x < world.npcs.length; x++) {
        for (let y = x + 1; y < world.npcs.length; y++) {
          const gap = length(sub(world.npcs[x].body.position, world.npcs[y].body.position));
          expect(gap).toBeGreaterThan(PLAYER_RADIUS * 2 - 0.1);
        }
      }
    }
    expect(a.body.position).not.toEqual(NPCS[0].spawn);
    expect(b.body.position).not.toEqual(NPCS[1].spawn);
  });
});

describe('NPC 그리기', () => {
  it('NPC마다 제 모양의 몸과 플레이어와 같은 다리를 제 색으로 그린다', () => {
    const items = new World(seededRandom(1)).buildDrawList(1);
    const legs = items.filter((item) => item.mesh === 'leg');
    expect(legs).toHaveLength(2 * (1 + NPCS.length));
    NPCS.forEach((npc, i) => {
      expect(legs[2 + i * 2].material.baseColor).toEqual(npc.color);
      expect(legs[3 + i * 2].material.baseColor).toEqual(npc.color);
      const body = items.filter((item) => item.mesh !== 'leg' && item.material.baseColor === npc.color);
      expect(body).toHaveLength(1);
      expect(body[0].mesh).toBe(BODY_FORMS[npc.shape].mesh);
      expect(legs[0].material.baseColor).not.toEqual(npc.color);
    });
  });
});

it('기본 난수의 월드도 NPC를 함께 진행한다', () => {
  const world = new World();
  for (let i = 0; i < 240; i++) world.fixedStep(DT, IDLE);
  for (const npc of world.npcs) expect(Number.isFinite(npc.body.position[0])).toBe(true);
});

describe('NPC 인사', () => {
  /** NPC 몸에서 표면을 따라 `distance`만큼 옆에 있는 점 */
  const beside = (npc: Wanderer, distance: number): Vec3 => {
    const up = normalize(npc.body.position);
    const side = normalize(cross(up, [1, 0, 0]));
    return add(npc.body.position, scale(side, distance));
  };
  const run = (npc: Wanderer, seconds: number, player: () => Vec3) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      npc.notice(DT, player());
      npc.move(DT, OBSTACLES);
      npc.animate(DT);
    }
  };

  it('플레이어가 멀면 인사하지 않고, 가까이 오면 말풍선을 띄우고 멈춰 선다', () => {
    const npc = new Wanderer(NPCS[0].spawn, PLANET, seededRandom(2));
    run(npc, 5, () => beside(npc, GREET_LEAVE_DISTANCE * 3));
    expect(npc.greeting).toBe(false);
    expect(npc.greetAmount).toBe(0);

    run(npc, 2, () => beside(npc, GREET_DISTANCE * 0.8));
    expect(npc.greeting).toBe(true);
    expect(npc.greetAmount).toBe(1);
    // 지면 감쇠로 서서히 멈춘다.
    expect(length(npc.body.velocity)).toBeLessThan(0.1);
  });

  it('경계 사이에서는 인사를 이어가고, 충분히 멀어지면 말풍선을 거둔다', () => {
    const npc = new Wanderer(NPCS[0].spawn, PLANET, seededRandom(2));
    run(npc, 0.5, () => beside(npc, GREET_DISTANCE * 0.8));
    run(npc, 0.5, () => beside(npc, (GREET_DISTANCE + GREET_LEAVE_DISTANCE) / 2));
    expect(npc.greeting).toBe(true);
    run(npc, 0.1, () => beside(npc, GREET_LEAVE_DISTANCE * 1.5));
    expect(npc.greeting).toBe(false);
    expect(npc.greetAmount).toBeGreaterThan(0);
    run(npc, 0.2, () => beside(npc, GREET_LEAVE_DISTANCE * 1.5));
    expect(npc.greetAmount).toBe(0);
  });

  it('월드에서 가까이 간 NPC 머리 위에만 제 인사말 말풍선이 뜬다', () => {
    const world = new World(seededRandom(4));
    const bubbles = () => world.buildBillboards(1).filter((b) => b.image === 'speechBubble');
    expect(bubbles()).toHaveLength(0);

    const npc = world.npcs[1];
    for (let i = 0; i < 60; i++) {
      world.player.position = beside(npc, GREET_DISTANCE * 0.95);
      world.player.previousPosition = world.player.position;
      world.player.velocity = [0, 0, 0];
      world.fixedStep(DT, IDLE);
    }
    const shown = bubbles();
    expect(shown).toHaveLength(1);
    expect(shown[0].frame).toBe(1 % GREETINGS.length);
    const body = npc.walker.pose(1).body;
    const height = dot(sub(shown[0].position, body), normalize(body));
    expect(height).toBeGreaterThan(BODY_FORMS[NPCS[1].shape].size[1]);
  });
});
