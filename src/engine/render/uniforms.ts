import { Matrix3, Matrix4, Vector2, Vector3, Vector4, type IUniform } from 'three';
import type { UniformValue } from '../shader';

type ThreeUniformValue = number | boolean | Vector2 | Vector3 | Vector4 | Matrix3 | Matrix4;

/** `UniformValue`를 three.js uniform 값으로 바꾼다. 배열 길이로 벡터와 행렬을 고른다. */
export function toThreeUniform(value: UniformValue): ThreeUniformValue {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  switch (value.length) {
    case 2:
      return new Vector2().fromArray(value);
    case 3:
      return new Vector3().fromArray(value);
    case 4:
      return new Vector4().fromArray(value);
    case 9:
      return new Matrix3().fromArray(value);
    case 16:
      return new Matrix4().fromArray(value);
    default:
      throw new Error(`uniform 배열의 길이는 2, 3, 4, 9, 16이어야 합니다: ${value.length}`);
  }
}

/**
 * 있는 uniform 객체의 값을 제자리에서 바꾼다. 매 프레임 새 객체를 만들지 않으려고 같은 모양이면 복사한다.
 * 모양이 다르면(처음 넣거나 길이가 바뀌면) 새 값으로 바꾼다.
 */
export function assignUniform(target: IUniform, value: UniformValue): void {
  const current = target.value as ThreeUniformValue | undefined;
  if (typeof value === 'number' || typeof value === 'boolean') {
    target.value = value;
    return;
  }
  const sameShape =
    (current instanceof Vector2 && value.length === 2) ||
    (current instanceof Vector3 && value.length === 3) ||
    (current instanceof Vector4 && value.length === 4) ||
    (current instanceof Matrix3 && value.length === 9) ||
    (current instanceof Matrix4 && value.length === 16);
  if (sameShape) (current as Vector3).fromArray(value);
  else target.value = toThreeUniform(value);
}
