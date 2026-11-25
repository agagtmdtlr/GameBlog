/**
 * 색칠 놀이의 3D 장면: 해 질 녘 도시 한 블록. 무엇이 어디에 있고 어떻게 움직이는지만 정한다 (three.js 없음).
 *
 * - 둥근 직사각형 순환 도로를 차가 돌고, 도로 양쪽 인도를 사람들이 걷는다.
 * - 바깥 인도에 가로등, 도로 바깥에 건물, 안쪽 공원에 나무가 있다.
 * - 하늘과 지평선 가까이 낮게 뜬 해도 칠할 수 있다.
 * - 칠하는 단위는 메시 하나(`PaintPart`)다. 차 한 대는 몸통과 지붕 두 조각이다.
 *
 * 좌표는 미터, y가 위다. 해는 -z 쪽 지평선에 있다.
 */

export type Vec3 = readonly [number, number, number];

/** 칠할 조각의 모양 종류. 그리기 쪽(`graphics/`)이 종류마다 지오메트리를 만든다. */
export type PartShape =
  | 'sky'
  | 'sun'
  | 'ground'
  | 'park'
  | 'road'
  | 'sidewalkOuter'
  | 'sidewalkInner'
  | 'carBody'
  | 'carCabin'
  | 'lampPole'
  | 'lampHead'
  | 'personBody'
  | 'personHead'
  | 'building'
  | 'trunk'
  | 'crown';

/** 어디에 붙어 움직이는지 */
export type PartOwner =
  | { readonly kind: 'static'; readonly position: Vec3; readonly rotationY: number; readonly scale: Vec3 }
  | { readonly kind: 'car'; readonly index: number }
  | { readonly kind: 'person'; readonly index: number };

export interface PaintPart {
  /** 칠할 영역 번호는 목록 순서 + 1 */
  readonly shape: PartShape;
  readonly owner: PartOwner;
  /** 같은 무리(차 한 대, 가로등 하나)끼리는 이웃이라 같은 색을 되도록 피한다. */
  readonly group: string;
}

/** 순환 도로: 둥근 직사각형. 가운데 선의 반 너비·반 깊이와 모서리 반지름 */
export const LOOP = { halfX: 46, halfZ: 22, radius: 12 } as const;
export const ROAD_HALF_WIDTH = 4;
export const SIDEWALK_WIDTH = 3;
/** 인도는 도로보다 이만큼 높다. */
export const CURB_HEIGHT = 0.18;
/** 해가 있는 방향 (지평선 조금 위, -z 쪽). 처음 시점에서 건물 사이로 보이는 자리 */
export const SUN_DIRECTION: Vec3 = normalize([-0.03, 0.12, -1]);
export const SUN_DISTANCE = 320;
export const SKY_RADIUS = 420;

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/** 도로 가운데 선의 둘레 길이 */
export function loopLength(): number {
  return 4 * (LOOP.halfX - LOOP.radius) + 4 * (LOOP.halfZ - LOOP.radius) + 2 * Math.PI * LOOP.radius;
}

export interface PathPose {
  readonly x: number;
  readonly z: number;
  /** 나아가는 방향 (y축 회전, three.js의 rotation.y와 같은 뜻). 0이면 +x, π/2면 -z 쪽 */
  readonly heading: number;
}

/**
 * 도로 가운데 선을 따라 `distance`만큼 간 자리에서 바깥쪽으로 `offset`만큼 옮긴 자리.
 * 위에서 보면 반시계(+x → -z → -x → +z)로 돌고, 바깥쪽은 나아가는 방향의 오른쪽이다.
 * 거리는 늘 가운데 선 기준이라, 같은 거리의 안쪽·바깥쪽 자리는 같은 단면 위에 있다. 음수나 둘레보다 긴 거리도 감는다.
 */
export function loopPose(distance: number, offset = 0): PathPose {
  const { halfX, halfZ, radius: r } = LOOP;
  const cx = halfX - r;
  const cz = halfZ - r;
  const arc = (Math.PI / 2) * r;
  const total = loopLength();
  let s = ((distance % total) + total) % total;
  // 아래쪽 변(+z 쪽)의 가운데에서 출발해 +x로 간다. 모서리 원의 중심은 (±cx, ±cz)
  const pieces: { length: number; at: (t: number) => PathPose }[] = [
    { length: cx, at: (t) => ({ x: t, z: cz + r, heading: 0 }) },
    { length: arc, at: (t) => arcPose(cx, cz, r, Math.PI / 2, t) },
    { length: 2 * cz, at: (t) => ({ x: cx + r, z: cz - t, heading: Math.PI / 2 }) },
    { length: arc, at: (t) => arcPose(cx, -cz, r, 0, t) },
    { length: 2 * cx, at: (t) => ({ x: cx - t, z: -cz - r, heading: Math.PI }) },
    { length: arc, at: (t) => arcPose(-cx, -cz, r, -Math.PI / 2, t) },
    { length: 2 * cz, at: (t) => ({ x: -cx - r, z: -cz + t, heading: -Math.PI / 2 }) },
    { length: arc, at: (t) => arcPose(-cx, cz, r, Math.PI, t) },
    { length: cx, at: (t) => ({ x: -cx + t, z: cz + r, heading: 0 }) },
  ];
  let pose = pieces[pieces.length - 1].at(cx);
  for (const piece of pieces) {
    if (s <= piece.length) {
      pose = piece.at(s);
      break;
    }
    s -= piece.length;
  }
  const [ox, oz] = outward(pose.heading);
  return { x: pose.x + ox * offset, z: pose.z + oz * offset, heading: pose.heading };
}

/** 나아가는 방향 `heading`의 오른쪽(도로 바깥쪽) 수평 단위 벡터 (x, z) */
export function outward(heading: number): [number, number] {
  return [Math.sin(heading), Math.cos(heading)];
}

/**
 * 모서리 원호 위의 자리. 원 중심 (centerX, centerZ), 반지름 `r`.
 * `startAngle`은 위에서 본 각도(+x에서 +z 쪽으로 잰 각)이고, 반시계로 돌면(위에서 보면 +z에서 +x, -z 쪽으로) 각이 줄어든다.
 */
function arcPose(centerX: number, centerZ: number, r: number, startAngle: number, t: number): PathPose {
  const a = startAngle - t / r;
  // 각이 줄어드는 쪽으로 가므로 나아가는 방향은 반지름에서 -90도
  return { x: centerX + r * Math.cos(a), z: centerZ + r * Math.sin(a), heading: -a + Math.PI / 2 };
}

export interface Car {
  /** 출발 자리 (도로 둘레 거리) */
  readonly start: number;
  /** 초속 (음수면 반대로 돈다) */
  readonly speed: number;
  /** 가운데 선에서 바깥쪽 거리 (차선) */
  readonly lane: number;
}

export interface Walker {
  readonly start: number;
  readonly speed: number;
  /** 가운데 선에서 바깥쪽 거리 (안쪽 인도는 음수) */
  readonly offset: number;
  /** 키 배율 */
  readonly height: number;
}

/** 바깥 차선은 반시계, 안쪽 차선은 시계 방향. 같은 차선 차는 같은 빠르기라 부딪치지 않는다. */
export const CARS: readonly Car[] = [
  { start: 0, speed: 9, lane: 2 },
  { start: 70, speed: 9, lane: 2 },
  { start: 140, speed: 9, lane: 2 },
  { start: 30, speed: -7.5, lane: -2 },
  { start: 95, speed: -7.5, lane: -2 },
  { start: 160, speed: -7.5, lane: -2 },
];

const OUTER_WALK = ROAD_HALF_WIDTH + SIDEWALK_WIDTH / 2;
export const WALKERS: readonly Walker[] = [
  { start: 4, speed: 1.4, offset: OUTER_WALK - 0.5, height: 1 },
  { start: 40, speed: -1.2, offset: OUTER_WALK + 0.6, height: 0.92 },
  { start: 75, speed: 1.6, offset: OUTER_WALK, height: 1.06 },
  { start: 118, speed: -1.3, offset: OUTER_WALK - 0.4, height: 0.86 },
  { start: 160, speed: 1.1, offset: OUTER_WALK + 0.5, height: 0.98 },
  { start: 12, speed: -1.5, offset: -OUTER_WALK, height: 1.02 },
  { start: 55, speed: 1.2, offset: -OUTER_WALK + 0.5, height: 0.9 },
  { start: 100, speed: 1.4, offset: -OUTER_WALK - 0.4, height: 1.08 },
  { start: 140, speed: -1.1, offset: -OUTER_WALK, height: 0.95 },
  { start: 6, speed: 1.3, offset: -OUTER_WALK + 0.3, height: 0.8 },
];

export interface MoverPose extends PathPose {
  /** 걸음에 따라 오르내리는 높이 */
  readonly bob: number;
}

export function carPose(car: Car, time: number): MoverPose {
  const pose = loopPose(car.start + car.speed * time, car.lane);
  return { ...pose, heading: car.speed < 0 ? pose.heading + Math.PI : pose.heading, bob: 0 };
}

export function walkerPose(walker: Walker, time: number): MoverPose {
  const pose = loopPose(walker.start + walker.speed * time, walker.offset);
  const steps = (Math.abs(walker.speed) * time) / 0.7;
  return {
    ...pose,
    heading: walker.speed < 0 ? pose.heading + Math.PI : pose.heading,
    bob: Math.abs(Math.sin(steps * Math.PI)) * 0.08,
  };
}

const LAMP_OFFSET = ROAD_HALF_WIDTH + SIDEWALK_WIDTH - 0.5;
const LAMP_COUNT = 8;

/** 가로등: 바깥 인도 바깥 가장자리에 고르게. 머리는 도로 쪽으로 뻗는다. */
export function lampPoses(): PathPose[] {
  const length = loopLength();
  return Array.from({ length: LAMP_COUNT }, (_, i) => loopPose(((i + 0.5) / LAMP_COUNT) * length, LAMP_OFFSET));
}

/** 건물: 도로 바깥 둘레. 위치, 너비·높이·깊이 */
export const BUILDINGS: readonly { readonly position: Vec3; readonly size: Vec3 }[] = [
  { position: [-36, 0, -42], size: [16, 18, 10] },
  { position: [-14, 0, -44], size: [12, 26, 12] },
  { position: [10, 0, -42], size: [14, 14, 10] },
  { position: [34, 0, -44], size: [14, 22, 12] },
  { position: [-70, 0, -6], size: [10, 12, 18] },
  { position: [70, 0, 4], size: [10, 16, 20] },
  { position: [-30, 0, 42], size: [14, 9, 10] },
  { position: [32, 0, 43], size: [16, 11, 10] },
];

/** 공원 나무: 안쪽 섬 */
export const TREES: readonly Vec3[] = [
  [-22, 0, -3],
  [-6, 0, 4],
  [10, 0, -4],
  [24, 0, 3],
];

const identity = (position: Vec3 = [0, 0, 0], rotationY = 0, scale: Vec3 = [1, 1, 1]): PartOwner => ({
  kind: 'static',
  position,
  rotationY,
  scale,
});

/** 칠할 조각 목록. 순서가 영역 번호(1부터)가 된다. */
export function cityParts(): PaintPart[] {
  const parts: PaintPart[] = [
    { shape: 'sky', owner: identity(), group: 'sky' },
    { shape: 'sun', owner: identity(), group: 'sky' },
    { shape: 'ground', owner: identity(), group: 'ground' },
    { shape: 'park', owner: identity(), group: 'ground' },
    { shape: 'road', owner: identity(), group: 'road' },
    { shape: 'sidewalkOuter', owner: identity(), group: 'road' },
    { shape: 'sidewalkInner', owner: identity(), group: 'road' },
  ];
  BUILDINGS.forEach((building, i) =>
    parts.push({ shape: 'building', owner: identity(building.position, 0, building.size), group: `building${i}` }),
  );
  TREES.forEach((position, i) => {
    parts.push({ shape: 'trunk', owner: identity(position), group: `tree${i}` });
    parts.push({ shape: 'crown', owner: identity(position), group: `tree${i}` });
  });
  lampPoses().forEach((pose, i) => {
    const owner = identity([pose.x, CURB_HEIGHT, pose.z], pose.heading);
    parts.push({ shape: 'lampPole', owner, group: `lamp${i}` });
    parts.push({ shape: 'lampHead', owner, group: `lamp${i}` });
  });
  CARS.forEach((_, index) => {
    parts.push({ shape: 'carBody', owner: { kind: 'car', index }, group: `car${index}` });
    parts.push({ shape: 'carCabin', owner: { kind: 'car', index }, group: `car${index}` });
  });
  WALKERS.forEach((_, index) => {
    parts.push({ shape: 'personBody', owner: { kind: 'person', index }, group: `person${index}` });
    parts.push({ shape: 'personHead', owner: { kind: 'person', index }, group: `person${index}` });
  });
  return parts;
}

/** 조각마다 이웃 (영역 번호, `ColoringState`에 넘긴다): 같은 무리끼리 */
export function partNeighbors(parts: readonly PaintPart[]): number[][] {
  return parts.map((part, i) =>
    parts.flatMap((other, j) => (j !== i && other.group === part.group ? [j + 1] : [])),
  );
}
