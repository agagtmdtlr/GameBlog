import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES, DEFAULT_PLANET_COLOR, INITIAL_CONTENT_ID } from '../content/registry';
import type { ContentEntry, GraphicsContent } from '../content/types';
import {
  lerp,
  mat4FromTRS,
  normalize,
  normalMatrix,
  quatFromUnitVectors,
  quatNlerp,
  QUAT_IDENTITY,
  scale,
  type Quat,
  type Vec3,
} from '../engine/math';
import {
  SurfacePattern,
  type ContentFrame,
  type DrawItem,
  type Environment,
  type Material,
  type MeshKind,
} from '../engine/frame';
import { ColorTransition } from './colorTransition';
import { PLANET, surfaceDirection } from './planet';
import { PLAYER_RADIUS, Player, type MoveCommand } from './player';
import { PressurePlate } from './pressurePlate';

/** 행성의 꼭대기에서 시작한다. */
const SPAWN: Vec3 = [0, PLANET.radius + PLAYER_RADIUS, 0];

const PLATE_RADIUS = 1.4;
const PLATE_RING_RADIUS = 1.62;
// 발판은 평평한 원판이라 가장자리로 갈수록 둥근 표면에서 뜬다.
// 높이는 발판 중심의 표면을 기준으로 하고, 원판을 두껍게 만들어 아래쪽을 행성에 묻는다.
const PLATE_RING_TOP = -0.03;
const PLATE_RING_HEIGHT = 0.4;
const PLATE_CAP_TOP = 0.08;
const PLATE_CAP_HEIGHT = 0.4;
const PLATE_TRAVEL = 0.06;
const PLATE_GLOW_RATE = 7;
const PLATE_GLOW_STRENGTH = 0.55;
const COLOR_TRANSITION_SECONDS = 0.3;
/** 플레이어 구의 색 (선형 RGB). 발판은 행성 표면의 색을 바꾸고 구는 그대로 둔다. */
const PLAYER_COLOR: Vec3 = [0.02, 0.022, 0.028];

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

/** 윗면이 발판 중심의 표면에서 `top`만큼 떨어진 원판의 중심 */
function plateDiscCenter(normal: Vec3, top: number, height: number): Vec3 {
  return scale(normal, PLANET.radius + top - height / 2);
}

interface PlateInstance {
  entry: ContentEntry;
  /** 행성 중심에서 발판을 향하는 단위 벡터 */
  normal: Vec3;
  /** 원기둥의 축(+Y)을 `normal`로 돌리는 회전 */
  rotation: Quat;
  plate: PressurePlate;
  glow: number;
}

/** 월드를 구성하고 게임 규칙을 진행한다. GPU와 DOM에 의존하지 않는다. */
export class World {
  readonly player = new Player(SPAWN);
  readonly content: ContentManager;

  private readonly staticItems: readonly DrawItem[];
  private readonly plates: readonly PlateInstance[];
  private readonly planetColor = new ColorTransition(DEFAULT_PLANET_COLOR, COLOR_TRANSITION_SECONDS);

  constructor(
    entries: readonly ContentEntry[] = CONTENT_ENTRIES,
    onContentChange?: (content: GraphicsContent) => void,
  ) {
    this.plates = entries.map((entry) => {
      const normal = surfaceDirection(entry.plate.latitude, entry.plate.longitude);
      return {
        entry,
        normal,
        rotation: quatFromUnitVectors([0, 1, 0], normal),
        plate: new PressurePlate(scale(normal, PLANET.radius), normal, PLATE_RADIUS),
        glow: 0,
      };
    });

    const ringMat = material([0.3, 0.3, 0.31], 0.55);
    this.staticItems = [
      ...this.plates.map(({ normal, rotation }) =>
        drawItem(
          'cylinder',
          plateDiscCenter(normal, PLATE_RING_TOP, PLATE_RING_HEIGHT),
          [PLATE_RING_RADIUS, PLATE_RING_HEIGHT, PLATE_RING_RADIUS],
          ringMat,
          rotation,
          false,
        ),
      ),
    ];

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

    for (const instance of this.plates) {
      if (instance.plate.update(dt, this.player.position, PLAYER_RADIUS)) {
        this.content.activate(instance.entry.content.id);
      }
      const targetGlow = this.content.activeId === instance.entry.content.id ? 1 : 0;
      instance.glow += (targetGlow - instance.glow) * (1 - Math.exp(-PLATE_GLOW_RATE * dt));
    }
    this.planetColor.update(dt);
    this.content.update(dt);
  }

  /** 렌더링 보간이 적용된 구의 위치 */
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
        material(this.planetColor.current, 0.75, { pattern: SurfacePattern.Grid }),
      ),
      ...this.staticItems,
    ];
    for (const { entry, normal, rotation, plate, glow } of this.plates) {
      const top = PLATE_CAP_TOP - plate.depression * PLATE_TRAVEL;
      items.push(
        drawItem(
          'cylinder',
          plateDiscCenter(normal, top, PLATE_CAP_HEIGHT),
          [PLATE_RADIUS, PLATE_CAP_HEIGHT, PLATE_RADIUS],
          material(entry.plate.color, 0.42, {
            emissive: scale(entry.plate.color, glow * PLATE_GLOW_STRENGTH),
          }),
          rotation,
          false,
        ),
      );
    }

    items.push(this.sphereDrawItem(alpha));
    return items;
  }

  /** 전용 렌더러가 그릴 콘텐츠의 값. 이번 프레임에 보이는 것만 담는다. 지금은 없다. */
  buildContentFrames(_alpha: number): ContentFrame[] {
    return [];
  }

  private sphereDrawItem(alpha: number): DrawItem {
    const orientation = quatNlerp(this.player.previousOrientation, this.player.orientation, alpha);
    return drawItem(
      'sphere',
      this.interpolatedPlayerPosition(alpha),
      [PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS],
      material(PLAYER_COLOR, 0.32, { pattern: SurfacePattern.SphereBands }),
      orientation,
    );
  }
}
