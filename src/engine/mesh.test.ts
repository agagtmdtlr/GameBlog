import { describe, expect, it } from 'vitest';
import { cross, dot, sub, type Vec3 } from './math';
import {
  createBoxData,
  createCylinderData,
  createPlaneData,
  createSphereData,
  type MeshData,
} from './mesh';

function vertex(data: MeshData, index: number, offset: number): Vec3 {
  const i = index * 6 + offset;
  return [data.vertices[i], data.vertices[i + 1], data.vertices[i + 2]];
}

describe.each([
  ['구', createSphereData()],
  ['박스', createBoxData()],
  ['원기둥', createCylinderData()],
  ['평면', createPlaneData()],
])('%s 메시', (_name, data) => {
  it('인덱스가 정점 범위 안에 있다', () => {
    const count = data.vertices.length / 6;
    expect(Math.max(...data.indices)).toBeLessThan(count);
  });

  it('모든 삼각형이 정점 법선 쪽을 바라본다(CCW)', () => {
    for (let i = 0; i < data.indices.length; i += 3) {
      const [a, b, c] = [data.indices[i], data.indices[i + 1], data.indices[i + 2]];
      const pa = vertex(data, a, 0);
      const faceNormal = cross(sub(vertex(data, b, 0), pa), sub(vertex(data, c, 0), pa));
      expect(dot(faceNormal, vertex(data, a, 3))).toBeGreaterThan(0);
    }
  });
});
