import { BufferAttribute, BufferGeometry, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Graphics } from '../../../engine/render/graphics';
import type { SkinSource } from '../../../engine/skinning';
import characterModelUrl from './character.glb?url';
import { LEG_BONE_COUNT } from './walker';

/** `walker.ts`의 뼈 순서 [허벅지, 정강이, 발]에 맞춘 glTF 뼈 이름 */
const LEG_BONE_NAMES = ['Thigh', 'Shin', 'Foot'];

/**
 * 캐릭터(플레이어, NPC)가 쓰는 메시를 등록한다. `pyramid`는 바로 등록하고, 다리 스킨 메시 `leg`는
 * `character.glb`를 비동기로 불러와 등록한다. 불러오기 전에는 다리가 보이지 않고 몸만 보인다.
 */
export function defineCharacterMeshes(graphics: Graphics): Promise<void> {
  graphics.defineMesh('pyramid', createPyramidGeometry());
  return loadLeg(graphics);
}

/**
 * Blender에서 내보낸 캐릭터 모델(`tools/blender/build_character.py`)을 불러와 다리 스킨 메시를 채운다.
 * 메시 Leg의 기본 자세 정점과 뼈 번호·가중치만 쓰고, 내보낸 뼈의 변환은 쓰지 않는다.
 * 뼈 번호는 이름으로 찾아 [Thigh, Shin, Foot] 순서로 바꾼다.
 */
async function loadLeg(graphics: Graphics): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync(characterModelUrl);
  // instanceof 대신 isSkinnedMesh로 확인한다. 개발 서버의 의존성 최적화 중에는 three.js가 두 번 불러와질 수 있다.
  const leg = gltf.scene.getObjectByName('Leg') as SkinnedMesh | undefined;
  if (!leg?.isSkinnedMesh) throw new Error('캐릭터 모델에 Leg 스킨 메시가 없습니다.');
  const remap = leg.skeleton.bones.map((bone) => LEG_BONE_NAMES.indexOf(bone.name));
  if (remap.includes(-1) || remap.length !== LEG_BONE_COUNT) {
    throw new Error(`다리 뼈 이름이 ${LEG_BONE_NAMES.join(', ')}가 아닙니다.`);
  }

  const geometry = leg.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const count = position.count;
  const source: SkinSource = {
    positions: new Float32Array(count * 3),
    normals: new Float32Array(count * 3),
    boneIndices: new Uint8Array(count * 4),
    boneWeights: new Float32Array(count * 4),
  };
  for (let i = 0; i < count; i++) {
    source.positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
    source.normals.set([normal.getX(i), normal.getY(i), normal.getZ(i)], i * 3);
    for (let k = 0; k < 4; k++) {
      source.boneIndices[i * 4 + k] = remap[skinIndex.getComponent(i, k)];
      source.boneWeights[i * 4 + k] = skinWeight.getComponent(i, k);
    }
  }
  graphics.defineSkinnedMesh('leg', geometry, source);
}

/**
 * NPC의 피라미드 몸(사각뿔). 상자처럼 한 변 1인 공간에 맞춰 밑면이 y = -0.5, 꼭짓점이 (0, 0.5, 0)이다.
 * 면마다 정점을 따로 두어 법선이 면을 따르므로 모서리가 각져 보인다.
 */
function createPyramidGeometry(): BufferGeometry {
  const h = 0.5;
  const apex = [0, h, 0];
  const corners = [
    [-h, -h, h],
    [h, -h, h],
    [h, -h, -h],
    [-h, -h, -h],
  ];
  const triangles: number[][] = [];
  // 옆면: 바깥에서 볼 때 반시계 방향
  for (let i = 0; i < 4; i++) triangles.push(corners[i], corners[(i + 1) % 4], apex);
  // 밑면: 아래에서 볼 때 반시계 방향
  triangles.push(corners[0], corners[3], corners[2], corners[0], corners[2], corners[1]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles.flat()), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
