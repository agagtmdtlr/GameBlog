import { add, cross, mat4FromBasis, scale, type Mat4, type Vec3 } from '../engine/math';
import type { MeshKind } from '../engine/frame';
import { RAIL_TOP, SphereTrackPath, TRACK_SHAPE, type TrackFrame } from '../engine/trackPath';
import type { OrientedBox } from '../physics/collision';
import { PLANET, surfaceDirection } from './planet';

/**
 * 행성 표면의 스플라인 선로와 그 위를 끝없이 도는 기차.
 * 선로 모양과 스플라인 계산은 `engine/trackPath.ts`가 맡고, 여기서는 노선과 차량을 정한다.
 */

/**
 * 선로가 지나는 조절점 (위도, 경도, 도). 순서대로 잇고 마지막 점은 첫 점으로 돌아온다.
 * 시작 지점(위도 90)을 둘러싸고 위도 46~54 사이를 물결치며 한 바퀴 돈다.
 * 집 자리(66, 180)의 앞쪽과 로켓(위성 아래, 약 31, 208)의 위쪽을 지난다.
 */
export const TRACK_ROUTE: readonly (readonly [number, number])[] = [
  [50, 0],
  [46, 40],
  [54, 80],
  [48, 125],
  [52, 180],
  [54, 220],
  [46, 265],
  [52, 315],
];

export const TRAIN = {
  /** 선로를 따라 가는 빠르기 (표면 거리/초) */
  speed: 3.2,
  /** 차량 사이의 틈 */
  gap: 0.3,
  /** 차량 폭과 바퀴 */
  width: 1.05,
  wheelRadius: 0.2,
  wheelWidth: 0.1,
  /** 차대 윗면 높이 (표면 기준) */
  deck: 0.7,
};

const DARK: Vec3 = [0.04, 0.04, 0.045];
const ROOF: Vec3 = [0.8, 0.75, 0.65];

/** 차량 부품. 자리와 크기는 차량 기준 [오른쪽, 위(표면에서), 앞]이다. */
interface CarPart {
  mesh: MeshKind;
  offset: Vec3;
  size: Vec3;
  /** `cylinder`의 축 방향. 기본은 앞쪽이다. */
  axis?: 'forward' | 'up' | 'right';
  color: Vec3;
  roughness: number;
  /** 스스로 빛나는 색 (전조등) */
  emissive?: Vec3;
}

export interface CarSpec {
  /** 차량 길이 */
  length: number;
  /** 지붕까지의 높이 (표면 기준). 충돌 상자의 위 끝이다. */
  height: number;
  parts: readonly CarPart[];
}

function running(length: number): CarPart[] {
  const { width, wheelRadius: r, wheelWidth, deck } = TRAIN;
  const wheelY = RAIL_TOP + r;
  const wheelZ = length / 2 - 0.4;
  const wheels: CarPart[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      wheels.push({
        mesh: 'cylinder',
        axis: 'right',
        offset: [(x * TRACK_SHAPE.gauge) / 2, wheelY, z * wheelZ],
        size: [2 * r, 2 * r, wheelWidth],
        color: DARK,
        roughness: 0.5,
      });
    }
  }
  const chassisHeight = deck - wheelY;
  return [
    ...wheels,
    { mesh: 'box', offset: [0, deck - chassisHeight / 2, 0], size: [width, chassisHeight, length], color: DARK, roughness: 0.6 },
  ];
}

function locomotive(color: Vec3): CarSpec {
  const length = 2.2;
  const { deck } = TRAIN;
  const boiler = 0.75;
  return {
    length,
    height: deck + 1.15,
    parts: [
      ...running(length),
      { mesh: 'cylinder', offset: [0, deck + boiler / 2, 0.35], size: [boiler, boiler, 1.4], color, roughness: 0.4 },
      { mesh: 'cylinder', axis: 'up', offset: [0, deck + boiler + 0.2, 0.75], size: [0.28, 0.28, 0.4], color: DARK, roughness: 0.5 },
      { mesh: 'box', offset: [0, deck + 0.5, -0.7], size: [1.0, 1.0, 0.75], color, roughness: 0.4 },
      { mesh: 'box', offset: [0, deck + 1.05, -0.7], size: [1.15, 0.1, 0.9], color: ROOF, roughness: 0.6 },
      {
        mesh: 'cylinder',
        offset: [0, deck + boiler / 2, 1.06],
        size: [0.22, 0.22, 0.04],
        color: [0, 0, 0],
        roughness: 1,
        emissive: [3, 2.4, 1.2],
      },
    ],
  };
}

function wagon(color: Vec3): CarSpec {
  const length = 1.8;
  const { deck } = TRAIN;
  const body = 0.75;
  return {
    length,
    height: deck + body + 0.08,
    parts: [
      ...running(length),
      { mesh: 'box', offset: [0, deck + body / 2, 0], size: [1.0, body, length - 0.1], color, roughness: 0.5 },
      { mesh: 'box', offset: [0, deck + body + 0.04, 0], size: [1.1, 0.08, length], color: ROOF, roughness: 0.6 },
    ],
  };
}

/** 앞에서부터 차례로 기관차와 객차. 줄을 더하거나 빼면 차량 수가 바뀐다. */
export const TRAIN_CARS: readonly CarSpec[] = [
  locomotive([0.03, 0.1, 0.45]), // 짙은 파랑
  wagon([0.9, 0.6, 0.05]), // 노랑
  wagon([0.02, 0.4, 0.35]), // 청록
  wagon([0.85, 0.2, 0.15]), // 산호
];

/** 행성 표면의 선로 경로 */
export const TRACK_PATH = new SphereTrackPath(
  TRACK_ROUTE.map(([lat, lon]) => surfaceDirection(lat, lon)),
  PLANET.center,
  PLANET.radius,
);

/** 그릴 부품 하나 */
export interface TrainPartModel {
  mesh: MeshKind;
  model: Mat4;
  color: Vec3;
  roughness: number;
  emissive?: Vec3;
}

/** 차량 하나의 자리 */
export interface CarPose {
  frame: TrackFrame;
  spec: CarSpec;
}

/** 선로를 따라 일정한 빠르기로 도는 기차. 기관차 중심이 경로에서 간 거리만 상태로 갖는다. */
export class Train {
  private distance: number;
  private previousDistance: number;

  constructor(
    readonly path: SphereTrackPath = TRACK_PATH,
    readonly cars: readonly CarSpec[] = TRAIN_CARS,
    start = 0,
  ) {
    this.distance = start;
    this.previousDistance = start;
  }

  step(dt: number): void {
    this.previousDistance = this.distance;
    this.distance = this.path.wrap(this.distance + TRAIN.speed * dt);
    // 한 바퀴를 넘으면 보간이 거꾸로 가지 않도록 이전 값도 함께 접는다.
    if (this.distance < this.previousDistance) this.previousDistance -= this.path.length;
  }

  /** 기관차 중심이 간 거리. 렌더링 보간을 적용한다. */
  position(alpha = 1): number {
    return this.previousDistance + (this.distance - this.previousDistance) * alpha;
  }

  /** 차량마다 경로 위의 자리. 앞뒤 끝이 선로 위에 놓이도록 차량 길이로 방향을 잡는다. */
  poses(alpha = 1): CarPose[] {
    let d = this.position(alpha);
    return this.cars.map((spec, i) => {
      if (i > 0) d -= (this.cars[i - 1].length + spec.length) / 2 + TRAIN.gap;
      return { frame: this.path.frame(d, spec.length), spec };
    });
  }

  /** 캐릭터가 통과할 수 없는 차량 상자 */
  obstacles(alpha = 1): OrientedBox[] {
    return this.poses(alpha).map(({ frame, spec }) => {
      const bottom = RAIL_TOP;
      return {
        center: add(frame.position, scale(frame.up, (bottom + spec.height) / 2)),
        axes: [frame.right, frame.up, frame.forward],
        halfExtents: [TRAIN.width / 2 + 0.05, (spec.height - bottom) / 2, spec.length / 2],
      };
    });
  }

  /** 모든 차량의 부품 모델 행렬 */
  parts(alpha = 1): TrainPartModel[] {
    return this.poses(alpha).flatMap(({ frame, spec }) => spec.parts.map((part) => partModel(frame, part)));
  }
}

/**
 * 부품의 모델 행렬. 기저는 오른손이어야 면의 감김 방향이 뒤집히지 않는다.
 * `right = forward × up`이므로 (right, up, -forward), (right, forward, up), (forward, up, right)가 오른손 기저다.
 * 상자와 원기둥은 앞뒤 대칭이라 -forward를 써도 모양이 같다. 원기둥 메시는 축이 Z다.
 */
function partModel({ position, forward, up, right }: TrackFrame, part: CarPart): TrainPartModel {
  const [ox, oy, oz] = part.offset;
  const center = add(position, add(scale(right, ox), add(scale(up, oy), scale(forward, oz))));
  const [sx, sy, sz] = part.size;
  const back = cross(right, up);
  let model: Mat4;
  if (part.mesh === 'cylinder' && part.axis === 'up') {
    model = mat4FromBasis(center, scale(right, sx), scale(forward, sy), scale(up, sz));
  } else if (part.mesh === 'cylinder' && part.axis === 'right') {
    model = mat4FromBasis(center, scale(forward, sx), scale(up, sy), scale(right, sz));
  } else {
    model = mat4FromBasis(center, scale(right, sx), scale(up, sy), scale(back, sz));
  }
  return { mesh: part.mesh, model, color: part.color, roughness: part.roughness, emissive: part.emissive };
}
