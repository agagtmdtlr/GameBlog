import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES, DEFAULT_PLANET_COLOR, INITIAL_CONTENT_ID } from '../content/registry';
import type { ContentEntry, GraphicsContent } from '../content/types';
import {
  lerp,
  mat4FromBasis,
  mat4FromTRS,
  mat4Identity,
  mat4Multiply,
  mat4RigidInverse,
  normalize,
  normalMatrix,
  scale,
  QUAT_IDENTITY,
  type Mat4,
  type Quat,
  type Vec3,
} from '../engine/math';
import {
  LEG_BONE_COUNT,
  SurfacePattern,
  type ContentFrame,
  type DrawItem,
  type Environment,
  type Material,
  type MeshKind,
  type SurfaceZoneFrame,
} from '../engine/frame';
import { ColorTransition } from './colorTransition';
import { PLANET, surfaceDirection } from './planet';
import { PLAYER_RADIUS, Player, type MoveCommand } from './player';
import { SurfaceZone } from './surfaceZone';
import { BODY_RADIUS, CHARACTER_SCALE, restBones, Walker, type BoneTransform } from './walker';

/** 행성의 꼭대기에서 시작한다. */
const SPAWN: Vec3 = [0, PLANET.radius + PLAYER_RADIUS, 0];

/** 작동 영역의 표면 반지름 */
const ZONE_RADIUS = 1.5;
/** 영역 경계에서 이만큼(표면 거리) 더 벗어나야 다시 작동한다. */
const ZONE_REARM_MARGIN = PLAYER_RADIUS;
/** 영역 경계선의 표면 폭 */
const ZONE_EDGE_WIDTH = 0.12;
const ZONE_FADE_RATE = 7;
const COLOR_TRANSITION_SECONDS = 0.3;
/** 캐릭터의 색 (선형 RGB, sRGB #FCC812). 작동 영역은 행성 표면의 색을 바꾸고 캐릭터는 그대로 둔다. */
const PLAYER_COLOR: Vec3 = [0.973, 0.578, 0.006];
const PLAYER_ROUGHNESS = 0.45;

const boneMatrix = ({ origin, x, y, z }: BoneTransform): Mat4 => mat4FromBasis(origin, x, y, z);
/** 다리 메시의 기본 자세 뼈를 원점으로 되돌리는 행렬. 지금 뼈와 곱하면 스키닝 행렬이 된다. */
const REST_BONE_INVERSES = restBones().map((bone) => mat4RigidInverse(boneMatrix(bone)));
/** 지금 뼈의 행렬. 설계 치수의 다리 메시를 `CHARACTER_SCALE`만큼 키운다. */
const posedBoneMatrix = ({ origin, x, y, z }: BoneTransform): Mat4 =>
  mat4FromBasis(origin, scale(x, CHARACTER_SCALE), scale(y, CHARACTER_SCALE), scale(z, CHARACTER_SCALE));

export const STUDIO_ENVIRONMENT: Environment = {
  // 기본 시점에서 그림자가 구의 앞쪽 옆으로 떨어져 잘 보이는 방향
  lightDirection: normalize([0.6, 0.72, -0.28]),
  lightColor: [2.75, 2.65, 2.5],
  skyColor: [0.62, 0.64, 0.68],
  groundColor: [0.3, 0.29, 0.28],
  background: [0, 0, 0],
  shadowRadius: 24,
};

function material(baseColor: Vec3, roughness: number, overrides: Partial<Material> = {}): Material {
  return {
    baseColor,
    roughness,
    metallic: 0,
    emissive: [0, 0, 0],
    pattern: SurfacePattern.None,
    showsZones: false,
    receivesOccluder: false,
    ...overrides,
  };
}

function drawItem(
  mesh: MeshKind,
  position: Vec3,
  size: Vec3,
  mat: Material,
  rotation: Quat = QUAT_IDENTITY,
  castShadow = true,
): DrawItem {
  return drawItemFromModel(mesh, mat4FromTRS(position, rotation, size), mat, castShadow);
}

function drawItemFromModel(mesh: MeshKind, model: Mat4, mat: Material, castShadow = true): DrawItem {
  return { mesh, model, normal: normalMatrix(model), material: mat, castShadow };
}

interface ZoneInstance {
  entry: ContentEntry;
  zone: SurfaceZone;
  /** 활성 콘텐츠의 영역이면 1로 다가간다. */
  glow: number;
  /** 구가 영역 위에 있으면 1로 다가간다. */
  presence: number;
}

/** 월드를 구성하고 게임 규칙을 진행한다. GPU와 DOM에 의존하지 않는다. */
export class World {
  readonly player = new Player(SPAWN);
  readonly walker = new Walker(SPAWN, PLANET);
  readonly content: ContentManager;

  private readonly zones: readonly ZoneInstance[];
  private readonly planetColor = new ColorTransition(DEFAULT_PLANET_COLOR, COLOR_TRANSITION_SECONDS);

  constructor(
    entries: readonly ContentEntry[] = CONTENT_ENTRIES,
    onContentChange?: (content: GraphicsContent) => void,
  ) {
    this.zones = entries.map((entry) => ({
      entry,
      zone: new SurfaceZone(
        surfaceDirection(entry.zone.latitude, entry.zone.longitude),
        ZONE_RADIUS / PLANET.radius,
        ZONE_REARM_MARGIN / PLANET.radius,
      ),
      glow: 0,
      presence: 0,
    }));

    const { planetColor } = this;
    this.content = new ContentManager(
      { planet: { setSurfaceColor: (color) => planetColor.setTarget(color) } },
      entries.map((entry) => entry.content),
      onContentChange,
    );
    if (entries.some((entry) => entry.content.id === INITIAL_CONTENT_ID)) {
      this.content.activate(INITIAL_CONTENT_ID);
    }
  }

  fixedStep(dt: number, command: MoveCommand): void {
    this.player.step(dt, command, PLANET);
    this.walker.step(dt, this.player);

    const fade = 1 - Math.exp(-ZONE_FADE_RATE * dt);
    for (const instance of this.zones) {
      const { zone, entry } = instance;
      if (zone.update(this.player.position, PLANET.center)) this.content.activate(entry.content.id);
      const targetGlow = this.content.activeId === entry.content.id ? 1 : 0;
      const targetPresence = zone.contains(this.player.position, PLANET.center) ? 1 : 0;
      instance.glow += (targetGlow - instance.glow) * fade;
      instance.presence += (targetPresence - instance.presence) * fade;
    }
    this.planetColor.update(dt);
    this.content.update(dt);
  }

  /** 렌더링 보간이 적용된 물리 몸체의 위치 */
  interpolatedPlayerPosition(alpha: number): Vec3 {
    return lerp(this.player.previousPosition, this.player.position, alpha);
  }

  get currentPlanetColor(): Vec3 {
    return this.planetColor.current;
  }

  buildDrawList(alpha: number): DrawItem[] {
    const items: DrawItem[] = [
      drawItem(
        'sphere',
        PLANET.center,
        [PLANET.radius, PLANET.radius, PLANET.radius],
        material(this.planetColor.current, 0.75, {
          pattern: SurfacePattern.Grid,
          showsZones: true,
          receivesOccluder: true,
        }),
      ),
      ...this.characterDrawItems(alpha),
    ];
    return items;
  }

  /** 앰비언트 오클루전을 만드는 캐릭터 몸 */
  occluder(alpha: number): { center: Vec3; radius: number } {
    return { center: this.walker.pose(alpha).body, radius: BODY_RADIUS };
  }

  /** 행성 표면에 그릴 작동 영역 */
  buildSurfaceZones(): SurfaceZoneFrame[] {
    return this.zones.map(({ entry, zone, glow, presence }) => ({
      direction: zone.direction,
      angularRadius: zone.angularRadius,
      edgeWidth: ZONE_EDGE_WIDTH / PLANET.radius,
      color: entry.zone.color,
      glow,
      presence,
    }));
  }

  /** 전용 렌더러가 그릴 콘텐츠의 값. 이번 프레임에 보이는 것만 담는다. 지금은 없다. */
  buildContentFrames(_alpha: number): ContentFrame[] {
    return [];
  }

  /** 몸, 왼다리, 오른다리 순서 */
  private characterDrawItems(alpha: number): DrawItem[] {
    const pose = this.walker.pose(alpha);
    const mat = material(PLAYER_COLOR, PLAYER_ROUGHNESS);
    const bones = this.walker.solveLegs(pose).map(posedBoneMatrix);
    const leg = (first: number): DrawItem => ({
      ...drawItemFromModel('leg', mat4Identity(), mat),
      skin: bones.slice(first, first + LEG_BONE_COUNT).map((bone, i) => mat4Multiply(bone, REST_BONE_INVERSES[i])),
    });
    return [
      drawItem('sphere', pose.body, [BODY_RADIUS, BODY_RADIUS, BODY_RADIUS], mat),
      leg(0),
      leg(LEG_BONE_COUNT),
    ];
  }
}
