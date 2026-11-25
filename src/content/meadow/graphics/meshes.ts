import { BufferAttribute, BufferGeometry } from 'three';
import type { Graphics } from '../../../engine/render/graphics';
import { MEADOW, meadowPoint } from '../objects/meadowTerrain';

/** 초원 땅 메시. 수평 격자의 정점을 `meadowPoint`로 땅 위에 놓은 월드 좌표 지오메트리다. */
function createGroundGeometry(): BufferGeometry {
  const { extent, segments } = MEADOW;
  const row = segments + 1;
  const positions = new Float32Array(row * row * 3);
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const x = -extent + (2 * extent * i) / segments;
      const z = -extent + (2 * extent * j) / segments;
      positions.set(meadowPoint(x, z), (j * row + i) * 3);
    }
  }
  const indices = new Uint32Array(segments * segments * 6);
  let k = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i;
      // 위에서 보아 반시계 방향이 앞면이다 (+Z가 아래쪽 줄).
      indices.set([a, a + row, a + 1, a + 1, a + row, a + row + 1], k);
      k += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/** 초원 씬의 메시를 등록한다. */
export function defineMeadowMeshes(graphics: Graphics): void {
  graphics.defineMesh('meadowGround', createGroundGeometry());
}
