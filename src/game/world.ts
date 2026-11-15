import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES, DEFAULT_SPHERE_COLOR, INITIAL_CONTENT_ID } from '../content/registry';
import type { ContentEntry, GraphicsContent } from '../content/types';
import {
  lerp,
  mat4FromTRS,
  normalize,
  normalMatrix,
  quatNlerp,
  QUAT_IDENTITY,
  scale,
  sub,
  type Quat,
  type Vec3,
} from '../engine/math';
import {
  SurfacePattern,
  type DrawItem,
  type Environment,
  type Material,
  type MeshKind,
  type WaterSphere,
} from '../engine/frame';
import type { AABB } from '../physics/collision';
import { ColorTransition } from './colorTransition';
import { PLAYER_RADIUS, Player, type MoveCommand } from './player';
import { PressurePlate } from './pressurePlate';
import { WaterFill } from './waterFill';

const ARENA_HALF_SIZE = 16;
const PLATFORM_DEPTH = 1;
const WALL_HEIGHT = 0.7;
const WALL_THICKNESS = 0.5;
/** 어둠 속으로 떨어지는 모습이 잠시 보인 뒤 다시 시작한다. */
const RESPAWN_Y = -12;
const SPAWN: Vec3 = [0, PLAYER_RADIUS, 9];

const PLATE_RADIUS = 1.4;
const PLATE_RING_RADIUS = 1.62;
const PLATE_RING_HEIGHT = 0.02;
const PLATE_CAP_HEIGHT = 0.08;
const PLATE_CAP_TOP = 0.09;
const PLATE_TRAVEL = 0.06;
const PLATE_GLOW_RATE = 7;
const PLATE_GLOW_STRENGTH = 0.55;
const COLOR_TRANSITION_SECONDS = 0.3;

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
  const model = mat4FromTRS(position, rotation, size);
  return { mesh, model, normal: normalMatrix(model), material: mat, castShadow };
}

function aabb(center: Vec3, size: Vec3): AABB {
  return {
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
  };
}

interface BoxPart {
  center: Vec3;
  size: Vec3;
  mat: Material;
}

function arenaParts(): BoxPart[] {
  const outer = ARENA_HALF_SIZE * 2;
  const wallCenter = ARENA_HALF_SIZE - WALL_THICKNESS / 2;
  const wallY = WALL_HEIGHT / 2;
  const wallMat = material([0.72, 0.72, 0.73], 0.6);
  return [
    {
      center: [0, -PLATFORM_DEPTH / 2, 0],
      size: [outer, PLATFORM_DEPTH, outer],
      mat: material([0.74, 0.74, 0.75], 0.75, { pattern: SurfacePattern.Grid }),
    },
    { center: [0, wallY, -wallCenter], size: [outer, WALL_HEIGHT, WALL_THICKNESS], mat: wallMat },
    { center: [0, wallY, wallCenter], size: [outer, WALL_HEIGHT, WALL_THICKNESS], mat: wallMat },
    { center: [-wallCenter, wallY, 0], size: [WALL_THICKNESS, WALL_HEIGHT, outer], mat: wallMat },
    { center: [wallCenter, wallY, 0], size: [WALL_THICKNESS, WALL_HEIGHT, outer], mat: wallMat },
  ];
}

interface PlateInstance {
  entry: ContentEntry;
  plate: PressurePlate;
  glow: number;
}

/** 월드를 구성하고 게임 규칙을 진행한다. GPU와 DOM에 의존하지 않는다. */
export class World {
  readonly player = new Player(SPAWN);
  readonly colliders: readonly AABB[];
  readonly content: ContentManager;

  private readonly staticItems: readonly DrawItem[];
  private readonly plates: readonly PlateInstance[];
  private readonly sphereColor = new ColorTransition(DEFAULT_SPHERE_COLOR, COLOR_TRANSITION_SECONDS);
  readonly water = new WaterFill();

  constructor(
    entries: readonly ContentEntry[] = CONTENT_ENTRIES,
    onContentChange?: (content: GraphicsContent) => void,
  ) {
    const parts = arenaParts();
    this.colliders = parts.map((part) => aabb(part.center, part.size));

    const ringMat = material([0.3, 0.3, 0.31], 0.55);
    this.staticItems = [
      ...parts.map((part) => drawItem('box', part.center, part.size, part.mat)),
      ...entries.map(({ plate }) =>
        drawItem(
          'cylinder',
          [plate.x, PLATE_RING_HEIGHT / 2, plate.z],
          [PLATE_RING_RADIUS, PLATE_RING_HEIGHT, PLATE_RING_RADIUS],
          ringMat,
          QUAT_IDENTITY,
          false,
        ),
      ),
    ];

    this.plates = entries.map((entry) => ({
      entry,
      plate: new PressurePlate(entry.plate.x, entry.plate.z, PLATE_RADIUS),
      glow: 0,
    }));

    const { sphereColor, water } = this;
    this.content = new ContentManager(
      {
        sphere: {
          setColor: (color) => sphereColor.setTarget(color),
          setWaterFilled: (filled) => water.setFilled(filled),
        },
      },
      entries.map((entry) => entry.content),
      onContentChange,
    );
    if (entries.some((entry) => entry.content.id === INITIAL_CONTENT_ID)) {
      this.content.activate(INITIAL_CONTENT_ID);
    }
  }

  fixedStep(dt: number, command: MoveCommand): void {
    const previousVelocity = this.player.velocity;
    this.player.step(dt, command, this.colliders);
    if (this.player.position[1] < RESPAWN_Y) this.player.respawn();
    this.water.update(dt, sub(this.player.velocity, previousVelocity));

    for (const instance of this.plates) {
      if (instance.plate.update(dt, this.player.position, PLAYER_RADIUS)) {
        this.content.activate(instance.entry.content.id);
      }
      const targetGlow = this.content.activeId === instance.entry.content.id ? 1 : 0;
      instance.glow += (targetGlow - instance.glow) * (1 - Math.exp(-PLATE_GLOW_RATE * dt));
    }
    this.sphereColor.update(dt);
    this.content.update(dt);
  }

  /** 렌더링 보간이 적용된 구의 위치 */
  interpolatedPlayerPosition(alpha: number): Vec3 {
    return lerp(this.player.previousPosition, this.player.position, alpha);
  }

  get currentSphereColor(): Vec3 {
    return this.sphereColor.current;
  }

  buildDrawList(alpha: number): DrawItem[] {
    const items: DrawItem[] = [...this.staticItems];
    for (const { entry, plate, glow } of this.plates) {
      const top = PLATE_CAP_TOP - plate.depression * PLATE_TRAVEL;
      items.push(
        drawItem(
          'cylinder',
          [entry.plate.x, top - PLATE_CAP_HEIGHT / 2, entry.plate.z],
          [PLATE_RADIUS, PLATE_CAP_HEIGHT, PLATE_RADIUS],
          material(entry.plate.color, 0.42, {
            emissive: scale(entry.plate.color, glow * PLATE_GLOW_STRENGTH),
          }),
          QUAT_IDENTITY,
          false,
        ),
      );
    }

    // 물이 든 구는 뒤 장면을 굴절시켜 보여 주므로 렌더러가 따로 그린다.
    if (this.water.amount === 0) items.push(this.sphereDrawItem(alpha));
    return items;
  }

  /** 구에 물이 들어 있을 때만 값을 반환한다. */
  buildWaterSphere(alpha: number): WaterSphere | null {
    const { water } = this;
    if (water.amount === 0) return null;
    return {
      item: this.sphereDrawItem(alpha),
      center: this.interpolatedPlayerPosition(alpha),
      radius: PLAYER_RADIUS,
      surfaceNormal: water.surfaceNormal,
      level: water.level,
      opacity: water.opacity,
      ripple: water.ripple,
      time: water.time,
    };
  }

  private sphereDrawItem(alpha: number): DrawItem {
    const orientation = quatNlerp(this.player.previousOrientation, this.player.orientation, alpha);
    return drawItem(
      'sphere',
      this.interpolatedPlayerPosition(alpha),
      [PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS],
      material(this.sphereColor.current, 0.32, { pattern: SurfacePattern.SphereBands }),
      orientation,
    );
  }
}
