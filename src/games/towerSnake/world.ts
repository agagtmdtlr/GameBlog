import { GridSnake, LEFT_OF, RIGHT_OF, sameCell, type Cell, type Direction } from '../../lib/gridSnake';
import { Combat, type CombatEvent, type Projectile } from './combat';
import { createEnemy, ENEMY_SPECS, FLASH_SECONDS, HEAD_RADIUS, KNOCK_SPEED, moveEnemies, type Enemy, type EnemyType, type Point } from './enemies';
import type { Random } from './random';
import { SpatialGrid } from './spatialGrid';
import { pickTower, START_TOWER, type TowerType } from './towers';
import { BOSS_SECONDS, BOSS_SPLIT, GROUP_SPREAD, MAX_ENEMIES, pickEnemy, SPAWN_MAX, SPAWN_MIN, WAVE_SECONDS, waveSize } from './waves';

export type { Cell, Direction } from '../../lib/gridSnake';

/** 판 한 변의 칸 수 (D1: 큰 판) */
export const BOARD = 41;
/** 처음 타워 마디 수 (머리 빼고) */
export const START_SEGMENTS = 3;
/** 타워 마디 수 한계 (머리 빼고, D4) */
export const MAX_SEGMENTS = 40;
/** 뱀이 나아가는 빠르기 (초당 칸, 일정) */
export const SPEED = 5;
/** 피해를 받은 뒤 무적 시간 (초) */
export const INVULNERABLE_SECONDS = 1;
/** 판에 늘 있는 타워 상자 수 */
export const BOX_COUNT = 4;
/** 새 상자는 머리에서 이 칸 수보다 멀리 생긴다 (가로·세로 중 먼 쪽) */
export const BOX_MIN_DISTANCE = 6;
/** 적이 움직이는 고정 간격 (초) */
export const ENEMY_STEP = 1 / 60;
/** 머리에 부딪힌 적이 받는 피해 (적 최대 체력의 비율) */
export const HEAD_DAMAGE = 0.5;

/** 피해의 원인 */
export type DamageCause = 'wall' | 'self' | 'enemy';

/** 판 위의 타워 상자. 먹으면 그 타워 마디가 꼬리에 붙는다. */
export interface TowerBox {
  readonly cell: Cell;
  readonly type: TowerType;
}

/** 피해를 주려 한 결과 */
export interface Hurt {
  /** 실제로 피해를 받았는지 (무적이면 `false`) */
  readonly applied: boolean;
  /** 잃은 꼬리 마디 자리 */
  readonly lost: Cell | null;
  /** 잃은 꼬리 마디의 타워 */
  readonly lostTower: TowerType | null;
  /** 머리만 남은 채로 피해를 받아 끝났는지 */
  readonly over: boolean;
}

/** 상자를 먹은 결과 */
export interface Eat {
  readonly box: TowerBox;
  /** 마디가 한계라서 꼬리 끝 타워를 바꿨는지 (늘지 않음) */
  readonly replaced: boolean;
  /** 먹어서 새로 생긴 상자 */
  readonly spawned: TowerBox | null;
}

/** 한 칸 나아간 결과 */
export interface TickEvent {
  readonly kind: 'tick';
  /** 나아가기 전 몸 (그리기가 칸 사이를 잇는 데 쓴다) */
  readonly before: readonly Cell[];
  /** 무엇에 부딪혔는지. 부딪히지 않았으면 `null` (무적이라 피해가 없어도 적는다) */
  readonly hit: DamageCause | null;
  readonly hurt: Hurt | null;
  /** 울타리에 닿아 저절로 꺾었는지 */
  readonly turned: boolean;
  readonly eat: Eat | null;
}

/** 적이 머리에 부딪혀 피해를 준 결과 (무적이라 피해가 없으면 생기지 않는다) */
export interface BumpEvent {
  readonly kind: 'bump';
  readonly hurt: Hurt;
  readonly enemy: Enemy;
  /** 그 적이 부딪힌 피해로 처치됐는지 */
  readonly killed: boolean;
}

/** 적이 처치됐다 (그리기가 그 자리에서 색종이처럼 터뜨린다) */
export interface KillEvent {
  readonly kind: 'kill';
  readonly type: EnemyType;
  readonly x: number;
  readonly y: number;
}

export type WorldEvent = TickEvent | BumpEvent | CombatEvent | KillEvent;

/** 가로·세로 중 먼 쪽의 칸 거리 */
const reach = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * 타워 뱀 한 판의 상태: 판, 움직임, 울타리·제 몸 피해, 타워 상자, 적, 자동 공격, 연출 이벤트.
 * 몸 움직임은 공용 `GridSnake`가 맡고, 여기서는 울타리에서 꺾기, 제 몸 지나가기, 마디 잃기, 무적, 끝, 상자 먹기, 적 무리, 타워 공격(`Combat`)을 정한다.
 * `update(dt)`로 시간을 받아 `SPEED`마다 한 칸 나아가고, 적은 `ENEMY_STEP`마다 움직인다.
 */
export class TowerSnakeWorld {
  readonly snake = new GridSnake({ width: BOARD, height: BOARD });
  /** 마디마다의 타워. `towers[i]`는 머리에서 `i + 1`번째 마디(`body[i + 1]`)의 타워다. */
  towers: TowerType[] = [];
  boxes: TowerBox[] = [];
  enemies: Enemy[] = [];
  /** 이번 판에서 처치한 적 수 */
  killed = 0;
  /** 논 시간 (초) */
  time = 0;
  /** 나아간 칸 수 */
  ticks = 0;
  /** 남은 무적 시간 (초) */
  invulnerable = 0;
  alive = true;
  /** 이번 판에서 가장 길었던 타워 마디 수 */
  longest = START_SEGMENTS;
  /** 이번 판에서 먹은 타워 상자 수 (종류별) */
  eaten: Record<TowerType, number> = { arrow: 0, cannon: 0, ice: 0, lightning: 0 };
  /** 이번 칸에서 흐른 시간 (초) */
  private pending = 0;
  /** 적의 다음 걸음까지 모인 시간 (초) */
  private enemyPending = 0;
  /** 다음 무리, 다음 큰 녀석이 나오는 때 (초) */
  private nextWave = WAVE_SECONDS;
  private nextBoss = BOSS_SECONDS;
  private nextId = 1;
  /** 지난 칸의 몸. 지금 몸과 `alpha`로 이어 마디의 실제 자리를 낸다 (그리기와 같다). */
  private previous: Cell[] = [];
  private readonly grid = new SpatialGrid<Enemy>(BOARD);
  private readonly combat = new Combat();
  /** `update` 동안 처치 이벤트를 넣을 곳 */
  private sink: WorldEvent[] | null = null;

  constructor(private readonly random: Random = Math.random) {
    this.reset();
  }

  reset(): void {
    const mid = Math.floor(BOARD / 2);
    this.snake.place(
      Array.from({ length: START_SEGMENTS + 1 }, (_, i) => ({ x: mid - i, y: mid })),
      'right',
    );
    this.towers = Array.from({ length: START_SEGMENTS }, () => START_TOWER);
    this.time = 0;
    this.ticks = 0;
    this.invulnerable = 0;
    this.alive = true;
    this.longest = START_SEGMENTS;
    this.eaten = { arrow: 0, cannon: 0, ice: 0, lightning: 0 };
    this.pending = 0;
    this.previous = this.body.map((c) => ({ ...c }));
    this.enemies = [];
    this.killed = 0;
    this.combat.reset();
    this.enemyPending = 0;
    this.nextWave = WAVE_SECONDS;
    this.nextBoss = BOSS_SECONDS;
    this.nextId = 1;
    this.boxes = [];
    while (this.boxes.length < BOX_COUNT) {
      const box = this.spawnBox();
      if (!box) break;
      this.boxes.push(box);
    }
  }

  /** 머리부터 꼬리까지 */
  get body(): Cell[] {
    return this.snake.body;
  }

  get head(): Cell {
    return this.snake.head;
  }

  /** 타워 마디 수 (머리 빼고) */
  get segments(): number {
    return this.snake.body.length - 1;
  }

  /** 이번 칸으로 나아간 정도 (0~1) */
  get alpha(): number {
    return Math.min(1, this.pending * SPEED);
  }

  /** 방향을 받아 둔다. 받아들였으면 `true`. */
  turn(direction: Direction): boolean {
    if (!this.alive) return false;
    return this.snake.turn(direction);
  }

  /** 날아가는 투사체 */
  get projectiles(): readonly Projectile[] {
    return this.combat.projectiles;
  }

  /** `i`번째 마디(0은 머리)의 지금 자리. 지난 칸과 이번 칸 사이를 `alpha`로 잇는다. */
  point(i: number): Point {
    const to = this.body[i];
    const from = this.previous[i] ?? this.previous[this.previous.length - 1] ?? to;
    const a = this.alpha;
    return { x: from.x + (to.x - from.x) * a, y: from.y + (to.y - from.y) * a };
  }

  /** 시간을 `dt`초 흘린다. 그동안 일어난 일(칸마다, 적이 부딪힐 때마다)을 일어난 차례로 돌려준다. */
  update(dt: number): WorldEvent[] {
    const events: WorldEvent[] = [];
    this.sink = events;
    let remaining = dt;
    // 다음 칸까지 잘라 가며 흘려서, 적이 보는 머리 자리가 칸 사이에서도 맞게 한다.
    while (this.alive && remaining > 1e-9) {
      const span = Math.min(remaining, Math.max(0, 1 / SPEED - this.pending));
      remaining -= span;
      this.time += span;
      this.invulnerable = Math.max(0, this.invulnerable - span);
      this.pending += span;
      this.advanceEnemies(span, events);
      if (this.alive && this.pending >= 1 / SPEED - 1e-9) {
        this.pending = Math.max(0, this.pending - 1 / SPEED);
        events.push(this.tick());
      }
    }
    this.sink = null;
    return events;
  }

  /** 적을 바로 놓는다 (개발 확인과 테스트용). */
  spawnEnemy(type: EnemyType, x: number, y: number): Enemy {
    const enemy = createEnemy(this.nextId++, type, x, y);
    this.enemies.push(enemy);
    return enemy;
  }

  /**
   * 적에게 피해를 준다. 처치했으면 `true`. 살아남으면 잠깐 번쩍이고, 처치하면 `update`가 돌려줄 이벤트에 `kill`을 넣는다.
   * 큰 녀석은 처치되면 젤리로 갈라진다.
   */
  damageEnemy(enemy: Enemy, amount: number): boolean {
    enemy.hp -= amount;
    if (enemy.hp > 0) {
      enemy.flash = FLASH_SECONDS;
      return false;
    }
    const index = this.enemies.indexOf(enemy);
    if (index >= 0) this.enemies.splice(index, 1);
    this.killed++;
    this.sink?.push({ kind: 'kill', type: enemy.type, x: enemy.x, y: enemy.y });
    if (enemy.type === 'boss') {
      for (let i = 0; i < BOSS_SPLIT; i++) {
        const angle = (i / BOSS_SPLIT) * Math.PI * 2;
        this.spawnEnemy('jelly', enemy.x + Math.cos(angle) * 0.5, enemy.y + Math.sin(angle) * 0.5);
      }
    }
    return true;
  }

  /** 한 칸 나아간다. */
  tick(): TickEvent {
    const before = this.snake.body.map((c) => ({ ...c }));
    this.previous = before;
    const snake = this.snake;
    // 받아 둔 방향이 울타리 쪽이면 버린다 (D3).
    if (snake.queued.length > 0 && !snake.inside(snake.ahead(snake.nextDirection))) snake.clearQueue();
    let direction = snake.takeDirection();
    let next = snake.ahead(direction);
    let hit: DamageCause | null = null;
    let turned = false;
    if (!snake.inside(next)) {
      // 울타리: 오른쪽으로 꺾고, 모서리라 오른쪽도 막혔으면 왼쪽으로 (D3).
      hit = 'wall';
      turned = true;
      direction = snake.inside(snake.ahead(RIGHT_OF[direction])) ? RIGHT_OF[direction] : LEFT_OF[direction];
      snake.direction = direction;
      next = snake.ahead(direction);
    }
    const boxIndex = this.boxes.findIndex((b) => sameCell(b.cell, next));
    // 제 몸: 지나가며 마디를 잃는다. 꺾은 칸이 몸이어도 피해는 한 번이다.
    // 먹는 칸에서는 꼬리가 빠지지 않지만, 상자는 몸 위에 생기지 않으므로 판정은 같다.
    if (hit === null && snake.bodyHit(next, boxIndex >= 0) >= 0) hit = 'self';
    this.ticks++;
    const hurt = hit ? this.hurt(hit) : null;
    if (hurt?.over) return { kind: 'tick', before, hit, hurt, turned, eat: null };
    const eat = boxIndex >= 0 ? this.eat(boxIndex, next) : null;
    if (!eat) snake.moveTo(next, false);
    return { kind: 'tick', before, hit, hurt, turned, eat };
  }

  /**
   * 피해를 준다. 무적이면 아무 일도 없다. 머리만 남았으면 판이 끝나고, 아니면 꼬리 끝 마디(와 그 타워)를 잃고 무적이 된다 (D2).
   */
  hurt(_cause: DamageCause): Hurt {
    if (!this.alive || this.invulnerable > 0) return { applied: false, lost: null, lostTower: null, over: false };
    if (this.segments === 0) {
      this.alive = false;
      return { applied: true, lost: null, lostTower: null, over: true };
    }
    const [lost] = this.snake.shrink(1);
    const lostTower = this.towers.pop() ?? null;
    this.invulnerable = INVULNERABLE_SECONDS;
    return { applied: true, lost, lostTower, over: false };
  }

  /** 몸과 타워를 바로 놓는다 (개발 확인과 테스트용). 타워를 주지 않으면 모두 화살이다. */
  load(body: readonly Cell[], direction: Direction, towers?: readonly TowerType[], boxes?: readonly TowerBox[]): void {
    this.snake.place(body, direction);
    this.towers = towers ? [...towers] : Array.from({ length: body.length - 1 }, () => START_TOWER);
    if (this.towers.length !== this.segments) throw new Error('타워 수가 마디 수와 다릅니다.');
    if (boxes) this.boxes = boxes.map((b) => ({ cell: { ...b.cell }, type: b.type }));
    this.previous = this.body.map((c) => ({ ...c }));
    this.invulnerable = 0;
    this.alive = true;
    this.pending = 0;
    this.longest = Math.max(this.longest, this.segments);
  }

  /** 적을 `span`초 움직인다: 무리 만들기, 움직이기, 머리와 부딪히기, 타워 공격. 고정 간격으로 나눠 돈다. */
  private advanceEnemies(span: number, events: WorldEvent[]): void {
    this.enemyPending += span;
    while (this.alive && this.enemyPending >= ENEMY_STEP - 1e-9) {
      this.enemyPending -= ENEMY_STEP;
      while (this.time >= this.nextWave) {
        this.spawnWave(this.nextWave);
        this.nextWave += WAVE_SECONDS;
      }
      while (this.time >= this.nextBoss) {
        this.spawnGroup(1, () => 'boss', true);
        this.nextBoss += BOSS_SECONDS;
      }
      const head = this.point(0);
      const segments: Point[] = [];
      for (let i = 1; i < this.body.length; i++) segments.push(this.point(i));
      moveEnemies(this.enemies, ENEMY_STEP, head, segments, this.grid, BOARD);
      this.bump(head, events);
      if (!this.alive) return;
      this.combat.step(
        ENEMY_STEP,
        {
          towers: this.towers,
          towerPoint: (i) => segments[i] ?? this.point(i + 1),
          head: this.point(0),
          grid: this.grid,
          damage: (enemy, amount) => this.damageEnemy(enemy, amount),
        },
        events as CombatEvent[],
      );
    }
  }

  /** 머리에 닿은 적을 튕겨 내고 피해를 주고받는다 (계획서 3.5). */
  private bump(head: Point, events: WorldEvent[]): void {
    for (const enemy of [...this.enemies]) {
      const reach = ENEMY_SPECS[enemy.type].radius + HEAD_RADIUS;
      const dx = enemy.x - head.x;
      const dy = enemy.y - head.y;
      const d = Math.hypot(dx, dy);
      if (d >= reach) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const ny = d > 1e-6 ? dy / d : 0;
      enemy.x = head.x + nx * reach;
      enemy.y = head.y + ny * reach;
      enemy.kx = nx * KNOCK_SPEED;
      enemy.ky = ny * KNOCK_SPEED;
      // 무적이면 튕기기만 한다. 무적으로 적을 밀고 다니며 처치하지 못하게 피해도 주지 않는다.
      const hurt = this.hurt('enemy');
      if (!hurt.applied) continue;
      const killed = hurt.over ? false : this.damageEnemy(enemy, enemy.maxHp * HEAD_DAMAGE);
      events.push({ kind: 'bump', hurt, enemy, killed });
      if (hurt.over) return;
    }
  }

  /** 보통 무리 하나 (계획서 3.6의 파도) */
  private spawnWave(time: number): void {
    this.spawnGroup(waveSize(time), () => pickEnemy(time, this.random()));
  }

  /**
   * 머리에서 `SPAWN_MIN`~`SPAWN_MAX`칸 떨어진 판 안의 한 곳에 적 `count`마리를 흩어 놓는다.
   * 보통 무리는 `MAX_ENEMIES`까지만, 큰 녀석(`always`)은 한계와 상관없이 나온다.
   */
  private spawnGroup(count: number, pick: () => EnemyType, always = false): void {
    const n = always ? count : Math.min(count, MAX_ENEMIES - this.enemies.length);
    if (n <= 0) return;
    const head = this.point(0);
    let cx = head.x;
    let cy = head.y;
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const distance = SPAWN_MIN + this.random() * (SPAWN_MAX - SPAWN_MIN);
      cx = head.x + Math.cos(angle) * distance;
      cy = head.y + Math.sin(angle) * distance;
      if (cx >= 0 && cx <= BOARD - 1 && cy >= 0 && cy <= BOARD - 1) break;
    }
    // 둘레가 모두 판 밖이면 판 안으로 당긴다.
    cx = Math.min(BOARD - 1, Math.max(0, cx));
    cy = Math.min(BOARD - 1, Math.max(0, cy));
    for (let i = 0; i < n; i++) {
      const angle = this.random() * Math.PI * 2;
      const r = Math.sqrt(this.random()) * GROUP_SPREAD;
      const x = Math.min(BOARD - 1, Math.max(0, cx + Math.cos(angle) * r));
      const y = Math.min(BOARD - 1, Math.max(0, cy + Math.sin(angle) * r));
      this.spawnEnemy(pick(), x, y);
    }
  }

  /** 상자를 먹고 머리를 그 칸으로 옮긴다. 한계면 늘지 않고 꼬리 끝 타워를 바꾼다 (D4). */
  private eat(index: number, cell: Cell): Eat {
    const [box] = this.boxes.splice(index, 1);
    const replaced = this.segments >= MAX_SEGMENTS;
    this.snake.moveTo(cell, !replaced);
    if (replaced) this.towers[this.towers.length - 1] = box.type;
    else this.towers.push(box.type);
    this.eaten[box.type]++;
    this.longest = Math.max(this.longest, this.segments);
    const spawned = this.spawnBox();
    if (spawned) this.boxes.push(spawned);
    return { box, replaced, spawned };
  }

  /** 뱀·다른 상자가 없고 머리에서 먼 칸에 새 상자. 먼 칸이 없으면 아무 빈 칸, 그것도 없으면 `null` */
  private spawnBox(): TowerBox | null {
    const taken = new Set(this.boxes.map((b) => b.cell.y * BOARD + b.cell.x));
    const free = this.snake.freeCells().filter((i) => !taken.has(i));
    const far = free.filter((i) => reach(this.snake.cellAt(i), this.head) > BOX_MIN_DISTANCE);
    const pool = far.length > 0 ? far : free;
    if (pool.length === 0) return null;
    const cell = this.snake.cellAt(pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))]);
    return { cell, type: pickTower(this.random()) };
  }
}
