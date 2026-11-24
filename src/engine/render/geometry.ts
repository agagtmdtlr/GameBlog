import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  SphereGeometry,
  Vector2,
  type Matrix4,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MeshArrays, Profile, TriangleMesh } from '../meshData';
import { vertexCount, type GeometryData } from '../vertex';

/**
 * 콘텐츠가 메시를 등록할 때 쓰는 three.js 지오메트리 도우미.
 * `geometryFromData`는 아무 이름·성분 수의 정점 속성을 그대로 옮긴다.
 * 나머지 도우미는 툰 셰이더가 읽는 `position`, `normal` 속성을 만든다.
 */

/** 이름 붙인 정점 속성들(`GeometryData`)로 만든 지오메트리. 속성 이름이 그대로 GLSL `in` 이름이 된다. */
export function geometryFromData(data: GeometryData): BufferGeometry {
  vertexCount(data);
  const geometry = new BufferGeometry();
  for (const [name, { array, itemSize, normalized }] of Object.entries(data.attributes)) {
    geometry.setAttribute(name, new BufferAttribute(array, itemSize, normalized ?? false));
  }
  if (data.index) geometry.setIndex(new BufferAttribute(data.index, 1));
  if (geometry.getAttribute('position')?.itemSize === 3) geometry.computeBoundingSphere();
  return geometry;
}

/** 지오메트리가 가진 정점 속성 이름 → 성분 수 */
export function geometryLayout(geometry: BufferGeometry): Record<string, number> {
  const layout: Record<string, number> = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) layout[name] = attribute.itemSize;
  return layout;
}

/** 위치·법선·색인 배열로 만든 지오메트리 */
export function arrayGeometry({ positions, normals, indices }: MeshArrays): BufferGeometry {
  return geometryFromData({
    attributes: { position: { array: positions, itemSize: 3 }, normal: { array: normals, itemSize: 3 } },
    index: indices,
  });
}

/** 색인 없는 삼각형 목록 지오메트리 */
export function triangleGeometry({ positions, normals }: TriangleMesh): BufferGeometry {
  return geometryFromData({
    attributes: { position: { array: positions, itemSize: 3 }, normal: { array: normals, itemSize: 3 } },
  });
}

/** 단면을 돌린 회전체. 이음매 법선이 부드럽게 이어지도록 정점을 합친다. */
export function latheGeometry(profile: Profile, radialSegments: number): BufferGeometry {
  const lathe = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), radialSegments);
  lathe.deleteAttribute('normal');
  lathe.deleteAttribute('uv');
  const geometry = mergeVertices(lathe);
  lathe.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 고르게 나뉜 정이십면체 구의 정점을 `displace`로 민 지오메트리. `displace`는 위치 배열을 제자리에서 고친다.
 * 면마다 따로인 정점을 합쳐 이음매 없이 부드러운 법선을 계산한다.
 */
export function displacedSphereGeometry(detail: number, displace: (positions: Float32Array) => void): BufferGeometry {
  const sphere = new IcosahedronGeometry(1, detail);
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const geometry = mergeVertices(sphere);
  sphere.dispose();
  displace(geometry.getAttribute('position').array as Float32Array);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 부품 지오메트리를 놓고 합친다. 합치려고 uv를 지우고 색인 없는 지오메트리로 바꾼다. */
export function mergeParts(parts: readonly [BufferGeometry, Matrix4?][]): BufferGeometry {
  const prepared = parts.map(([geometry, matrix]) => {
    if (matrix) geometry.applyMatrix4(matrix);
    geometry.deleteAttribute('uv');
    if (!geometry.index) return geometry;
    const flat = geometry.toNonIndexed();
    geometry.dispose();
    return flat;
  });
  const merged = mergeGeometries(prepared);
  for (const part of prepared) part.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** 엔진이 늘 가진 기본 메시 (`frame.ts`의 `ENGINE_MESHES`). 정점 속성은 `position`, `normal`, `uv`다. */
export function createEngineMeshes(): Record<string, BufferGeometry> {
  return {
    // 큰 구에도 쓰므로 촘촘하게 나눈다. 성기면 구가 땅에 살짝 묻혀 보인다.
    sphere: new SphereGeometry(1, 96, 64),
    box: new BoxGeometry(1, 1, 1),
    // 축을 Z로 돌린 원기둥
    cylinder: new CylinderGeometry(0.5, 0.5, 1, 24).rotateX(Math.PI / 2),
  };
}
