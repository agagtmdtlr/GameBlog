import { Matrix3, Matrix4, Vector2, Vector3, Vector4, type IUniform } from 'three';
import { describe, expect, it } from 'vitest';
import { layoutMismatches, STANDARD_LAYOUT, vertexCount, type GeometryData } from '../vertex';
import { createEngineMeshes, geometryFromData, geometryLayout } from './geometry';
import { TOON_SHADER_SPEC, toonUniforms } from './toonShader';
import { assignUniform, toThreeUniform } from './uniforms';

/** 위치, 색(Uint8 정규화), 두 성분 uv, 한 성분 사용자 속성을 가진 삼각형 하나 */
const TRIANGLE: GeometryData = {
  attributes: {
    position: { array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), itemSize: 3 },
    color: { array: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]), itemSize: 4, normalized: true },
    uv: { array: new Float32Array([0, 0, 1, 0, 0, 1]), itemSize: 2 },
    aWeight: { array: new Float32Array([0.1, 0.5, 0.9]), itemSize: 1 },
  },
  index: new Uint16Array([0, 1, 2]),
};

describe('정점 속성 모양', () => {
  it('셰이더가 요구하는 속성이 없거나 성분 수가 다르면 알려 준다', () => {
    expect(layoutMismatches({ position: 3, normal: 3 }, { position: 3, normal: 3, uv: 2 })).toEqual([]);
    expect(layoutMismatches({ position: 3, normal: 3 }, { position: 3 })).toEqual(['normal(3) 없음']);
    expect(layoutMismatches({ uv: 2 }, { uv: 3 })).toEqual(['uv의 성분 수가 2가 아니라 3']);
  });

  it('속성마다 정점 수가 같아야 하고 색인은 정점 수 안이어야 한다', () => {
    expect(vertexCount(TRIANGLE)).toBe(3);
    expect(() => vertexCount({ attributes: { position: { array: new Float32Array(9), itemSize: 3 }, uv: { array: new Float32Array(4), itemSize: 2 } } })).toThrow();
    expect(() => vertexCount({ attributes: { position: { array: new Float32Array(8), itemSize: 3 } } })).toThrow();
    expect(() => vertexCount({ attributes: { position: { array: new Float32Array(9), itemSize: 3 } }, index: new Uint16Array([0, 1, 3]) })).toThrow();
  });

  it('GeometryData의 속성을 이름, 성분 수, 정규화 그대로 three.js 지오메트리로 옮긴다', () => {
    const geometry = geometryFromData(TRIANGLE);
    expect(geometryLayout(geometry)).toEqual({ position: 3, color: 4, uv: 2, aWeight: 1 });
    expect(geometry.getAttribute('color').normalized).toBe(true);
    expect(geometry.getAttribute('aWeight').array).toBe(TRIANGLE.attributes.aWeight.array);
    expect(geometry.index?.count).toBe(3);
    expect(geometry.boundingSphere).not.toBeNull();
  });

  it('position이 없는 지오메트리도 만들 수 있다 (정점 셰이더가 위치를 계산하는 경우)', () => {
    const geometry = geometryFromData({ attributes: { aCorner: { array: new Float32Array([0, 1, 2, 3]), itemSize: 1 } } });
    expect(geometryLayout(geometry)).toEqual({ aCorner: 1 });
    expect(geometry.boundingSphere).toBeNull();
  });

  it('엔진 기본 메시는 모두 툰 셰이더의 정점 속성을 가진다', () => {
    expect(TOON_SHADER_SPEC.layout).toEqual(STANDARD_LAYOUT);
    for (const [kind, geometry] of Object.entries(createEngineMeshes())) {
      expect(layoutMismatches(STANDARD_LAYOUT, geometryLayout(geometry)), kind).toEqual([]);
    }
  });
});

describe('uniform 값', () => {
  it('배열 길이로 벡터와 행렬을 고른다', () => {
    expect(toThreeUniform(2)).toBe(2);
    expect(toThreeUniform(true)).toBe(true);
    expect(toThreeUniform([1, 2])).toBeInstanceOf(Vector2);
    expect(toThreeUniform([1, 2, 3])).toBeInstanceOf(Vector3);
    expect(toThreeUniform([1, 2, 3, 4])).toBeInstanceOf(Vector4);
    expect(toThreeUniform(new Float32Array(9))).toBeInstanceOf(Matrix3);
    expect(toThreeUniform(new Array(16).fill(0))).toBeInstanceOf(Matrix4);
    expect(() => toThreeUniform([1, 2, 3, 4, 5])).toThrow();
  });

  it('같은 모양이면 있는 객체에 값만 복사하고, 모양이 바뀌면 바꾼다', () => {
    const target: IUniform = { value: null };
    assignUniform(target, [1, 2, 3]);
    const vector = target.value;
    assignUniform(target, [4, 5, 6]);
    expect(target.value).toBe(vector);
    expect(target.value.toArray()).toEqual([4, 5, 6]);
    assignUniform(target, [1, 2]);
    expect(target.value).toBeInstanceOf(Vector2);
  });

  it('툰 재질을 툰 셰이더의 uniform으로 옮긴다', () => {
    const values = toonUniforms({
      baseColor: [1, 0, 0],
      emissive: [0, 0, 0],
      metallic: 0.5,
      roughness: 0.25,
      pattern: 3,
      receivesOccluder: true,
    });
    expect(Object.keys(values).sort()).toEqual(Object.keys(TOON_SHADER_SPEC.uniforms!).sort());
    expect(values.uRoughness).toBe(0.25);
  });
});
