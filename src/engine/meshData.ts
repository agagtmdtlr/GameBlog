/**
 * three.js 없이 만드는 메시 데이터의 모양. 콘텐츠의 모양 파일이 이 모양으로 점을 만들고,
 * 콘텐츠의 그래픽 파일이 `render/geometry.ts`의 도우미로 지오메트리를 만든다.
 */

/** 회전체 단면. 아래에서 위로 가는 [반지름, 높이] 점 */
export type Profile = [radius: number, y: number][];

/** 위치·법선·색인 배열 */
export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** 삼각형 목록 지오메트리의 정점 배열. 면마다 정점을 따로 두어 법선이 면을 따른다. */
export interface TriangleMesh {
  positions: Float32Array;
  normals: Float32Array;
}
