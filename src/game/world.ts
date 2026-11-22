import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES } from '../content/registry';
import type { ContentEntry, GraphicsContent } from '../content/types';
import {
  add,
  cross,
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
import type { Billboard } from '../engine/billboard';
import { placeStars } from '../engine/starfield';
import { sunRaysExtent } from '../engine/sunRays';
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
import { Alien, ALIEN_ROUGHNESS, alienSpawn, type AlienPart } from './alien';
import { Moon, MOON_COLOR, MOON_ROUGHNESS } from './moon';
import { PLANET, surfaceDirection } from './planet';
import { DREAM_PROPS, PROP_COLLIDERS, TERRAIN, type DreamProp } from './terrain';
import { groundRadius, type Obstacle } from '../physics/collision';
import { separateBodies, Wanderer, type Random } from './npc';
import { PLAYER_RADIUS, Player, type MoveCommand } from './player';
import { SURFACE_OBJECTS, type SurfaceObject } from './surfaceScene';
import { ROCKET_SHAPE } from '../engine/rocketShape';
import { SurfaceZone } from './surfaceZone';
import { Train, type TrainPartModel } from './train';
import { TRACK_SHAPE } from '../engine/trackPath';
import { Sun, SUN, SUN_EMISSIVE, SUN_ORBIT_EMISSIVE } from './sun';
import {
  SUN_EYE_WHITE_EMISSIVE,
  SUN_FACE,
  SUN_PUPIL_COLOR,
  sunBillboardBasis,
  sunEyes,
  type BillboardView,
} from './sunFace';
import { BODY_FORMS, type BodyShape } from './bodyShape';
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
/** 행성 땅의 바탕 색 (선형 RGB). 셰이더(`SurfacePattern.Dreamy`)가 여기에 파스텔 물결을 곱한다. */
const PLANET_COLOR: Vec3 = [0.95, 0.95, 0.95];
/** 지형물의 거칠기. 은은한 하이라이트가 남는다. */
const PROP_ROUGHNESS = 0.6;
/** 캐릭터의 색 (선형 RGB, sRGB #FCC812) */
const PLAYER_COLOR: Vec3 = [0.973, 0.578, 0.006];
const PLAYER_ROUGHNESS = 0.45;
export interface NpcSpec {
  /** 시작 위치 (행성 표면 위 몸 중심) */
  spawn: Vec3;
  /** 색 (선형 RGB) */
  color: Vec3;
  /** 몸 모양. 다리와 걸음은 플레이어와 같다. */
  shape: BodyShape;
}

const npcAt = (latitude: number, longitude: number, color: Vec3, shape: BodyShape): NpcSpec => ({
  spawn: scale(
    surfaceDirection(latitude, longitude),
    groundRadius(TERRAIN, surfaceDirection(latitude, longitude)) + PLAYER_RADIUS,
  ),
  color,
  shape,
});

/**
 * 돌아다니는 NPC 목록. 줄을 더하거나 빼면 수가 바뀐다.
 * 첫째는 시작할 때 보이는 집 자리 옆이고, 나머지는 행성 둘레에 흩어 둔다.
 */
export const NPCS: readonly NpcSpec[] = [
  npcAt(74, 145, [0.078, 0.434, 0.871], 'cube'), // 하늘색 #4FB0F0
  npcAt(45, 70, [0.871, 0.162, 0.332], 'pyramid'), // 분홍 #F0709C
  npcAt(10, 290, [0.15, 0.597, 0.114], 'sphere'), // 초록 #6CCB5F
  npcAt(-25, 10, [0.376, 0.202, 0.807], 'cube'), // 보라 #A57CE8
  npcAt(-60, 200, [0.871, 0.254, 0.045], 'pyramid'), // 주황 #F08A3C
];
/**
 * 둥둥 떠다니는 문어 꼴 외계인의 시작 자리 (위도, 경도). 줄을 더하면 수가 는다.
 * 첫째는 시작할 때 보이는 집 자리 왼쪽 앞이다.
 */
export const ALIEN_SPAWNS: readonly Vec3[] = [[70, 212]].map(([lat, lon]) => {
  const dir = surfaceDirection(lat, lon);
  return alienSpawn(dir, groundRadius(TERRAIN, dir));
});

/** 장면 파일(`scenes/surface.json`)의 표면 객체 중 캐릭터가 통과할 수 없는 상자 */
const SURFACE_OBSTACLES: readonly Obstacle[] = [
  ...SURFACE_OBJECTS.filter((o) => o.collides).map((o) => o.box),
  ...PROP_COLLIDERS,
];

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
  // 달빛은 해보다 훨씬 약하고 푸르다. 밤 앰비언트도 푸른 쪽으로 어둡게 둔다.
  moonColor: [0.34, 0.46, 0.8],
  nightAmbient: [0.1, 0.14, 0.26],
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

/** 표면 객체의 그리기 항목. 로켓은 몸통과 창 유리를 따로 칠한다. */
function surfaceObjectDrawItems(o: SurfaceObject): DrawItem[] {
  const body = material(o.color, o.roughness);
  if (o.shape === 'box') return [drawItemFromModel('box', o.model, body)];
  return [
    drawItemFromModel('rocket', o.model, body),
    drawItemFromModel('rocketGlass', o.model, material(ROCKET_SHAPE.glassColor, ROCKET_SHAPE.glassRoughness), false),
  ];
}

/** 기차 부품의 그리기 항목. 빛나는 전조등은 그림자를 드리우지 않는다. */
function trainPartDrawItem(part: TrainPartModel): DrawItem {
  const mat = material(part.color, part.roughness, part.emissive ? { emissive: part.emissive } : {});
  return drawItemFromModel(part.mesh, part.model, mat, !part.emissive);
}

/** 지형물의 그리기 항목. 작은 장식 공은 그림자를 드리우지 않는다. */
function propDrawItems(prop: DreamProp): DrawItem[] {
  return prop.parts.map((part) =>
    drawItemFromModel(
      part.mesh,
      part.model,
      material(part.color, PROP_ROUGHNESS, { pattern: SurfacePattern.Gradient, receivesOccluder: true }),
      prop.shape !== 'pebble',
    ),
  );
}

/** 외계인 덩이의 그리기 항목. 촉수는 다리처럼 스킨 행렬로 그린다. */
function alienPartDrawItem(part: AlienPart): DrawItem {
  const item = drawItemFromModel(part.mesh, part.model, material(part.color, ALIEN_ROUGHNESS));
  return part.skin ? { ...item, skin: part.skin } : item;
}

/** 움직이지 않는 지형물이므로 한 번만 만든다. */
const PROP_DRAW_ITEMS: readonly DrawItem[] = DREAM_PROPS.flatMap(propDrawItems);

const DEFAULT_VIEW: BillboardView = { position: [0, 0, 0], up: [0, 1, 0] };

/** 행성 둘레의 별. 움직이지 않으므로 한 번만 만든다. 조명을 받지 않아 얼굴 색 그대로 보인다. */
const STAR_BILLBOARDS: readonly Billboard[] = placeStars().map((star) => ({
  image: 'starFace',
  frame: star.face,
  position: star.position,
  size: [star.mirrored ? -star.size : star.size, star.size],
  rotation: star.tilt,
  color: [1, 1, 1],
  toneMapped: false,
}));

/** 햇살 그림 한 변의 길이 (해 반지름 단위) */
const SUN_RAYS_SIZE = sunRaysExtent() * 2;

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
  readonly walker = new Walker(SPAWN, TERRAIN);
  readonly content: ContentManager;
  readonly sun = new Sun(STUDIO_ENVIRONMENT.lightDirection);
  readonly moon = new Moon();
  readonly train = new Train();
  readonly npcs: readonly Wanderer[];
  readonly aliens: readonly Alien[];
  /** 서로 통과하지 못하는 캐릭터 몸체들. 플레이어가 먼저다. */
  private readonly bodies: readonly Player[];

  private readonly zones: readonly ZoneInstance[];

  constructor(
    entries: readonly ContentEntry[] = CONTENT_ENTRIES,
    onContentChange?: (content: GraphicsContent) => void,
    random?: Random,
  ) {
    this.npcs = NPCS.map((npc) => new Wanderer(npc.spawn, TERRAIN, random, BODY_FORMS[npc.shape].hip));
    this.aliens = ALIEN_SPAWNS.map((spawn, i) => new Alien(spawn, TERRAIN, random, i * 1.9));
    this.bodies = [this.player, ...this.npcs.map((npc) => npc.body), ...this.aliens.map((alien) => alien.body)];
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
    this.train.step(dt);
    // 기차는 움직이는 벽이다. 이번 걸음의 자리로 캐릭터를 밀어낸다.
    const obstacles: Obstacle[] = [...SURFACE_OBSTACLES, ...this.train.obstacles()];
    this.player.step(dt, command, TERRAIN, obstacles);
    for (const npc of this.npcs) npc.move(dt, obstacles);
    for (const alien of this.aliens) alien.move(dt, obstacles);
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) separateBodies(this.bodies[i], this.bodies[j]);
    }
    this.walker.step(dt, this.player);
    for (const npc of this.npcs) npc.animate(dt);
    for (const alien of this.aliens) alien.animate(dt);

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

  buildDrawList(alpha: number): DrawItem[] {
    const sunPosition = this.sun.position(alpha);
    const items: DrawItem[] = [
      drawItemFromModel(
        'terrain',
        mat4Identity(),
        material(PLANET_COLOR, 0.8, {
          pattern: SurfacePattern.Dreamy,
          showsZones: true,
          receivesOccluder: true,
        }),
      ),
      ...PROP_DRAW_ITEMS,
      ...SURFACE_OBJECTS.flatMap(surfaceObjectDrawItems),
      drawItemFromModel(
        'rails',
        mat4Identity(),
        material(TRACK_SHAPE.railColor, TRACK_SHAPE.railRoughness, { metallic: TRACK_SHAPE.railMetallic }),
      ),
      drawItemFromModel('sleepers', mat4Identity(), material(TRACK_SHAPE.sleeperColor, TRACK_SHAPE.sleeperRoughness)),
      ...this.train.parts(alpha).map(trainPartDrawItem),
      ...characterDrawItems(this.walker, alpha, PLAYER_COLOR, 'sphere'),
      ...this.npcs.flatMap((npc, i) => characterDrawItems(npc.walker, alpha, NPCS[i].color, NPCS[i].shape)),
      ...this.aliens.flatMap((alien) => alien.parts(alpha).map(alienPartDrawItem)),
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
      drawItemFromModel('ring', this.sunOrbitModel(), material([0, 0, 0], 1, { emissive: SUN_ORBIT_EMISSIVE }), false),
    ];
    return items;
  }

  /**
   * 카메라를 보는 빌보드: 별, 햇살, 해 눈(흰자·검은자). 해 빌보드는 해 구체와 같은 색으로 보이도록
   * 툰 셰이더와 같은 톤 매핑을 건다. 렌더러가 모두 모아 한 번에 그린다.
   * `view`는 이번 프레임의 카메라이고, 해 눈을 해 얼굴 위에 놓는 데 쓴다. 없으면 행성 중심에서 보는 것으로 친다.
   */
  buildBillboards(alpha: number, view: BillboardView = DEFAULT_VIEW): Billboard[] {
    const sunPosition = this.sun.position(alpha);
    const r = SUN.radius;
    const [rx, ry] = SUN_FACE.whiteRadius;
    const pupil = SUN_FACE.pupilRadius * 2 * r;
    const eyes = sunEyes(sunPosition, r, sunBillboardBasis(sunPosition, view), this.walker.pose(alpha).body);
    return [
      ...STAR_BILLBOARDS,
      { image: 'sunRays', position: sunPosition, size: [SUN_RAYS_SIZE * r, SUN_RAYS_SIZE * r], color: SUN_EMISSIVE, toneMapped: true },
      ...eyes.flatMap((eye): Billboard[] => [
        { image: 'disk', position: eye.white, size: [rx * 2 * r, ry * 2 * r], color: SUN_EYE_WHITE_EMISSIVE, toneMapped: true },
        { image: 'disk', position: eye.pupil, size: [pupil, pupil], color: SUN_PUPIL_COLOR, toneMapped: true },
      ]),
    ];
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
}

/**
 * 캐릭터 하나의 몸, 왼다리, 오른다리 순서. 플레이어와 NPC가 같은 다리를 쓰고 몸 모양과 색만 다르다.
 * 모난 몸(정육면체, 피라미드)은 진행 방향을 보고 엉덩이와 함께 기운다. 구는 대칭이라 돌리지 않는다.
 */
function characterDrawItems(walker: Walker, alpha: number, color: Vec3, shape: BodyShape): DrawItem[] {
  const pose = walker.pose(alpha);
  const mat = material(color, PLAYER_ROUGHNESS);
  const bones = walker.solveLegs(pose).map(posedBoneMatrix);
  const leg = (first: number): DrawItem => ({
    ...drawItemFromModel('leg', mat4Identity(), mat),
    skin: bones.slice(first, first + LEG_BONE_COUNT).map((bone, i) => mat4Multiply(bone, REST_BONE_INVERSES[i])),
  });
  const form = BODY_FORMS[shape];
  const { right, up } = walker.hipAxes(pose);
  // 오른쪽 × 위 = 뒤쪽. 오른손 기저여야 면의 감김 방향이 뒤집히지 않는다. 모양이 앞뒤 대칭이라 뒤쪽을 Z로 쓴다.
  const back = cross(right, up);
  const [sx, sy, sz] = form.size;
  const body = drawItemFromModel(
    form.mesh,
    mat4FromBasis(add(pose.body, scale(up, form.lift)), scale(right, sx), scale(up, sy), scale(back, sz)),
    mat,
  );
  return [body, leg(0), leg(LEG_BONE_COUNT)];
}
