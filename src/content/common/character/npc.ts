import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from '../../../engine/math';
import type { Ground, Obstacle } from '../../../engine/physics/collision';
import { PLAYER_RADIUS, Player, type MoveCommand } from './player';
import { CHARACTER_SCALE, Walker, type WalkerHip } from './walker';

/** NPC가 걸을 때 내는 힘. 플레이어 최대 입력(1)보다 작아 산책하듯 걷는다. */
const WANDER_EFFORT = 0.32;
/** 한 번에 걸어갈 표면 거리 범위 */
const MIN_LEG_DISTANCE = 4 * CHARACTER_SCALE;
const MAX_LEG_DISTANCE = 9 * CHARACTER_SCALE;
/** 목표까지 이 표면 거리 안이면 도착으로 본다. */
const ARRIVE_DISTANCE = 0.6 * CHARACTER_SCALE;
/** 도착한 뒤 서서 쉬는 시간 범위 (초) */
const MIN_PAUSE = 1.2;
const MAX_PAUSE = 3.5;
/** 걸으려는데 이보다 느린 상태가 `STUCK_SECONDS` 동안 이어지면 막힌 것으로 보고 다른 곳으로 간다. */
const STUCK_SPEED = 0.6;
const STUCK_SECONDS = 0.8;
/** 한 목표를 향해 걷는 최대 시간. 넘으면 포기하고 쉰다. */
const MAX_WALK_SECONDS = 12;

/** 플레이어 몸 중심이 이 거리 안으로 들어오면 인사한다. 몸이 맞닿는 거리(2.64)보다 조금 멀다. */
export const GREET_DISTANCE = 3 * CHARACTER_SCALE;
/** 인사하는 중에는 이 거리보다 멀어져야 그친다. 경계에서 말풍선이 깜빡이지 않게 한다. */
export const GREET_LEAVE_DISTANCE = 4 * CHARACTER_SCALE;
/** 말풍선이 나타나는 시간과 사라지는 시간 (초) */
const GREET_SHOW_SECONDS = 0.3;
const GREET_HIDE_SECONDS = 0.2;

const IDLE: MoveCommand = { direction: [0, 0, 0] };

/** 0 이상 1 미만의 난수를 내는 함수 */
export type Random = () => number;

/** 시드로 같은 순서의 난수를 내는 작은 생성기 (mulberry32). 테스트에서 쓴다. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 행성 위를 돌아다니는 NPC. 플레이어와 같은 물리 몸체(`Player`)와 걸음(`Walker`)을 쓰고,
 * 입력 대신 스스로 목표 지점을 골라 걸어갔다가 잠깐 서서 쉬기를 되풀이한다.
 *
 * `World.fixedStep`이 `move` → 몸끼리 밀어내기 → `animate` 순서로 부른다.
 */
export class Wanderer {
  readonly body: Player;
  readonly walker: Walker;
  /** 걸어가는 목표의 표면 방향 (행성 중심 기준 단위 벡터). 쉬는 중이면 null이다. */
  target: Vec3 | null = null;

  /** 플레이어에게 인사하는 중인지. 인사하는 동안은 멈춰 선다. */
  greeting = false;
  /** 말풍선이 나타난 정도 0~1. 인사하면 1로, 그치면 0으로 일정하게 움직인다. */
  greetAmount = 0;
  previousGreetAmount = 0;

  private pause: number;
  private walkTime = 0;
  private slowTime = 0;

  constructor(
    spawn: Vec3,
    private readonly ground: Ground,
    private readonly random: Random = Math.random,
    hip?: WalkerHip,
  ) {
    this.body = new Player(spawn);
    this.walker = new Walker(spawn, ground, undefined, hip);
    this.pause = this.between(MIN_PAUSE, MAX_PAUSE);
  }

  /** 플레이어가 가까이 왔는지 보고 인사를 시작하거나 그친다. `move` 전에 부른다. */
  notice(dt: number, playerPosition: Vec3): void {
    const distance = length(sub(playerPosition, this.body.position));
    this.greeting = distance < (this.greeting ? GREET_LEAVE_DISTANCE : GREET_DISTANCE);
    this.previousGreetAmount = this.greetAmount;
    const rate = this.greeting ? 1 / GREET_SHOW_SECONDS : -1 / GREET_HIDE_SECONDS;
    this.greetAmount = Math.min(1, Math.max(0, this.greetAmount + rate * dt));
  }

  /** 렌더링 보간이 적용된 말풍선의 나타난 정도 */
  greetAmountAt(alpha: number): number {
    return this.previousGreetAmount + (this.greetAmount - this.previousGreetAmount) * alpha;
  }

  /** 다음 행동을 정하고 물리 몸체를 움직인다. */
  move(dt: number, obstacles: readonly Obstacle[] = []): void {
    this.body.step(dt, this.decide(dt), this.ground, obstacles);
  }

  /** 물리 결과로 걸음 자세를 진행한다. */
  animate(dt: number): void {
    this.walker.step(dt, this.body);
  }

  private decide(dt: number): MoveCommand {
    if (this.greeting) {
      // 인사하는 동안 멈춰 선다. 다시 걸을 때 멈춘 시간을 막힘이나 시간 초과로 세지 않는다.
      this.walkTime = 0;
      this.slowTime = 0;
      return IDLE;
    }
    if (!this.target) {
      this.pause -= dt;
      if (this.pause > 0) return IDLE;
      this.pickTarget();
    }
    const target = this.target!;
    const up = this.upAt(this.body.position);
    const toward = sub(target, scale(up, dot(target, up)));
    const remaining = Math.acos(Math.min(1, Math.max(-1, dot(up, target)))) * this.ground.radius;

    this.walkTime += dt;
    const speed = length(sub(this.body.velocity, scale(up, dot(this.body.velocity, up))));
    this.slowTime = speed < STUCK_SPEED && this.walkTime > STUCK_SECONDS ? this.slowTime + dt : 0;

    if (remaining < ARRIVE_DISTANCE || this.walkTime > MAX_WALK_SECONDS || length(toward) < 1e-6) {
      this.rest(MIN_PAUSE, MAX_PAUSE);
      return IDLE;
    }
    if (this.slowTime > STUCK_SECONDS) {
      // 벽이나 다른 캐릭터에 막혔다. 잠깐 서 있다가 다른 곳을 고른다.
      this.rest(MIN_PAUSE * 0.5, MIN_PAUSE);
      return IDLE;
    }
    return { direction: scale(normalize(toward), WANDER_EFFORT) };
  }

  /** 지금 위치에서 아무 방향으로 정해진 거리만큼 떨어진 표면 지점을 고른다. */
  private pickTarget(): void {
    const up = this.upAt(this.body.position);
    const helper: Vec3 = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const east = normalize(cross(helper, up));
    const north = cross(up, east);
    const angle = this.random() * Math.PI * 2;
    const heading = add(scale(east, Math.cos(angle)), scale(north, Math.sin(angle)));
    const arc = this.between(MIN_LEG_DISTANCE, MAX_LEG_DISTANCE) / this.ground.radius;
    this.target = normalize(add(scale(up, Math.cos(arc)), scale(heading, Math.sin(arc))));
    this.walkTime = 0;
    this.slowTime = 0;
  }

  private rest(min: number, max: number): void {
    this.target = null;
    this.pause = this.between(min, max);
  }

  private between(min: number, max: number): number {
    return min + (max - min) * this.random();
  }

  private upAt(p: Vec3): Vec3 {
    return normalize(sub(p, this.ground.center));
  }
}

/**
 * 겹친 두 캐릭터 몸체를 반씩 밀어내고, 서로 다가가는 속도를 없앤다.
 * 둘 다 `PLAYER_RADIUS`의 구이며 튕기지 않는다.
 */
export function separateBodies(a: Player, b: Player): void {
  const delta = sub(b.position, a.position);
  const distance = length(delta);
  const overlap = PLAYER_RADIUS * 2 - distance;
  if (overlap <= 0) return;
  const normal: Vec3 = distance > 1e-9 ? scale(delta, 1 / distance) : [1, 0, 0];
  a.position = add(a.position, scale(normal, -overlap / 2));
  b.position = add(b.position, scale(normal, overlap / 2));
  const closing = dot(sub(b.velocity, a.velocity), normal);
  if (closing >= 0) return;
  a.velocity = add(a.velocity, scale(normal, closing / 2));
  b.velocity = add(b.velocity, scale(normal, -closing / 2));
}
