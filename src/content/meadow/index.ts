import { add, length, scale, type Vec3 } from '../../engine/math';
import type { Controls, SceneDefinition, SceneInstance } from '../../engine/scene';
import type { Graphics } from '../../engine/render/graphics';
import { CameraRig } from '../common/cameraRig';
import { defineCharacterMeshes } from '../common/character/characterGraphics';
import { GrassLayer } from './graphics/grassLayer';
import { LightningLayer } from './graphics/lightningLayer';
import { RainLayer } from './graphics/rainLayer';
import { GroundLayer } from './graphics/groundLayer';
import { SkyTvLayer } from './graphics/skyTvLayer';
import { MEADOW_CENTER } from './objects/meadowTerrain';
import { MEADOW_GROUND_COLOR, MeadowWorld } from './world';

/**
 * 바람 부는 넓은 초원. 언덕진 분지를 빽빽한 잔디가 덮고, 바람 물결이 잔디를 눕히며 지나간다.
 * 하늘에는 플레이어 둘레에 절차적으로 스폰되는 검은 텔레비전들이 떠 있고, 바람에 비스듬히 비가 내리며, 하늘 곳곳에 번개가 쳐 초원을 번쩍 비춘다.
 * 캐릭터가 걸어 다니면 잔디가 갈라진다. 게임 규칙은 `MeadowWorld`가, 그래픽 등록은 `graphics/`가 맡는다.
 */
export const meadowScene: SceneDefinition = {
  id: 'meadow',
  create(graphics, onError) {
    return new MeadowScene(graphics, onError);
  },
};

class MeadowScene implements SceneInstance {
  private readonly world = new MeadowWorld();
  private readonly camera = new CameraRig(this.world.player.position, MEADOW_CENTER, this.world.ground);
  private readonly ground = new GroundLayer(MEADOW_GROUND_COLOR);
  private readonly grass = new GrassLayer(MEADOW_GROUND_COLOR);
  private readonly skyTvs = new SkyTvLayer();
  private readonly rain = new RainLayer();
  private readonly lightning = new LightningLayer();
  private direction: Vec3 = [0, 0, 0];

  readonly debug = { world: this.world, camera: this.camera };

  constructor(graphics: Graphics, onError: (error: unknown) => void) {
    defineCharacterMeshes(graphics).catch(onError);
    graphics.setSkybox(null);
    graphics.addLayer(this.ground);
    graphics.addLayer(this.skyTvs);
    graphics.addLayer(this.grass);
    // 번개와 비는 반투명이라 불투명한 텔레비전·잔디 다음에 그린다. 앞의 비가 먼 번개 위에 덮인다.
    graphics.addLayer(this.lightning);
    graphics.addLayer(this.rain);
  }

  applyControls({ forward, strafe, lookX, lookY }: Controls): void {
    this.camera.applyLook(lookX, lookY);
    const direction = add(scale(this.camera.forward, forward), scale(this.camera.right, strafe));
    const magnitude = length(direction);
    this.direction = magnitude > 1 ? scale(direction, 1 / magnitude) : direction;
  }

  fixedStep(dt: number): void {
    this.world.fixedStep(dt, { direction: this.direction });
  }

  update(frameSeconds: number, alpha: number, playing: boolean): void {
    if (playing) this.camera.follow(this.world.interpolatedPlayerPosition(alpha), frameSeconds);
  }

  frame(alpha: number) {
    const world = this.world;
    const wind = world.windFrame(alpha);
    this.ground.set(world.time);
    this.grass.set(wind, world.grassPusher(alpha), world.time);
    this.rain.set(wind);
    this.lightning.set(world.lightning.current, world.lightningFlash());
    this.skyTvs.set(world.skyTvList(), world.time);
    return {
      items: world.buildDrawList(alpha),
      billboards: [],
      camera: this.camera.view,
      environment: world.environment(alpha),
      occluder: world.occluder(alpha),
    };
  }
}
