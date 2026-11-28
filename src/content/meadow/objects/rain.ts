import type { Vec3 } from '../../../engine/math';
import type { WindFrame } from './wind';

/**
 * 초원에 내리는 비. 빗줄기는 카메라 둘레 상자 안에서만 그리고, 상자 밖으로 나간 줄기는 반대쪽으로 되돌아온다.
 * 줄기 자리는 정점 셰이더가 인스턴스 번호의 해시로 정하므로 버퍼에 담지 않는다. 바람이 빗줄기를 비스듬히 민다.
 * GPU와 DOM에 의존하지 않는다.
 */
export const RAIN = {
  /** 빗줄기 수 */
  count: 30000,
  /** 카메라 둘레 상자의 수평 반지름. 가장자리 쪽 줄기는 흐려져 상자 경계가 보이지 않는다. */
  radius: 34,
  /** 상자가 카메라 아래로 내려가는 깊이와 위로 올라가는 높이 */
  below: 14,
  above: 30,
  /** 떨어지는 빠르기 (단위/초)와 줄기마다 다른 몫 (±) */
  fallSpeed: 24,
  fallJitter: 0.2,
  /** 바람이 가장 잔잔할 때와 가장 거셀 때 빗줄기를 수평으로 미는 빠르기 (단위/초) */
  drift: [1.5, 10] as const,
  /** 줄기 길이 = 빠르기 × 이 시간 (움직임 잔상) */
  streakSeconds: 0.04,
  /** 줄기 폭. 멀수록 넓혀 가는 선이 깜빡이지 않게 한다. */
  width: 0.028,
  /** 가장 진한 줄기의 불투명도 */
  opacity: 0.4,
  /** 빗줄기 색 = 하늘색(배경)과 흰색을 이 몫으로 섞은 것 */
  brighten: 0.6,
};

/** 바람 `wind`일 때 빗줄기의 기본 속도. 줄기마다 떨어지는 빠르기에 `fallJitter`만큼 차이를 둔다. */
export function rainVelocity(wind: WindFrame): Vec3 {
  const [calm, gusty] = RAIN.drift;
  const drift = calm + (gusty - calm) * wind.strength;
  return [wind.direction[0] * drift, -RAIN.fallSpeed, wind.direction[1] * drift];
}
