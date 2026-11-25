import {
  add,
  cross,
  mat4FromBasis,
  mat4Identity,
  mat4Multiply,
  mat4RigidInverse,
  normalMatrix,
  scale,
  type Mat4,
  type Vec3,
} from '../../../engine/math';
import { SurfacePattern, type DrawItem, type Material, type MeshKind } from '../../../engine/frame';
import { BODY_FORMS, type BodyShape } from './bodyShape';
import { CHARACTER_SCALE, LEG_BONE_COUNT, restBones, type BoneTransform, type Walker } from './walker';

/** 캐릭터 몸과 다리의 거칠기 */
export const CHARACTER_ROUGHNESS = 0.45;

const boneMatrix = ({ origin, x, y, z }: BoneTransform): Mat4 => mat4FromBasis(origin, x, y, z);
/** 다리 메시의 기본 자세 뼈를 원점으로 되돌리는 행렬. 지금 뼈와 곱하면 스키닝 행렬이 된다. */
const REST_BONE_INVERSES = restBones().map((bone) => mat4RigidInverse(boneMatrix(bone)));
/** 지금 뼈의 행렬. 설계 치수의 다리 메시를 `CHARACTER_SCALE`만큼 키운다. */
const posedBoneMatrix = ({ origin, x, y, z }: BoneTransform): Mat4 =>
  mat4FromBasis(origin, scale(x, CHARACTER_SCALE), scale(y, CHARACTER_SCALE), scale(z, CHARACTER_SCALE));

function item(mesh: MeshKind, model: Mat4, material: Material): DrawItem<Material> {
  return { mesh, model, normal: normalMatrix(model), material, castShadow: true };
}

/**
 * 캐릭터 하나의 몸, 왼다리, 오른다리 순서. 플레이어와 NPC가 같은 다리를 쓰고 몸 모양과 색만 다르다.
 * 모난 몸(정육면체, 피라미드)은 진행 방향을 보고 엉덩이와 함께 기운다. 구는 대칭이라 돌리지 않는다.
 * 메시는 `defineCharacterMeshes`로 등록한 것을 쓴다.
 */
export function characterDrawItems(walker: Walker, alpha: number, color: Vec3, shape: BodyShape): DrawItem<Material>[] {
  const pose = walker.pose(alpha);
  const mat: Material = {
    baseColor: color,
    roughness: CHARACTER_ROUGHNESS,
    metallic: 0,
    emissive: [0, 0, 0],
    pattern: SurfacePattern.None,
    receivesOccluder: false,
  };
  const bones = walker.solveLegs(pose).map(posedBoneMatrix);
  const leg = (first: number): DrawItem<Material> => ({
    ...item('leg', mat4Identity(), mat),
    skin: bones.slice(first, first + LEG_BONE_COUNT).map((bone, i) => mat4Multiply(bone, REST_BONE_INVERSES[i])),
  });
  const form = BODY_FORMS[shape];
  const { right, up } = walker.hipAxes(pose);
  // 오른쪽 × 위 = 뒤쪽. 오른손 기저여야 면의 감김 방향이 뒤집히지 않는다. 모양이 앞뒤 대칭이라 뒤쪽을 Z로 쓴다.
  const back = cross(right, up);
  const [sx, sy, sz] = form.size;
  const body = item(
    form.mesh,
    mat4FromBasis(add(pose.body, scale(up, form.lift)), scale(right, sx), scale(up, sy), scale(back, sz)),
    mat,
  );
  return [body, leg(0), leg(LEG_BONE_COUNT)];
}
