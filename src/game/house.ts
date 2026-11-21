import { cross, dot, mat4FromBasis, normalize, scale, sub, type Mat4, type Vec3 } from '../engine/math';
import type { OrientedBox } from '../physics/collision';
import { PLANET, surfaceDirection } from './planet';

/**
 * 캐릭터의 집이 놓일 자리. 지금은 집 모델 대신 상자로 자리만 표시한다.
 * 시작 지점 앞쪽, 해가 드는 쪽에 있다. 정면(+Z 면)이 시작 지점을 향한다.
 */
export const HOUSE = {
  /** 바닥 중심의 위치 (도). 위도 90이 시작 지점, 경도 180이 시작할 때 바라보는 방향이다. */
  latitude: 66,
  longitude: 180,
  /** 폭, 높이, 깊이 */
  size: [3.2, 2.8, 3.2] as Vec3,
  /** 행성이 둥글어 바닥 모서리가 뜨지 않도록 표면 아래로 묻는 깊이 */
  sink: 0.1,
};

/** 집 자리 상자. 그리기와 충돌에 같은 값을 쓴다. 축은 [오른쪽, 위, 정면]이다. */
export function houseBox(): OrientedBox {
  const up = surfaceDirection(HOUSE.latitude, HOUSE.longitude);
  const [width, height, depth] = HOUSE.size;
  // 정면은 시작 지점(+Y) 쪽 표면 접선이다.
  const toSpawn: Vec3 = [0, 1, 0];
  const front = normalize(sub(toSpawn, scale(up, dot(toSpawn, up))));
  const right = cross(up, front);
  return {
    center: scale(up, PLANET.radius + height / 2 - HOUSE.sink),
    axes: [right, up, front],
    halfExtents: [width / 2, height / 2, depth / 2],
  };
}

/** 상자의 모델 행렬. 단위 정육면체(한 변 1)를 상자 크기만큼 늘린다. */
export function boxModel({ center, axes, halfExtents }: OrientedBox): Mat4 {
  const [x, y, z] = axes.map((axis, i) => scale(axis, halfExtents[i] * 2));
  return mat4FromBasis(center, x, y, z);
}
