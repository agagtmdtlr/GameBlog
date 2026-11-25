import { dot, lerp, mat4Identity, normalize, normalMatrix, scale, sub, type Vec3 } from '../../engine/math';
import { SurfacePattern, type DrawItem, type Environment, type Material } from '../../engine/frame';
import { characterDrawItems } from '../common/character/characterDraw';
import { PLAYER_RADIUS, Player, type MoveCommand } from '../common/character/player';
import { BODY_RADIUS, Walker } from '../common/character/walker';
import { keepInside, MEADOW_CENTER, MEADOW_GROUND, meadowPoint } from './objects/meadowTerrain';
import { Wind, type WindFrame } from './objects/wind';

/** 분지 한가운데에서 시작한다. */
export const MEADOW_SPAWN: Vec3 = meadowPoint(0, 0, PLAYER_RADIUS);

/** 캐릭터의 색 (선형 RGB, sRGB #FCC812). 행성 씬과 같다. */
const PLAYER_COLOR: Vec3 = [0.973, 0.578, 0.006];

/** 잔디 아래 땅의 색 (선형 RGB). 멀리 잔디가 사라진 곳도 잔디밭처럼 보이도록 풀빛이다. */
export const MEADOW_GROUND_COLOR: Vec3 = [0.12, 0.32, 0.08];

const GROUND_MATERIAL: Material = {
  baseColor: MEADOW_GROUND_COLOR,
  roughness: 1,
  metallic: 0,
  emissive: [0, 0, 0],
  pattern: SurfacePattern.None,
  receivesOccluder: true,
};

/** 맑은 낮. 해는 시작할 때 바라보는 쪽 하늘에 있어, 바람에 누운 잎이 역광에 반짝인다. 해는 움직이지 않는다. */
export const MEADOW_ENVIRONMENT: Environment = {
  lightDirection: normalize([0.35, 0.75, -0.55]),
  lightColor: [2.75, 2.65, 2.5],
  skyColor: [0.62, 0.7, 0.8],
  groundColor: [0.25, 0.32, 0.2],
  moonColor: [0.34, 0.46, 0.8],
  nightAmbient: [0.1, 0.14, 0.26],
  // 화면 출력값(sRGB) 하늘색
  background: [0.66, 0.84, 0.96],
  shadowRadius: 24,
  worldCenter: MEADOW_CENTER,
};

/** 초원 씬의 상태와 규칙. GPU와 DOM에 의존하지 않는다. */
export class MeadowWorld {
  readonly player = new Player(MEADOW_SPAWN);
  readonly walker = new Walker(MEADOW_SPAWN, MEADOW_GROUND);
  readonly wind = new Wind();

  fixedStep(dt: number, command: MoveCommand): void {
    this.wind.step(dt);
    this.player.step(dt, command, MEADOW_GROUND);
    // 분지 가장자리 너머로는 가지 못한다. 바깥으로 가는 속도를 지운다.
    const inside = keepInside(this.player.position);
    if (inside) {
      this.player.position = inside.position;
      const out = dot(this.player.velocity, inside.outward);
      if (out > 0) this.player.velocity = sub(this.player.velocity, scale(inside.outward, out));
    }
    this.walker.step(dt, this.player);
  }

  interpolatedPlayerPosition(alpha: number): Vec3 {
    return lerp(this.player.previousPosition, this.player.position, alpha);
  }

  windFrame(alpha: number): WindFrame {
    return this.wind.frame(alpha);
  }

  /** 잔디를 밀어 눕히는 몸 (가운데는 몸 중심) */
  grassPusher(alpha: number): { center: Vec3; radius: number } {
    return { center: this.walker.pose(alpha).body, radius: PLAYER_RADIUS };
  }

  buildDrawList(alpha: number): DrawItem<Material>[] {
    const identity = mat4Identity();
    return [
      { mesh: 'meadowGround', model: identity, normal: normalMatrix(identity), material: GROUND_MATERIAL, castShadow: true },
      ...characterDrawItems(this.walker, alpha, PLAYER_COLOR, 'sphere'),
    ];
  }

  /** 그림자 맵이 캐릭터를 따라간다. */
  environment(alpha: number): Environment {
    return { ...MEADOW_ENVIRONMENT, shadowCenter: this.interpolatedPlayerPosition(alpha) };
  }

  occluder(alpha: number): { center: Vec3; radius: number } {
    return { center: this.walker.pose(alpha).body, radius: BODY_RADIUS };
  }
}
