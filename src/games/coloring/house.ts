/**
 * 색칠 놀이의 3D 장면: 해 질 녘 마당에 선 가게 건물 하나와 그 안의 방. 무엇이 어디에 있는지만 정한다 (three.js 없음).
 *
 * - 바깥: 하늘, 해, 땅, 마당, 건물 겉(벽·지붕·창·차양·간판·화분), 문, 가로등, 나무, 벤치, 우체통, 마당을 도는 사람 둘
 * - 안: 바닥·천장·네 벽, 깔개, 탁자, 의자, 소파, 책장, 스탠드, 화분, 그림, 시계
 * - 문을 칠하면 문이 열리고 안으로 들어갈 수 있다. 닫힌 문과 벽은 카메라를 막는다 (`blocked`).
 * - 칠하는 단위는 메시 하나(`PaintPart`)다.
 *
 * 좌표는 미터, y가 위, 건물 가운데가 원점이고 문은 +z 쪽 벽에 있다. 해는 -z 쪽 지평선 조금 위(건물 오른쪽 뒤)다.
 */

export type Vec3 = readonly [number, number, number];

/** 기본 도형 하나. 위치·회전은 조각의 주인 자리 기준 */
export type Solid =
  | { readonly box: Vec3; readonly at: Vec3; readonly rotation?: Vec3 }
  | { readonly cylinder: readonly [top: number, bottom: number, height: number]; readonly at: Vec3; readonly rotation?: Vec3 }
  | { readonly sphere: number; readonly at: Vec3 }
  | { readonly blob: number; readonly at: Vec3 }
  | { readonly capsule: readonly [radius: number, length: number]; readonly at: Vec3 };

/** 조각 모양. 하늘·해·원판은 그리기 쪽이 따로 만들고, 나머지는 기본 도형을 합친다. */
export type PartGeometry =
  | { readonly kind: 'sky' }
  | { readonly kind: 'sun' }
  | { readonly kind: 'disc'; readonly radius: number; readonly y: number }
  | { readonly kind: 'solids'; readonly solids: readonly Solid[] };

/** 어디에 붙어 움직이는지 */
export type PartOwner =
  | { readonly kind: 'static'; readonly position: Vec3; readonly rotationY: number }
  | { readonly kind: 'walker'; readonly index: number }
  /** 문 경첩에 붙어 열릴 때 돈다 */
  | { readonly kind: 'door' };

export interface PaintPart {
  /** 개발·문서용 이름 */
  readonly name: string;
  readonly geometry: PartGeometry;
  readonly owner: PartOwner;
  /** 같은 무리(탁자 상판과 다리 같은)끼리는 이웃이라 같은 색을 되도록 피한다. */
  readonly group: string;
  /** 건물 안에 있는지 */
  readonly inside: boolean;
  /** 칠하면 음영 없이 빛난다 (해, 등, 창) */
  readonly glow?: boolean;
  /** 테두리 선을 두르지 않는다 (아주 크거나 납작한 면) */
  readonly noOutline?: boolean;
}

/** 건물: 바깥 크기(너비 x, 깊이 z), 벽 높이, 벽 두께 */
export const HOUSE = { width: 10, depth: 8, wallHeight: 4.6, wall: 0.3 } as const;
/** 방 안쪽: 반 너비·반 깊이, 천장 높이 */
export const ROOM = { halfX: HOUSE.width / 2 - HOUSE.wall, halfZ: HOUSE.depth / 2 - HOUSE.wall, ceiling: 4.4 } as const;
/** 문: 가운데가 x 0, 너비, 높이, 경첩(왼쪽 끝) 자리, 다 열렸을 때 각도(바깥으로) */
export const DOOR = {
  width: 1.6,
  height: 2.6,
  hinge: [-0.8, 0, HOUSE.depth / 2 - 0.08] as Vec3,
  openAngle: -1.7,
  /** 칠한 뒤 열리기 시작할 때까지, 다 열리는 데 걸리는 시간 (초) */
  delay: 0.35,
  seconds: 1.2,
} as const;

export const SUN_DIRECTION: Vec3 = normalize([0.55, 0.12, -1]);
export const SUN_DISTANCE = 320;
export const SKY_RADIUS = 420;
/** 마당 원판 반지름 */
export const YARD_RADIUS = 13;

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** 문 열림 정도 0~1. `paintedAt`은 문을 처음 칠한 시각(초), 아직이면 `null` */
export function doorOpenness(paintedAt: number | null, time: number): number {
  if (paintedAt === null) return 0;
  const t = Math.max(0, Math.min(1, (time - paintedAt - DOOR.delay) / DOOR.seconds));
  // 처음엔 천천히, 끝에서 살짝 넘쳤다 돌아온다.
  return t < 1 ? 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 0.5) : 1;
}

// ─── 마당을 도는 사람 ───────────────────────────────────

export interface Walker {
  /** 출발 각도 (라디안) */
  readonly start: number;
  /** 초속 (음수면 시계 방향) */
  readonly speed: number;
  /** 원 반지름 */
  readonly radius: number;
  /** 키 배율 */
  readonly height: number;
}

export const WALKERS: readonly Walker[] = [
  { start: 0.4, speed: 1.2, radius: 11, height: 1 },
  { start: 3.6, speed: -1.0, radius: 11.6, height: 0.88 },
];

export interface MoverPose {
  readonly x: number;
  readonly z: number;
  /** 나아가는 방향 (y축 회전, three.js의 rotation.y와 같은 뜻). 0이면 +x, π/2면 -z 쪽 */
  readonly heading: number;
  /** 걸음에 따라 오르내리는 높이 */
  readonly bob: number;
}

export function walkerPose(walker: Walker, time: number): MoverPose {
  const angle = walker.start + (walker.speed * time) / walker.radius;
  const x = walker.radius * Math.cos(angle);
  const z = walker.radius * Math.sin(angle);
  const sign = Math.sign(walker.speed) || 1;
  const dx = -Math.sin(angle) * sign;
  const dz = Math.cos(angle) * sign;
  const steps = (Math.abs(walker.speed) * time) / 0.7;
  return { x, z, heading: Math.atan2(-dz, dx), bob: Math.abs(Math.sin(steps * Math.PI)) * 0.08 };
}

// ─── 칠할 조각 ──────────────────────────────────────────

const at = (position: Vec3, rotationY = 0): PartOwner => ({ kind: 'static', position, rotationY });
const ORIGIN = at([0, 0, 0]);
const solids = (...list: Solid[]): PartGeometry => ({ kind: 'solids', solids: list });

const { width: W, depth: D, wallHeight: H, wall: T } = HOUSE;
const halfDoor = DOOR.width / 2;
const sideWidth = W / 2 - halfDoor;

/** 바깥 조각 */
function outsideParts(): PaintPart[] {
  const parts: PaintPart[] = [
    { name: 'sky', geometry: { kind: 'sky' }, owner: ORIGIN, group: 'sky', inside: false, noOutline: true },
    { name: 'sun', geometry: { kind: 'sun' }, owner: ORIGIN, group: 'sky', inside: false, glow: true },
    { name: 'ground', geometry: { kind: 'disc', radius: SKY_RADIUS * 0.95, y: 0 }, owner: ORIGIN, group: 'ground', inside: false, noOutline: true },
    { name: 'yard', geometry: { kind: 'disc', radius: YARD_RADIUS, y: 0.015 }, owner: ORIGIN, group: 'ground', inside: false, noOutline: true },
    { name: 'walkway', geometry: solids({ box: [2.2, 0.06, 7], at: [0, 0.03, D / 2 + 3.6] }), owner: ORIGIN, group: 'ground', inside: false },
    {
      name: 'facade',
      geometry: solids(
        { box: [W, H, T], at: [0, H / 2, -D / 2 + T / 2] },
        { box: [T, H, D], at: [-W / 2 + T / 2, H / 2, 0] },
        { box: [T, H, D], at: [W / 2 - T / 2, H / 2, 0] },
        { box: [sideWidth, H, T], at: [-(halfDoor + sideWidth / 2), H / 2, D / 2 - T / 2] },
        { box: [sideWidth, H, T], at: [halfDoor + sideWidth / 2, H / 2, D / 2 - T / 2] },
        { box: [DOOR.width, H - DOOR.height, T], at: [0, (H + DOOR.height) / 2, D / 2 - T / 2] },
      ),
      owner: ORIGIN,
      group: 'house',
      inside: false,
    },
    { name: 'roof', geometry: solids({ box: [W + 1, 0.4, D + 1], at: [0, H + 0.2, 0] }), owner: ORIGIN, group: 'house', inside: false },
    {
      name: 'door',
      // 경첩 기준: 문짝과 손잡이
      geometry: solids({ box: [DOOR.width, DOOR.height, 0.08], at: [halfDoor, DOOR.height / 2, 0] }, { sphere: 0.07, at: [DOOR.width - 0.2, 1.2, 0.08] }),
      owner: { kind: 'door' },
      group: 'door',
      inside: false,
    },
    {
      // 문틀: 칠하기 전에도 문이 어디인지 테두리로 드러난다.
      name: 'doorFrame',
      geometry: solids(
        { box: [0.16, DOOR.height + 0.16, 0.22], at: [-halfDoor - 0.08, (DOOR.height + 0.16) / 2, D / 2 + 0.03] },
        { box: [0.16, DOOR.height + 0.16, 0.22], at: [halfDoor + 0.08, (DOOR.height + 0.16) / 2, D / 2 + 0.03] },
        { box: [DOOR.width + 0.32, 0.16, 0.22], at: [0, DOOR.height + 0.08, D / 2 + 0.03] },
        { box: [DOOR.width + 0.6, 0.12, 0.6], at: [0, 0.06, D / 2 + 0.3] },
      ),
      owner: ORIGIN,
      group: 'door',
      inside: false,
    },
    { name: 'awning', geometry: solids({ box: [2.6, 0.12, 1.3], at: [0, 2.95, D / 2 + 0.6], rotation: [0.3, 0, 0] }), owner: ORIGIN, group: 'door', inside: false },
    { name: 'sign', geometry: solids({ box: [3.2, 0.8, 0.12], at: [0, 3.75, D / 2 + 0.06] }), owner: ORIGIN, group: 'house', inside: false },
  ];
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'Left' : 'Right';
    parts.push(
      { name: `window${tag}`, geometry: solids({ box: [1.8, 1.4, 0.08], at: [side * 3, 2.15, D / 2 + 0.04] }), owner: ORIGIN, group: `window${tag}`, inside: false, glow: true },
      { name: `planter${tag}`, geometry: solids({ box: [2, 0.35, 0.4], at: [side * 3, 1.1, D / 2 + 0.2] }), owner: ORIGIN, group: `window${tag}`, inside: false },
      {
        name: `flowers${tag}`,
        geometry: solids(...[-0.7, -0.35, 0, 0.35, 0.7].map((dx, i): Solid => ({ sphere: 0.17, at: [side * 3 + dx, 1.36 + (i % 2) * 0.05, D / 2 + 0.2] }))),
        owner: ORIGIN,
        group: `window${tag}`,
        inside: false,
      },
      { name: `lampPole${tag}`, geometry: solids({ cylinder: [0.08, 0.12, 3.6], at: [0, 1.8, 0] }), owner: at([side * 6.4, 0, 5.4]), group: `lamp${tag}`, inside: false },
      { name: `lampHead${tag}`, geometry: solids({ sphere: 0.3, at: [0, 3.8, 0] }), owner: at([side * 6.4, 0, 5.4]), group: `lamp${tag}`, inside: false, glow: true },
    );
  }
  for (const [i, position] of ([[-8, 0, -3], [7.6, 0, -6.4]] as const).entries()) {
    parts.push(
      { name: `trunk${i}`, geometry: solids({ cylinder: [0.3, 0.42, 3], at: [0, 1.5, 0] }), owner: at(position), group: `tree${i}`, inside: false },
      { name: `crown${i}`, geometry: solids({ blob: 2.4, at: [0, 4.3, 0] }), owner: at(position), group: `tree${i}`, inside: false },
    );
  }
  parts.push(
    {
      name: 'bench',
      geometry: solids(
        { box: [2, 0.1, 0.6], at: [0, 0.5, 0] },
        { box: [2, 0.5, 0.08], at: [0, 0.85, -0.28] },
        { box: [0.1, 0.5, 0.5], at: [-0.85, 0.25, 0] },
        { box: [0.1, 0.5, 0.5], at: [0.85, 0.25, 0] },
      ),
      owner: at([-8.6, 0, 3.4], 0.75),
      group: 'bench',
      inside: false,
    },
    {
      name: 'mailbox',
      geometry: solids({ box: [0.1, 1, 0.1], at: [0, 0.5, 0] }, { box: [0.45, 0.38, 0.6], at: [0, 1.15, 0] }),
      owner: at([2.3, 0, 6.6]),
      group: 'mailbox',
      inside: false,
    },
  );
  WALKERS.forEach((_, index) => {
    const owner: PartOwner = { kind: 'walker', index };
    parts.push(
      { name: `person${index}Body`, geometry: solids({ capsule: [0.28, 0.85], at: [0, 0.72, 0] }), owner, group: `person${index}`, inside: false },
      { name: `person${index}Head`, geometry: solids({ sphere: 0.25, at: [0, 1.6, 0] }), owner, group: `person${index}`, inside: false },
    );
  });
  return parts;
}

/** 방 안 조각 */
function insideParts(): PaintPart[] {
  const { halfX: X, halfZ: Z, ceiling: C } = ROOM;
  // 벽 안쪽 판은 벽 안쪽 면 바로 앞에 얇게 붙여 겉벽 색이 비치지 않게 한다.
  const P = 0.04;
  const room = (name: string, geometry: PartGeometry): PaintPart => ({ name, geometry, owner: ORIGIN, group: 'room', inside: true, noOutline: true });
  const frontSide = X - halfDoor;
  const parts: PaintPart[] = [
    room('floor', solids({ box: [2 * X, P, 2 * Z], at: [0, P / 2, 0] })),
    room('ceiling', solids({ box: [2 * X, P, 2 * Z], at: [0, C - P / 2, 0] })),
    room('wallBack', solids({ box: [2 * X, C, P], at: [0, C / 2, -Z + P / 2] })),
    room('wallLeft', solids({ box: [P, C, 2 * Z], at: [-X + P / 2, C / 2, 0] })),
    room('wallRight', solids({ box: [P, C, 2 * Z], at: [X - P / 2, C / 2, 0] })),
    room(
      'wallFront',
      solids(
        { box: [frontSide, C, P], at: [-(halfDoor + frontSide / 2), C / 2, Z - P / 2] },
        { box: [frontSide, C, P], at: [halfDoor + frontSide / 2, C / 2, Z - P / 2] },
        { box: [DOOR.width, C - DOOR.height, P], at: [0, (C + DOOR.height) / 2, Z - P / 2] },
      ),
    ),
  ];
  const item = (name: string, group: string, geometry: PartGeometry, position: Vec3, rotationY = 0, glow = false): PaintPart => ({
    name,
    geometry,
    owner: at(position, rotationY),
    group,
    inside: true,
    glow,
  });
  const legs = (dx: number, dz: number, height: number, radius: number): Solid[] =>
    [[-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]].map(([x, z]): Solid => ({ cylinder: [radius, radius, height], at: [x, height / 2, z] }));
  const chair = solids(
    { box: [0.5, 0.06, 0.5], at: [0, 0.48, 0] },
    { box: [0.06, 0.62, 0.5], at: [-0.22, 0.82, 0] },
    ...legs(0.2, 0.2, 0.46, 0.03),
  );
  const books: Solid[] = [];
  [0.08, 0.95, 1.8].forEach((shelfY, row) => {
    for (let i = 0, x = -0.85; x < 0.8; i++) {
      const width = 0.12 + ((i * 7 + row * 3) % 5) * 0.03;
      const height = 0.5 + ((i * 5 + row) % 4) * 0.07;
      books.push({ box: [width, height, 0.32], at: [x + width / 2, shelfY + height / 2, 0.02] });
      x += width + 0.02;
    }
  });
  parts.push(
    item('rug', 'rug', solids({ box: [3.6, 0.02, 2.6], at: [0, 0.05, 0] }), [0.6, 0, 0.4]),
    item('tableTop', 'table', solids({ box: [1.8, 0.08, 1], at: [0, 0.78, 0] }), [0.6, 0, 0.4]),
    item('tableLegs', 'table', solids(...legs(0.8, 0.42, 0.74, 0.05)), [0.6, 0, 0.4]),
    item('chairLeft', 'table', chair, [-0.75, 0, 0.4]),
    item('chairRight', 'table', chair, [1.95, 0, 0.4], Math.PI),
    item(
      'sofa',
      'sofa',
      solids(
        { box: [3, 0.45, 0.95], at: [0, 0.3, 0] },
        { box: [3, 0.7, 0.25], at: [0, 0.85, -0.35] },
        { box: [0.25, 0.65, 0.95], at: [-1.5, 0.45, 0] },
        { box: [0.25, 0.65, 0.95], at: [1.5, 0.45, 0] },
      ),
      [1.6, 0, -3.0],
    ),
    item('cushionLeft', 'sofa', solids({ box: [1.3, 0.18, 0.7], at: [-0.68, 0.61, 0.08] }), [1.6, 0, -3.0]),
    item('cushionRight', 'sofa', solids({ box: [1.3, 0.18, 0.7], at: [0.68, 0.61, 0.08] }), [1.6, 0, -3.0]),
    item(
      'bookshelf',
      'shelf',
      solids(
        { box: [0.06, 2.6, 0.5], at: [-0.97, 1.3, 0] },
        { box: [0.06, 2.6, 0.5], at: [0.97, 1.3, 0] },
        { box: [2, 0.03, 0.5], at: [0, 1.3, -0.24] },
        ...[0.04, 0.92, 1.77, 2.58].map((y): Solid => ({ box: [2, 0.05, 0.5], at: [0, y, 0] })),
      ),
      [-3.2, 0, -3.35],
    ),
    item('books', 'shelf', solids(...books), [-3.2, 0, -3.35]),
    item('standPole', 'stand', solids({ cylinder: [0.25, 0.25, 0.05], at: [0, 0.03, 0] }, { cylinder: [0.04, 0.04, 1.7], at: [0, 0.88, 0] }), [4.0, 0, -3.0]),
    item('standShade', 'stand', solids({ cylinder: [0.22, 0.38, 0.45], at: [0, 1.88, 0] }), [4.0, 0, -3.0], 0, true),
    item('plantPot', 'plant', solids({ cylinder: [0.3, 0.22, 0.55], at: [0, 0.28, 0] }), [-3.9, 0, 2.8]),
    item('plantLeaves', 'plant', solids({ blob: 0.55, at: [0, 1.05, 0] }, { blob: 0.4, at: [0.2, 1.5, 0.1] }), [-3.9, 0, 2.8]),
    item('pictureFrame', 'picture', solids({ box: [2, 1.3, 0.06], at: [0, 0, 0] }), [1.6, 2.6, -Z + 0.08]),
    item('picture', 'picture', solids({ box: [1.7, 1, 0.03], at: [0, 0, 0.04] }), [1.6, 2.6, -Z + 0.08]),
    item('clock', 'clock', solids({ cylinder: [0.38, 0.38, 0.06], at: [0, 0, 0], rotation: [0, 0, Math.PI / 2] }), [-X + 0.08, 3, 0.5]),
  );
  return parts;
}

/** 칠할 조각 목록. 순서가 영역 번호(1부터)가 된다. */
export function houseParts(): PaintPart[] {
  return [...outsideParts(), ...insideParts()];
}

/** 조각마다 이웃 (영역 번호, `ColoringState`에 넘긴다): 같은 무리끼리 */
export function partNeighbors(parts: readonly PaintPart[]): number[][] {
  return parts.map((part, i) => parts.flatMap((other, j) => (j !== i && other.group === part.group ? [j + 1] : [])));
}

/** 문 조각의 영역 번호 */
export function doorRegion(parts: readonly PaintPart[]): number {
  return parts.findIndex((part) => part.owner.kind === 'door') + 1;
}

// ─── 카메라를 막는 벽 ───────────────────────────────────

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** 카메라 몸 반지름. 벽에 이만큼 다가가면 멈춘다. */
export const CAMERA_RADIUS = 0.35;

const box = (min: Vec3, max: Vec3): Box => ({ min, max });

/** 건물 벽과 지붕. 문이 닫혀 있으면 문짝도 막는다. */
export function houseWalls(doorOpen: boolean): Box[] {
  const hx = W / 2;
  const hz = D / 2;
  const walls = [
    box([-hx, 0, -hz], [hx, H, -hz + T]),
    box([-hx, 0, -hz], [-hx + T, H, hz]),
    box([hx - T, 0, -hz], [hx, H, hz]),
    box([-hx, 0, hz - T], [-halfDoor, H, hz]),
    box([halfDoor, 0, hz - T], [hx, H, hz]),
    box([-halfDoor, DOOR.height, hz - T], [halfDoor, H, hz]),
    box([-hx - 0.5, ROOM.ceiling, -hz - 0.5], [hx + 0.5, H + 0.4, hz + 0.5]),
  ];
  if (!doorOpen) walls.push(box([-halfDoor, 0, hz - T], [halfDoor, DOOR.height, hz + 0.1]));
  return walls;
}

/** 자리 `p`가 벽 안(카메라 반지름만큼 넓힌)에 있는지 */
export function insideWall(walls: readonly Box[], p: Vec3, radius = CAMERA_RADIUS): boolean {
  return walls.some(
    ({ min, max }) =>
      p[0] > min[0] - radius && p[0] < max[0] + radius && p[1] > min[1] - radius && p[1] < max[1] + radius && p[2] > min[2] - radius && p[2] < max[2] + radius,
  );
}

/** 자리 `p`가 방 안인지 */
export function inRoom(p: Vec3): boolean {
  return Math.abs(p[0]) < ROOM.halfX && Math.abs(p[2]) < ROOM.halfZ && p[1] < ROOM.ceiling;
}

/** 문으로 드나드는 길: 바깥 자리 → 문 앞 → 방 안 자리 (눈높이) */
export const DOORWAY = {
  outside: [0, 2.6, HOUSE.depth / 2 + 11] as Vec3,
  front: [0, 1.7, HOUSE.depth / 2 + 1.2] as Vec3,
  inside: [0, 1.9, 2.9] as Vec3,
};
