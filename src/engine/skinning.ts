import type { Mat4 } from './math';

/** 기본 자세의 정점과 뼈 가중치. 정점마다 뼈 4개까지 쓴다. */
export interface SkinSource {
  positions: Float32Array;
  normals: Float32Array;
  /** 정점마다 4개의 뼈 번호 */
  boneIndices: Uint8Array;
  /** 정점마다 4개의 가중치. 합이 1이다. */
  boneWeights: Float32Array;
}

/**
 * 선형 블렌드 스키닝을 CPU에서 한다. 뼈 행렬은 회전과 이동만 있어야 하며,
 * 법선은 섞은 행렬의 회전 부분으로 옮긴 뒤 정규화한다.
 * 정점이 수백 개뿐이라 셰이더와 그림자 패스를 그대로 쓰려고 CPU에서 처리한다.
 */
export function skinVertices(source: SkinSource, bones: readonly Mat4[], outPositions: Float32Array, outNormals: Float32Array): void {
  const { positions, normals, boneIndices, boneWeights } = source;
  const count = positions.length / 3;
  for (let v = 0; v < count; v++) {
    const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    let ox = 0, oy = 0, oz = 0, mx = 0, my = 0, mz = 0;
    for (let k = 0; k < 4; k++) {
      const w = boneWeights[v * 4 + k];
      if (w === 0) continue;
      const m = bones[boneIndices[v * 4 + k]];
      ox += w * (m[0] * px + m[4] * py + m[8] * pz + m[12]);
      oy += w * (m[1] * px + m[5] * py + m[9] * pz + m[13]);
      oz += w * (m[2] * px + m[6] * py + m[10] * pz + m[14]);
      mx += w * (m[0] * nx + m[4] * ny + m[8] * nz);
      my += w * (m[1] * nx + m[5] * ny + m[9] * nz);
      mz += w * (m[2] * nx + m[6] * ny + m[10] * nz);
    }
    const len = Math.hypot(mx, my, mz) || 1;
    outPositions[v * 3] = ox;
    outPositions[v * 3 + 1] = oy;
    outPositions[v * 3 + 2] = oz;
    outNormals[v * 3] = mx / len;
    outNormals[v * 3 + 1] = my / len;
    outNormals[v * 3 + 2] = mz / len;
  }
}
