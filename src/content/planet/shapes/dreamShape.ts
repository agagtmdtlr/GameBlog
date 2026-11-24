/**
 * 몽환적인 지형물의 회전체 단면. three.js를 쓰지 않고 [반지름, 높이] 점만 돌려준다.
 * 두 모양 모두 y 0~1에 바닥 반지름 0.5이고, 언덕 비탈에 묻히도록 y 0 아래로 조금 이어진다.
 * 아래에서 위로 가는 순서이고 마지막 점은 축 위(반지름 0)라 꼭대기가 닫힌다.
 */

import type { Profile } from '../../../engine/meshData';

export type { Profile };

export const DREAM_SHAPE = {
  /** 회전체 둘레를 나누는 수 */
  radialSegments: 40,
  /** 단면을 나누는 수 */
  profileSegments: 32,
  /** y 0 아래로 이어지는 깊이 */
  skirt: 0.4,
  /** 기둥 꼭대기의 둥근 부분이 차지하는 높이 비율 */
  pillarDome: 0.22,
};

/** 종 모양 언덕. 바닥이 넓게 퍼지고 꼭대기가 둥글다. */
export function moundProfile(): Profile {
  const { profileSegments: n, skirt } = DREAM_SHAPE;
  const points: Profile = [[0.5, -skirt]];
  for (let i = 0; i <= n; i++) {
    const y = i / n;
    // 아래쪽은 살짝 퍼지고(종의 치맛자락), 위로 갈수록 반원처럼 닫힌다.
    const dome = Math.sqrt(Math.max(0, 1 - y ** 2.2));
    const flare = 0.72 + 0.28 * (1 - y) ** 3;
    points.push([0.5 * dome * flare, y]);
  }
  points[points.length - 1] = [0, 1];
  return points;
}

/** 끝이 둥근 기둥 */
export function pillarProfile(): Profile {
  const { profileSegments: n, skirt, pillarDome } = DREAM_SHAPE;
  const start = 1 - pillarDome;
  const points: Profile = [[0.5, -skirt], [0.5, start]];
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    points.push([0.5 * Math.cos(a), start + pillarDome * Math.sin(a)]);
  }
  points[points.length - 1] = [0, 1];
  return points;
}
