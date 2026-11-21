import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES } from '../content/registry';
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
import { boxModel, houseBox } from './house';
import { rocketBox } from './rocket';
import { Moon, MOON_COLOR, MOON_ROUGHNESS } from './moon';
import { PLANET, surfaceDirection } from './planet';
import { PLAYER_RADIUS, Player, type MoveCommand } from './player';
import { SurfaceZone } from './surfaceZone';
import { Sun, SUN, SUN_EMISSIVE, SUN_ORBIT_EMISSIVE } from './sun';
import {
  SUN_EYE_WHITE_EMISSIVE,
  SUN_PUPIL_COLOR,
  sunBillboardBasis,
  sunEyes,
  sunRaysModel,
  type BillboardBasis,
  type BillboardView,
} from './sunFace';
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
/** 행성 표면의 색 (선형 RGB). 흰색에 가까운 무채색으로 고정이다. */
const PLANET_COLOR: Vec3 = [0.74, 0.74, 0.75];
/** 캐릭터의 색 (선형 RGB, sRGB #FCC812) */
const PLAYER_COLOR: Vec3 = [0.973, 0.578, 0.006];
const PLAYER_ROUGHNESS = 0.45;
/** 집 자리 상자의 색 (선형 RGB). 흰 행성과 노란 캐릭터 사이에서 구분되는 푸른 회색 */
const HOUSE_COLOR: Vec3 = [0.3, 0.36, 0.46];
/** 집 자리 상자. 그리기와 충돌에 함께 쓴다. */
const HOUSE_BOX = houseBox();
const HOUSE_MODEL = boxModel(HOUSE_BOX);
/** 로켓 자리 상자의 색 (선형 RGB). 집 상자와 구분되는 붉은색 */
const ROCKET_COLOR: Vec3 = [0.55, 0.1, 0.08];
/** 로켓 자리 상자. 위성 바로 아래 표면에 있다. 그리기와 충돌에 함께 쓴다. */
const ROCKET_BOX = rocketBox();
const ROCKET_MODEL = boxModel(ROCKET_BOX);

const boneMatrix = ({ origin, x, y, z }: BoneTransform): Mat4 => mat4FromBasis(origin, x, y, z);
/** 다리 메시의 기본 자세 뼈를 원점으로 되돌리는 행렬. 지금 뼈와 곱하면 스키닝 행렬이 된다. */
const REST_BONE_INVERSES = restBones().map((bone) => mat4RigidInverse(boneMatrix(bone)));
/** 지금 뼈의 행렬. 설계 치수의 다리 메시를 `CHARACTER_SCALE`만큼 키운다. */
const posedBoneMatrix = ({ origin, x, y, z }: BoneTransform): Mat4 =>
  mat4FromBasis(origin, scale(x, CHARACTER_SCALE), scale(y, CHARACTER_SCALE), scale(z, CHARACTER_SCALE));

/** 조명 환경. `lightDirection`은 시작할 때의 해 방향이고, 플레이 중에는 `World.environment`가 해를 따라 바꾼다. */
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

const DEFAULT_VIEW: BillboardView = { position: [0, 0, 0], up: [0, 1, 0] };

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
  readonly sun = new Sun(STUDIO_ENVIRONMENT.lightDirection);
  readonly moon = new Moon();

  private readonly zones: readonly ZoneInstance[];

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

    this.content = new ContentManager(
      {},
      entries.map((entry) => entry.content),
      onContentChange,
    );
  }

  fixedStep(dt: number, command: MoveCommand): void {
    this.sun.step(dt);
    this.moon.step(dt);
    this.player.step(dt, command, PLANET, [HOUSE_BOX, ROCKET_BOX]);
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
    this.content.update(dt);
  }

  /** 렌더링 보간이 적용된 물리 몸체의 위치 */
  interpolatedPlayerPosition(alpha: number): Vec3 {
    return lerp(this.player.previousPosition, this.player.position, alpha);
  }

  /**
   * `view`는 이번 프레임의 카메라다. 해 햇살 빌보드를 화면에 맞춰 세우는 데 쓴다.
   * 없으면 행성 중심에서 보는 것으로 친다.
   */
  buildDrawList(alpha: number, view: BillboardView = DEFAULT_VIEW): DrawItem[] {
    const sunPosition = this.sun.position(alpha);
    const sunBasis = sunBillboardBasis(sunPosition, view);
    const items: DrawItem[] = [
      drawItem(
        'sphere',
        PLANET.center,
        [PLANET.radius, PLANET.radius, PLANET.radius],
        material(PLANET_COLOR, 0.75, {
          pattern: SurfacePattern.Grid,
          showsZones: true,
          receivesOccluder: true,
        }),
      ),
      drawItemFromModel('box', HOUSE_MODEL, material(HOUSE_COLOR, 0.8)),
      drawItemFromModel('box', ROCKET_MODEL, material(ROCKET_COLOR, 0.7)),
      ...this.characterDrawItems(alpha),
      // 위성은 그림자 맵 범위 밖에 있으므로 그림자를 드리우지 않는다.
      drawItemFromModel('moon', this.moon.model(alpha), material(MOON_COLOR, MOON_ROUGHNESS), false),
      // 해는 빛을 내기만 하고 그림자를 드리우지 않는다.
      drawItem(
        'sphere',
        sunPosition,
        [SUN.radius, SUN.radius, SUN.radius],
        material([0, 0, 0], 1, { emissive: SUN_EMISSIVE }),
        QUAT_IDENTITY,
        false,
      ),
      drawItemFromModel('sunRays', sunRaysModel(sunPosition, SUN.radius, sunBasis), material([0, 0, 0], 1, { emissive: SUN_EMISSIVE }), false),
      ...this.sunEyeDrawItems(sunPosition, sunBasis, alpha),
      drawItemFromModel('ring', this.sunOrbitModel(), material([0, 0, 0], 1, { emissive: SUN_ORBIT_EMISSIVE }), false),
    ];
    return items;
  }

  /** 해 얼굴의 흰자와 검은자. 검은자는 캐릭터 몸을 바라본다. */
  private sunEyeDrawItems(sunPosition: Vec3, basis: BillboardBasis, alpha: number): DrawItem[] {
    const white = material([0, 0, 0], 1, { emissive: SUN_EYE_WHITE_EMISSIVE });
    const pupil = material(SUN_PUPIL_COLOR, 1);
    return sunEyes(sunPosition, SUN.radius, basis, this.walker.pose(alpha).body).flatMap((eye) => [
      drawItemFromModel('disk', eye.white, white, false),
      drawItemFromModel('disk', eye.pupil, pupil, false),
    ]);
  }

  /** 해 궤적 고리의 모델 행렬. 고리의 XY 평면을 궤도면에 맞추고 궤도 반지름만큼 키운다. */
  private sunOrbitModel(): Mat4 {
    const { start, ahead, axis } = this.sun;
    const r = SUN.orbitRadius;
    return mat4FromBasis(PLANET.center, scale(start, r), scale(ahead, r), scale(axis, r));
  }

  /** 직사광의 방향을 해의 방향에 맞춘 조명 환경 */
  environment(alpha: number): Environment {
    return { ...STUDIO_ENVIRONMENT, lightDirection: this.sun.direction(alpha) };
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
