"""플레이어 캐릭터의 다리를 하나로 이어진 스킨 메시로 만들어 glTF로 내보낸다.

실행 (저장소 루트에서):
    blender --background --factory-startup --python tools/blender/build_character.py

결과: src/assets/character.glb (스킨 메시 Leg, 뼈 Thigh, Shin, Foot)
`--save-blend`를 붙이면 같은 장면을 tools/blender/character.blend로도 저장한다.
    blender --background --factory-startup --python tools/blender/build_character.py -- --save-blend

다리 하나를 오른쪽 다리의 서 있는 자세(기본 자세)로 만든다. 게임은 왼쪽 다리에도 같은 메시를 쓴다.
기본 자세 규약 (glTF 좌표). 게임의 `game/walker.ts`의 `LEG_REST`와 같아야 한다.
- 원점이 엉덩이 관절, +X가 몸 바깥, +Y가 위, 다리는 Z = 0 평면에 놓인다.
- 무릎 REST_KNEE, 발목 REST_ANKLE. 발바닥은 발목에서 ANKLE_HEIGHT 아래, 발끝은 +X를 향한다.
Blender는 Z가 위이므로 glTF (x, y, z)를 Blender (x, -z, y)로 옮겨 모델링한다.

가중치는 뼈마다 정점에서 뼈 선분까지 거리의 역수(6제곱)로 정해 관절 부근이 부드럽게 섞이게 한다.
게임은 내보낸 뼈의 변환은 쓰지 않고, 정점의 뼈 번호와 가중치만 읽는다.
"""

import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import intersect_point_line

# walker.ts의 LEG, LEG_REST 값과 같아야 한다 (glTF 좌표 x, y).
REST_KNEE = (0.749, 0.22)
REST_ANKLE = (0.72, -1.09)
ANKLE_HEIGHT = 0.12
# 발끝과 뒤꿈치는 발목 기준으로 둔다.
REST_TOE = (REST_ANKLE[0] + 0.35, REST_ANKLE[1] - 0.06)
REST_HEEL = (REST_ANKLE[0] + 0.01, REST_ANKLE[1] - 0.06)
# 정강이 중간의 굵기 조절점 (무릎에서 발목 쪽으로 이 비율만큼)
SHIN_MID = 0.53
# 엉덩이에서 몸 중심 쪽으로 더 뻗는 점. 다리가 몸 구 안에서 시작해 이음매가 보이지 않는다.
# 엉덩이가 몸 중심에서 바깥 위(walker.ts의 HIP_SIDE, HIP_UP)에 있으므로 안쪽 아래로 뻗는다.
HIP_INSET = (-0.1, -0.1)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "src" / "assets" / "character.glb"
BLEND_OUTPUT = Path(__file__).resolve().parent / "character.blend"

WEIGHT_POWER = 6
MIN_WEIGHT = 0.01


def blender(x, y):
    """glTF의 Z = 0 평면 위 점 (x, y)를 Blender 좌표로 옮긴다."""
    return Vector((x, 0.0, y))


HIP = blender(0.0, 0.0)
KNEE = blender(*REST_KNEE)
ANKLE = blender(*REST_ANKLE)
TOE = blender(*REST_TOE)
SOLE_Z = REST_ANKLE[1] - ANKLE_HEIGHT

# 뼈 이름과 선분. 게임은 이 이름으로 뼈 순서를 맞춘다.
BONES = [("Thigh", HIP, KNEE), ("Shin", KNEE, ANKLE), ("Foot", ANKLE, TOE)]


def build_leg_mesh():
    """스킨 모디파이어로 엉덩이에서 발끝까지 이어진 관을 만들고 서브디비전을 적용한다."""
    # (점, 반지름). 엉덩이 안쪽으로 조금 더 뻗어 몸 구 안에서 시작하게 한다.
    points = [
        (blender(*HIP_INSET), (0.15, 0.15)),
        (HIP, (0.155, 0.155)),
        (KNEE, (0.21, 0.21)),
        (blender(*[k + (a - k) * SHIN_MID for k, a in zip(REST_KNEE, REST_ANKLE)]), (0.19, 0.19)),
        (ANKLE, (0.15, 0.15)),
        (blender(*REST_HEEL), (0.17, 0.14)),
        (TOE, (0.12, 0.1)),
    ]
    edges = [(i, i + 1) for i in range(len(points) - 1)]
    skeleton = bpy.data.meshes.new("LegSkeleton")
    skeleton.from_pydata([p for p, _ in points], edges, [])
    obj = bpy.data.objects.new("Leg", skeleton)
    bpy.context.collection.objects.link(obj)

    skin = obj.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    for i, (_, radius) in enumerate(points):
        vertex = skeleton.skin_vertices[0].data[i]
        vertex.radius = radius
        vertex.use_root = i == 0
    subsurf = obj.modifiers.new("Subsurf", "SUBSURF")
    subsurf.levels = 2
    subsurf.render_levels = 2

    depsgraph = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    obj.data = baked
    baked.name = "Leg"
    bpy.data.meshes.remove(skeleton)

    # 발바닥을 평평하게 깎는다.
    bm = bmesh.new()
    bm.from_mesh(baked)
    for v in bm.verts:
        if v.co.z < SOLE_Z:
            v.co.z = SOLE_Z
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(baked)
    bm.free()
    baked.shade_smooth()
    return obj


def distance_to_segment(p, a, b):
    closest, t = intersect_point_line(p, a, b)
    if t < 0:
        closest = a
    elif t > 1:
        closest = b
    return (p - closest).length


def assign_weights(obj):
    groups = [obj.vertex_groups.new(name=name) for name, _, _ in BONES]
    for v in obj.data.vertices:
        raw = [1.0 / max(distance_to_segment(v.co, a, b), 1e-3) ** WEIGHT_POWER for _, a, b in BONES]
        total = sum(raw)
        weights = [w / total for w in raw]
        weights = [w if w >= MIN_WEIGHT else 0.0 for w in weights]
        total = sum(weights)
        for group, w in zip(groups, weights):
            if w > 0:
                group.add([v.index], w / total, "REPLACE")


def build_armature(leg):
    data = bpy.data.armatures.new("LegArmature")
    armature = bpy.data.objects.new("LegArmature", data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    parent = None
    for name, head, tail in BONES:
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent is not None:
            bone.parent = parent
            bone.use_connect = True
        parent = bone
    bpy.ops.object.mode_set(mode="OBJECT")

    leg.parent = armature
    modifier = leg.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    leg = build_leg_mesh()
    assign_weights(leg)
    build_armature(leg)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        export_yup=True,
        export_skins=True,
        export_animations=False,
        export_texcoords=False,
        export_materials="NONE",
    )
    print(f"exported {OUTPUT}")

    if "--save-blend" in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUTPUT))
        print(f"saved {BLEND_OUTPUT}")


build()
