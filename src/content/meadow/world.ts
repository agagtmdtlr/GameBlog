import { dot, lerp, mat4Identity, normalize, normalMatrix, scale, sub, type Vec3 } from '../../engine/math';
import { SurfacePattern, type DrawItem, type Environment, type Material } from '../../engine/frame';
import { characterDrawItems } from '../common/character/characterDraw';
import { PLAYER_RADIUS, Player, type MoveCommand } from '../common/character/player';
import { BODY_RADIUS, Walker } from '../common/character/walker';
import { keepInside, MEADOW_CENTER, MEADOW_GROUND, meadowPoint } from './objects/meadowTerrain';
import { SkyTvField, type SkyTv } from './objects/skyTvs';
import { Wind, type WindFrame } from './objects/wind';

/** 분지 한가운데에서 시작한다. */
export const MEADOW_SPAWN: Vec3 = meadowPoint(0, 0, PLAYER_RADIUS);

/** 캐릭터의 색 (선형 RGB, sRGB #FCC812). 행성 씬과 같다. */
const PLAYER_COLOR: Vec3 = [0.973, 0.578, 0.006];

/** 잔디 아래 땅의 색 (선형 RGB). 멀리 잔디가 사라진 곳도 잔디밭처럼 보이도록 풀빛이다. */
export const MEADOW_GROUND_COLOR: Vec3 = [0.06, 0.15, 0.045];

const GROUND_MATERIAL: Material = {
  baseColor: MEADOW_GROUND_COLOR,
  roughness: 1,
  metallic: 0,
  emissive: [0, 0, 0],
  pattern: SurfacePattern.None,
  receivesOccluder: true,
};

/**
 * 흐린 낮 (2026-11-28 사용자 요청, 맑은 하늘을 대체). 구름에 걸러진 햇빛은 약하고 회색이며, 하늘빛 앰비언트도 회색이라
 * 잔디의 채도가 낮아진다. 해는 시작할 때 바라보는 쪽 하늘에 있고 움직이지 않는다.
 */
export const MEADOW_ENVIRONMENT: Environment = {
  lightDirection: normalize([0.35, 0.75, -0.55]),
  lightColor: [1.75, 1.74, 1.72],
  skyColor: [0.5, 0.52, 0.55],
  groundColor: [0.2, 0.21, 0.2],
  moonColor: [0.34, 0.46, 0.8],
  nightAmbient: [0.1, 0.14, 0.26],
  // 화면 출력값(sRGB) 흐린 회색 하늘
  background: [0.55, 0.58, 0.6],
  shadowRadius: 24,
  worldCenter: MEADOW_CENTER,
  // 먼 언덕은 회색 하늘빛 안개로 사라진다. 땅 메시 끝(260)보다 앞에서 다 덮는다.
  fog: { near: 45, far: 230 },
};

/** 플레이어가 이만큼 움직이면 하늘 텔레비전 칸을 다시 본다 (스폰 반경보다 훨씬 작다). */
const SKY_TV_RESPAWN_STEP = 4;

/** 초원 씬의 상태와 규칙. GPU와 DOM에 의존하지 않는다. */
export class MeadowWorld {
  readonly player = new Player(MEADOW_SPAWN);
  readonly walker = new Walker(MEADOW_SPAWN, MEADOW_GROUND);
  readonly wind = new Wind();
  /** 플레이어 둘레 하늘에 스폰되는 텔레비전 */
  readonly skyTvs = new SkyTvField();
  /** 씬이 흐른 시간(초). 일시 정지하면 멈춘다. */
  time = 0;
  /** 하늘 텔레비전을 마지막으로 스폰한 플레이어 자리. 이만큼 움직였을 때만 칸을 다시 본다. */
  private skyTvAnchor: Vec3;

  constructor() {
    this.skyTvAnchor = this.player.position;
    this.skyTvs.update(this.player.position, -Infinity);
  }

  fixedStep(dt: number, command: MoveCommand): void {
    this.time += dt;
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
    const [ax, , az] = this.skyTvAnchor;
    const [px, , pz] = this.player.position;
    if (Math.hypot(px - ax, pz - az) > SKY_TV_RESPAWN_STEP) {
      this.skyTvAnchor = this.player.position;
      this.skyTvs.update(this.player.position, this.time);
    }
  }

  /** 지금 떠 있는 하늘 텔레비전 */
  skyTvList(): SkyTv[] {
    return [...this.skyTvs.tvs];
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
