import {
  CapsuleGeometry,
  CircleGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { Vec3 } from '../../../engine/math';
import type { Graphics } from '../../../engine/render/graphics';
import {
  arrayGeometry,
  displacedSphereGeometry,
  latheGeometry,
  mergeParts,
  triangleGeometry,
} from '../../../engine/render/geometry';
import { headProfile, slitPatch, tentacleSkin, visorPatch } from '../shapes/alienShape';
import { DREAM_SHAPE, moundProfile, pillarProfile } from '../shapes/dreamShape';
import { displaceToMoon } from '../shapes/moonShape';
import { bodyProfile, rocketHatch, rocketLegs, rocketRivets, rocketWindow, ROCKET_SHAPE, type RocketPart } from '../shapes/rocketShape';
import { dishProfile } from '../shapes/satelliteShape';
import { trackMesh } from '../shapes/trackPath';
import { defineTvMeshes } from '../../common/tv/tvGraphics';
import { PLANET } from '../planet';
import { terrainHeight } from '../objects/terrain';
import { TRACK_PATH } from '../objects/train';

/**
 * 행성 씬이 등록하는 메시. 엔진 기본 메시(`sphere`, `box`, `cylinder`)와 캐릭터 메시(`pyramid`, `leg`) 외의 것이다.
 * - `ring`: XY 평면에 놓인 반지름 1의 가느다란 고리(토러스). 관의 반지름은 `RING_TUBE_RATIO`다.
 * - `moon`: 반지름 1 언저리의 구에 충돌구와 바위 덩어리를 새긴 위성 (`moonShape.ts`)
 * - `rocket`, `rocketGlass`: 로켓 모형의 몸통과 창 유리 (`rocketShape.ts`)
 * - `tv`, `tvTrim`, `tvDark`, `tvScreen`: 텔레비전 모형의 나무·은색·검은 부분과 화면 유리 (`common/tv/tvShape.ts`)
 * - `rails`, `sleepers`: 선로의 레일과 침목. 월드 좌표로 만든 지오메트리라 단위 행렬로 그린다 (`trackPath.ts`)
 * - `terrain`: 높낮이가 있는 행성 땅. 역시 월드 좌표다
 * - `mound`(종 모양 언덕), `pillar`(끝이 둥근 기둥): y 0~1, 바닥 반지름 0.5인 회전체 (`dreamShape.ts`)
 * - `alienHead`, `alienVisor`, `alienSlit`: 문어 외계인의 챙 달린 머리, 눈가리개, 눈가리개 틈 (`alienShape.ts`)
 * - `tentacle`: 외계인의 촉수 스킨 메시. `leg`처럼 `DrawItem.skin`으로 그린다
 * - `satelliteDish`: 인공위성의 접시 안테나. 반지름 1에 오목한 쪽이 -Y를 본다 (`satelliteShape.ts`)
 */
export function definePlanetMeshes(graphics: Graphics): void {
  // 해 궤적처럼 큰 원을 그리므로 둘레를 촘촘하게, 관은 가늘어서 성기게 나눈다.
  graphics.defineMesh('ring', new TorusGeometry(1, RING_TUBE_RATIO, 6, 512));
  graphics.defineMesh('moon', displacedSphereGeometry(48, displaceToMoon));
  // 로켓 자리의 모형. 장면 파일의 `size`가 한 변 1인 상자를 늘린다.
  graphics.defineMesh('rocket', createRocketGeometry());
  graphics.defineMesh('rocketGlass', createRocketGlassGeometry());
  // 텔레비전 자리의 모형. 칠하는 색마다 지오메트리를 나눈다 (공용 `common/tv/`).
  defineTvMeshes(graphics);
  const track = trackMesh(TRACK_PATH);
  graphics.defineMesh('rails', triangleGeometry(track.rails));
  graphics.defineMesh('sleepers', triangleGeometry(track.sleepers));
  graphics.defineMesh('terrain', createTerrainGeometry());
  graphics.defineMesh('mound', latheGeometry(moundProfile(), DREAM_SHAPE.radialSegments));
  graphics.defineMesh('pillar', latheGeometry(pillarProfile(), DREAM_SHAPE.radialSegments));
  graphics.defineMesh('alienHead', latheGeometry(headProfile(), DREAM_SHAPE.radialSegments));
  graphics.defineMesh('alienVisor', arrayGeometry(visorPatch()));
  graphics.defineMesh('alienSlit', arrayGeometry(slitPatch()));
  const tentacle = tentacleSkin();
  graphics.defineSkinnedMesh('tentacle', arrayGeometry(tentacle), tentacle);
  graphics.defineMesh('satelliteDish', latheGeometry(dishProfile(), DREAM_SHAPE.radialSegments));
}

/** `ring` 메시의 관 반지름. 고리 반지름에 대한 비율이라 크기를 키우면 함께 굵어진다. */
export const RING_TUBE_RATIO = 0.0015;

/** 땅을 나누는 정이십면체 세분 수. 정점 간격이 0.3쯤이라 언덕이 매끄럽다. */
const TERRAIN_DETAIL = 72;

/** 고르게 나뉜 정이십면체 구를 땅의 높이 함수대로 민다. 정점은 월드 좌표다. */
function createTerrainGeometry(): BufferGeometry {
  const [cx, cy, cz] = PLANET.center;
  return displacedSphereGeometry(TERRAIN_DETAIL, (position) => {
    for (let i = 0; i < position.length; i += 3) {
      const len = Math.hypot(position[i], position[i + 1], position[i + 2]);
      const dir: Vec3 = [position[i] / len, position[i + 1] / len, position[i + 2] / len];
      const r = PLANET.radius + terrainHeight(dir);
      position[i] = cx + dir[0] * r;
      position[i + 1] = cy + dir[1] * r;
      position[i + 2] = cz + dir[2] * r;
    }
  });
}

/** 표면 부품을 자리에 놓는 행렬. 지오메트리의 +Z가 `normal`을 향하고, 위쪽은 몸통 축(+Y)에 가깝게 둔다. */
function partMatrix({ position, normal }: RocketPart, push = 0): Matrix4 {
  const z = new Vector3(...normal);
  const x = new Vector3(0, 1, 0).cross(z).normalize();
  const y = z.clone().cross(x);
  const p = new Vector3(...position).addScaledVector(z, push);
  return new Matrix4().makeBasis(x, y, z).setPosition(p);
}

/** 로켓 모형의 몸통, 다리, 창틀, 옆문, 리벳을 한 지오메트리로 합친다. 모양은 `rocketShape.ts`가 정한다. */
function createRocketGeometry(): BufferGeometry {
  const up = new Vector3(0, 1, 0);
  const { radius, rimTube } = ROCKET_SHAPE.window;
  const [hw, hh, hd] = ROCKET_SHAPE.hatch.size;
  const r = ROCKET_SHAPE.rivets.radius;
  return mergeParts([
    [new LatheGeometry(bodyProfile().map(([pr, y]) => new Vector2(pr, y)), ROCKET_SHAPE.radialSegments)],
    ...rocketLegs().map((leg): [BufferGeometry, Matrix4] => [
      new CapsuleGeometry(leg.radius, leg.length, 6, 16),
      new Matrix4().compose(
        new Vector3(...leg.center),
        new Quaternion().setFromUnitVectors(up, new Vector3(...leg.axis)),
        new Vector3(1, 1, 1),
      ),
    ]),
    [new TorusGeometry(radius, rimTube, 8, 32), partMatrix(rocketWindow(), 0.012)],
    [new SphereGeometry(0.5, 20, 12), partMatrix(rocketHatch()).multiply(new Matrix4().makeScale(hw, hh, hd))],
    ...rocketRivets().map((rivet): [BufferGeometry, Matrix4] => [new SphereGeometry(r, 6, 4), new Matrix4().makeTranslation(...rivet)]),
  ]);
}

/** 로켓 창의 유리. 몸통보다 조금 밖에 띄운 원판이다. */
function createRocketGlassGeometry(): BufferGeometry {
  const glass = new CircleGeometry(ROCKET_SHAPE.window.radius, 32);
  glass.deleteAttribute('uv');
  glass.applyMatrix4(partMatrix(rocketWindow(), 0.018));
  glass.computeBoundingSphere();
  return glass;
}

