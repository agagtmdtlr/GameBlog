import { ContentManager } from '../content/manager';
import { CONTENT_ENTRIES, DEFAULT_SPHERE_COLOR, INITIAL_CONTENT_ID } from '../content/registry';
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
  sub,
  type Quat,
  type Vec3,
} from '../engine/math';
import {
  SurfacePattern,
  type ContentFrame,
  type DrawItem,
  type Environment,
  type HeatSphere,
  type Material,
  type MeshKind,
  type WaterSphere,
} from '../engine/frame';
import { ColorTransition } from './colorTransition';
import { PLANET, surfaceDirection } from './planet';
import { PLAYER_RADIUS, Player, type MoveCommand } from './player';
import { PressurePlate } from './pressurePlate';
import { SphereHeat } from './sphereHeat';
import { WaterFill } from './waterFill';

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
/** 완전히 달아오른 구가 스스로 내는 빛 (선형 RGB) */
const HEAT_EMISSIVE: Vec3 = [0.5, 0.05, 0.008];

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
  private readonly sphereColor = new ColorTransition(DEFAULT_SPHERE_COLOR, COLOR_TRANSITION_SECONDS);
  readonly water = new WaterFill();
  readonly heat = new SphereHeat();

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
      drawItem(
        'sphere',
        PLANET.center,
        [PLANET.radius, PLANET.radius, PLANET.radius],
        material([0.74, 0.74, 0.75], 0.75, { pattern: SurfacePattern.Grid }),
      ),
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

    const { sphereColor, water, heat } = this;
    this.content = new ContentManager(
      {
        sphere: {
          setColor: (color) => sphereColor.setTarget(color),
          setWaterFilled: (filled) => water.setFilled(filled),
          setHeated: (heated) => heat.setHeated(heated),
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
    this.player.step(dt, command, PLANET);
    const up = normalize(sub(this.player.position, PLANET.center));
    this.water.update(dt, sub(this.player.velocity, previousVelocity), up);
    this.heat.update(dt, this.player.position, PLAYER_RADIUS, PLANET.center);

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

    // 물이 든 구는 뒤 장면을 굴절시켜 보여 주므로 렌더러가 따로 그린다.
    if (this.water.amount === 0) items.push(this.sphereDrawItem(alpha));
    return items;
  }

  /** 전용 렌더러가 그릴 콘텐츠의 값. 이번 프레임에 보이는 것만 담는다. */
  buildContentFrames(alpha: number): ContentFrame[] {
    const frames: ContentFrame[] = [];
    const water = this.buildWaterSphere(alpha);
    if (water) frames.push(water);
    const heat = this.buildHeatSphere(alpha);
    if (heat) frames.push(heat);
    return frames;
  }

  /** 구에 물이 들어 있을 때만 값을 반환한다. */
  buildWaterSphere(alpha: number): WaterSphere | null {
    const { water } = this;
    if (water.amount === 0) return null;
    return {
      kind: 'water-sphere',
      item: this.sphereDrawItem(alpha),
      center: this.interpolatedPlayerPosition(alpha),
      radius: PLAYER_RADIUS,
      ground: PLANET,
      surfaceNormal: water.surfaceNormal,
      level: water.level,
      opacity: water.opacity,
      ripple: water.ripple,
      time: water.time,
    };
  }

  /** 구가 달아올라 있거나 연기가 남아 있을 때만 값을 반환한다. */
  buildHeatSphere(alpha: number): HeatSphere | null {
    const { heat } = this;
    if (!heat.visible) return null;
    return {
      kind: 'heat-sphere',
      item: this.sphereDrawItem(alpha),
      center: this.interpolatedPlayerPosition(alpha),
      radius: PLAYER_RADIUS,
      heat: heat.amount,
      time: heat.time,
      smoke: heat.smokeData(PLAYER_RADIUS),
      smokeCount: heat.smokeCount,
    };
  }

  private sphereDrawItem(alpha: number): DrawItem {
    const orientation = quatNlerp(this.player.previousOrientation, this.player.orientation, alpha);
    return drawItem(
      'sphere',
      this.interpolatedPlayerPosition(alpha),
      [PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS],
      material(this.sphereColor.current, 0.32, {
        pattern: SurfacePattern.SphereBands,
        emissive: scale(HEAT_EMISSIVE, this.heat.amount),
      }),
      orientation,
    );
  }
}
