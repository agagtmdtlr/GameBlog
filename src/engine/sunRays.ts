import { createRandom } from './starfield';

/**
 * 해 둘레에 둘러 그리는 삼각형 햇살의 모양. 해 반지름을 1로 둔 XY 평면 위의 값이다.
 * three.js를 쓰지 않고, 렌더러가 이 함수의 정점으로 지오메트리를 만든다.
 * 평면의 앞면(+Z)을 카메라로 향하게 두면 화면에 맞춘 빌보드가 된다.
 */
export const SUN_RAYS = {
  /** 같은 모양이 나오도록 고정한 난수 씨앗 */
  seed: 0x5a17,
  count: 14,
  /** 삼각형 밑변이 놓이는 반지름. 해 원반과 틈이 조금 보이게 1보다 크다. */
  innerRadius: 1.14,
  /** 꼭짓점까지 길이의 범위 (밑변에서부터) */
  minLength: 0.46,
  maxLength: 0.6,
  /** 밑변 폭의 절반 */
  halfWidth: 0.24,
  /** 손으로 그린 느낌을 주는 흔들림. 각 위치(라디안, 칸 폭 대비)와 기울기(라디안) */
  angleJitter: 0.18,
  tiltJitter: 0.3,
};

/**
 * 햇살 삼각형의 정점 위치. 삼각형마다 정점 3개(xyz)이고, +Z에서 볼 때 반시계 방향이다.
 */
export function sunRayPositions(seed = SUN_RAYS.seed): Float32Array {
  const { count, innerRadius, minLength, maxLength, halfWidth, angleJitter, tiltJitter } = SUN_RAYS;
  const random = createRandom(seed);
  const step = (2 * Math.PI) / count;
  const out = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const angle = (i + (random() - 0.5) * angleJitter) * step;
    const tilt = (random() - 0.5) * 2 * tiltJitter;
    const length = minLength + (maxLength - minLength) * random();
    // 바깥 방향 r과 접선 t. 기울기만큼 삼각형을 밑변 가운데를 축으로 돌린다.
    const r: [number, number] = [Math.cos(angle + tilt), Math.sin(angle + tilt)];
    const t: [number, number] = [-r[1], r[0]];
    const base: [number, number] = [Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius];
    const right = [base[0] - t[0] * halfWidth, base[1] - t[1] * halfWidth];
    const apex = [base[0] + r[0] * length, base[1] + r[1] * length];
    const left = [base[0] + t[0] * halfWidth, base[1] + t[1] * halfWidth];
    // right → apex → left는 +Z에서 볼 때 반시계 방향이다.
    out.set([right[0], right[1], 0, apex[0], apex[1], 0, left[0], left[1], 0], i * 9);
  }
  return out;
}
