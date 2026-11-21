import type { MeshKind } from '../engine/frame';
import type { Vec3 } from '../engine/math';
import { CHARACTER_SCALE } from './walker';

const S = CHARACTER_SCALE;

/** 캐릭터 몸의 모양. 플레이어는 구이고, NPC는 마리마다 고른다. */
export type BodyShape = 'sphere' | 'cube' | 'pyramid';

/** 몸 모양 하나를 그리고 다리를 붙이는 값 (게임 안 치수) */
export interface BodyForm {
  mesh: MeshKind;
  /**
   * 메시를 늘리는 크기 [오른쪽, 위, 앞]. `sphere`는 반지름 1, `box`와 `pyramid`는 한 변 1인 메시라
   * 각각 반지름과 전체 폭·높이·깊이다.
   */
  size: Vec3;
  /** 몸 중심에서 메시 중심까지 위쪽 거리. 피라미드는 밑면을 구의 아래쪽에 맞추려고 올린다. */
  lift: number;
  /** 몸 중심에서 엉덩이 관절까지의 옆 거리와 높이. 다리가 몸 안에서 시작하도록 모양마다 고른다. */
  hip: { side: number; up: number };
}

/**
 * 모양마다 크기를 구(반지름 0.5)와 비슷한 덩치로 맞춘다. 설계 치수(배율 1)에 `CHARACTER_SCALE`을 곱한다.
 * - 구: 플레이어와 같다. 엉덩이는 구의 바깥 위쪽(옆 0.35, 위 0.33).
 * - 정육면체: 한 변 0.84. 엉덩이 자리가 구와 같아도 상자 안에 들어간다.
 * - 피라미드(사각뿔): 밑변 1.24, 높이 1.25, 밑면이 구의 바닥(몸 중심 아래 0.5)에 놓이고 꼭짓점이 위다.
 *   위로 갈수록 좁아 구의 엉덩이 자리는 몸 밖이므로, 몸 중심 높이(폭 ±0.372)의 옆 0.33에 붙인다.
 */
export const BODY_FORMS: Readonly<Record<BodyShape, BodyForm>> = {
  sphere: { mesh: 'sphere', size: [0.5 * S, 0.5 * S, 0.5 * S], lift: 0, hip: { side: 0.35 * S, up: 0.33 * S } },
  cube: { mesh: 'box', size: [0.84 * S, 0.84 * S, 0.84 * S], lift: 0, hip: { side: 0.35 * S, up: 0.33 * S } },
  pyramid: { mesh: 'pyramid', size: [1.24 * S, 1.25 * S, 1.24 * S], lift: 0.125 * S, hip: { side: 0.33 * S, up: 0 } },
};
