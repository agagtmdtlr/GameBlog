import { add, length, scale, sub, type Vec3 } from '../../engine/math';
import type { Controls, SceneDefinition, SceneInstance } from '../../engine/scene';
import type { Graphics } from '../../engine/render/graphics';
import { CameraRig } from '../common/cameraRig';
import { defineCharacterMeshes } from '../common/character/characterGraphics';
import astronautStickerUrl from './assets/astronaut-sticker.png?url';
import { PLANET_BILLBOARD_IMAGES } from './graphics/billboardImages';
import { BubbleLayer } from './graphics/bubbleLayer';
import { GrassLayer } from './graphics/grassLayer';
import { definePlanetMeshes } from './graphics/meshes';
import { SURFACE_OBJECTS, tvVideoScreen, videoVolume } from './objects/surfaceScene';
import { TERRAIN } from './objects/terrain';
import { PLANET } from './planet';
import { drawSkyboxFaces } from './shapes/skybox';
import { World } from './world';

/**
 * 작은 행성 위를 걸어 다니는 씬. 해·위성·인공위성·비눗방울 띠·별이 떠 있고, 표면에 기차와 텔레비전이 있다.
 * 게임 규칙은 `World`가, 그래픽 등록은 `graphics/`가 맡는다.
 */
export const planetScene: SceneDefinition = {
  id: 'planet',
  create(graphics, onError) {
    return new PlanetScene(graphics, onError);
  },
};

class PlanetScene implements SceneInstance {
  private readonly world = new World();
  private readonly camera = new CameraRig(this.world.player.position, PLANET.center, TERRAIN);
  private readonly bubbles = new BubbleLayer();
  private readonly grass = new GrassLayer();
  private readonly videoScreens: { center: Vec3; player: { setVolume(volume: number): void } }[];
  private direction: Vec3 = [0, 0, 0];

  readonly debug = { world: this.world, camera: this.camera };

  constructor(graphics: Graphics, onError: (error: unknown) => void) {
    // 다리 모델은 비동기로 불러온다. 불러오기 전에는 몸만 보인다.
    defineCharacterMeshes(graphics).catch(onError);
    definePlanetMeshes(graphics);
    graphics.setSkybox(drawSkyboxFaces());
    graphics.setBillboardImages(PLANET_BILLBOARD_IMAGES);
    // 우주인 스티커 그림도 비동기로 불러온다. 실패해도 스티커만 빠지므로 플레이는 계속한다.
    graphics.loadBillboardImage('astronaut', astronautStickerUrl).catch((error: unknown) => console.error(error));
    // 잔디는 불투명해 깊이를 쓰므로 투명한 비눗방울보다 먼저 그린다.
    graphics.addLayer(this.grass);
    graphics.addLayer(this.bubbles);

    // 텔레비전 화면의 YouTube 영상. 음소거로 재생하다가 플레이 중에 가까이 가면 소리가 난다.
    this.videoScreens = SURFACE_OBJECTS.flatMap((o) => {
      const place = tvVideoScreen(o);
      return place ? [{ center: place.center, player: graphics.addVideoScreen(place.youtube, 'tvScreen', place.model, place) }] : [];
    });
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
    for (const screen of this.videoScreens) {
      const distance = length(sub(this.world.player.position, screen.center));
      screen.player.setVolume(playing ? videoVolume(distance) : 0);
    }
  }

  frame(alpha: number) {
    const world = this.world;
    this.bubbles.set(world.buildBubbles(alpha));
    this.grass.set(world.windFrame(alpha), world.grassPushers(alpha));
    return {
      items: world.buildDrawList(alpha),
      billboards: world.buildBillboards(alpha, this.camera.view),
      camera: this.camera.view,
      environment: world.environment(alpha),
      occluder: world.occluder(alpha),
    };
  }
}
