import { describe, expect, it } from 'vitest';
import {
  cross,
  mat4FromTRS,
  mat4Identity,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  mat4TransformPoint,
  normalMatrix,
  normalize,
  quatFromAxisAngle,
  quatMultiply,
  quatNlerp,
  quatRotateVec3,
  QUAT_IDENTITY,
  type Vec3,
} from './math';

function expectVec(actual: Vec3, expected: Vec3): void {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 5));
}

describe('벡터', () => {
  it('외적은 오른손 좌표계를 따른다', () => {
    expectVec(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  });

  it('영벡터를 정규화해도 NaN이 나오지 않는다', () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('쿼터니언', () => {
  it('Y축 90도 회전은 +X를 -Z로 보낸다', () => {
    const q = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
    expectVec(quatRotateVec3(q, [1, 0, 0]), [0, 0, -1]);
  });

  it('곱셈은 오른쪽 회전을 먼저 적용한다', () => {
    const a = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
    const b = quatFromAxisAngle([1, 0, 0], Math.PI / 2);
    const composed = quatRotateVec3(quatMultiply(a, b), [0, 1, 0]);
    expectVec(composed, quatRotateVec3(a, quatRotateVec3(b, [0, 1, 0])));
  });

  it('보간은 부호가 반대인 같은 회전 사이에서 짧은 호를 따른다', () => {
    const q = quatFromAxisAngle([0, 1, 0], 0.5);
    const negated = [-q[0], -q[1], -q[2], -q[3]] as const;
    const mid = quatNlerp(q, negated, 0.5);
    expectVec(quatRotateVec3(mid, [1, 0, 0]), quatRotateVec3(q, [1, 0, 0]));
  });
});

describe('행렬', () => {
  it('단위 행렬을 곱해도 값이 변하지 않는다', () => {
    const m = mat4FromTRS([1, 2, 3], QUAT_IDENTITY, [2, 2, 2]);
    expect(mat4Multiply(m, mat4Identity())).toEqual(m);
  });

  it('TRS는 크기, 회전, 이동 순서로 적용된다', () => {
    const m = mat4FromTRS([10, 0, 0], quatFromAxisAngle([0, 1, 0], Math.PI / 2), [2, 2, 2]);
    expectVec(mat4TransformPoint(m, [1, 0, 0]), [10, 0, -2]);
  });

  it('쿼터니언 회전과 TRS의 회전이 일치한다', () => {
    const q = quatFromAxisAngle(normalize([1, 2, 3]), 1.1);
    const p: Vec3 = [0.3, -0.7, 1.2];
    expectVec(mat4TransformPoint(mat4FromTRS([0, 0, 0], q, [1, 1, 1]), p), quatRotateVec3(q, p));
  });

  it('lookAt은 시점을 원점으로, 대상을 -Z로 보낸다', () => {
    const view = mat4LookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    expectVec(mat4TransformPoint(view, [0, 0, 5]), [0, 0, 0]);
    expectVec(mat4TransformPoint(view, [0, 0, 0]), [0, 0, -5]);
  });

  it('원근 투영은 near와 far를 NDC -1과 1로 보낸다', () => {
    const p = mat4Perspective(Math.PI / 2, 1, 1, 100);
    expect(mat4TransformPoint(p, [0, 0, -1])[2]).toBeCloseTo(-1, 5);
    expect(mat4TransformPoint(p, [0, 0, -100])[2]).toBeCloseTo(1, 5);
  });

  it('법선 행렬은 불균등 크기에서 법선을 표면에 수직으로 유지한다', () => {
    const n = normalMatrix(mat4FromTRS([0, 0, 0], QUAT_IDENTITY, [1, 4, 1]));
    const normal = normalize([1, 1, 0]);
    const transformed = normalize([
      n[0] * normal[0] + n[3] * normal[1] + n[6] * normal[2],
      n[1] * normal[0] + n[4] * normal[1] + n[7] * normal[2],
      n[2] * normal[0] + n[5] * normal[1] + n[8] * normal[2],
    ]);
    // 표면 접선 (1,-1,0)은 크기 변환 후 (1,-4,0)이 되고, 법선은 이에 수직이어야 한다.
    expect(transformed[0] * 1 + transformed[1] * -4).toBeCloseTo(0, 5);
  });
});
