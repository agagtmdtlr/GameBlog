import {
  BufferAttribute,
  BufferGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Vector2,
  type Matrix4,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MeshArrays, Profile, TriangleMesh } from '../meshData';

/**
 * 콘텐츠가 메시를 등록할 때 쓰는 three.js 지오메트리 도우미.
 * 모두 툰 셰이더가 읽는 `position`, `normal` 속성을 가진다.
 */

/** 위치·법선·색인 배열로 만든 지오메트리 */
export function arrayGeometry({ positions, normals, indices }: MeshArrays): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** 색인 없는 삼각형 목록 지오메트리 */
export function triangleGeometry({ positions, normals }: TriangleMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
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
