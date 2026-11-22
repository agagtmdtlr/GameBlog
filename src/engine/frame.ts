import type { Billboard } from './billboard';
import type { Mat3, Mat4, Vec3 } from './math';

/**
 * 한 프레임을 그리는 데 필요한 값의 모양.
 * three.js에 의존하지 않으므로 `World`와 테스트가 GPU 없이 쓸 수 있다.
 */

/**
 * `sphere`는 three.js 기본 구, `box`는 한 변 1인 정육면체, `leg`는 `assets/character.glb`의 캐릭터 다리 스킨 메시다.
 * `ring`은 XY 평면에 놓인 반지름 1의 가느다란 고리(토러스)이고, 관의 반지름은 `RING_TUBE_RATIO`다.
 * `moon`은 반지름 1 언저리의 구에 충돌구와 바위 덩어리를 새긴 위성이다 (`moonShape.ts`).
 * `cylinder`는 축이 Z인 지름 1, 길이 1의 원기둥이다(기차 바퀴, 보일러).
 * `rails`와 `sleepers`는 선로의 레일과 침목이고, 월드 좌표로 만든 지오메트리라 단위 행렬로 그린다 (`trackPath.ts`).
 * `terrain`은 높낮이가 있는 행성 땅이고, 역시 월드 좌표라 단위 행렬로 그린다 (`Renderer.setTerrain`).
 * `mound`(종 모양 언덕)와 `pillar`(끝이 둥근 기둥)는 y 0~1, 바닥 반지름 0.5인 회전체다 (`dreamShape.ts`).
 * `alienHead`, `alienVisor`, `alienSlit`은 문어 꼴 외계인의 챙 달린 머리, 눈가리개, 눈가리개 틈이다 (`alienShape.ts`).
 * `tentacle`은 외계인의 촉수 스킨 메시로, `leg`처럼 `DrawItem.skin`으로 그린다.
 * `satelliteDish`는 인공위성의 접시 안테나로, 반지름 1에 오목한 쪽이 -Y를 본다 (`satelliteShape.ts`).
 * 카메라를 보는 평면(별, 햇살, 해 눈)은 메시가 아니라 `FrameData.billboards`로 그린다.
 */
export type MeshKind = 'sphere' | 'box' | 'pyramid' | 'leg' | 'ring' | 'moon' | 'rocket' | 'rocketGlass' | 'tv' | 'tvTrim' | 'tvDark' | 'tvScreen' | 'cylinder' | 'rails' | 'sleepers' | 'terrain' | 'mound' | 'pillar' | 'alienHead' | 'alienVisor' | 'alienSlit' | 'tentacle' | 'satelliteDish';

/** `ring` 메시의 관 반지름. 고리 반지름에 대한 비율이라 크기를 키우면 함께 굵어진다. */
export const RING_TUBE_RATIO = 0.0015;

/** 스킨 메시가 쓰는 뼈 수. `leg` 메시의 뼈 순서는 [허벅지, 정강이, 발]이다. */
export const LEG_BONE_COUNT = 3;

/**
 * `Grid`는 구 메시 전용 격자다. `Dreamy`는 방향에 따라 파스텔 색이 물결치는 땅, `Gradient`는 아래에서 위로
 * 색이 옅어지는 지형물이다. 둘 다 가장자리가 은은하게 빛나고 밤에 스스로 조금 빛난다.
 */
export const SurfacePattern = { None: 0, Grid: 2, Dreamy: 3, Gradient: 4 } as const;
export type SurfacePattern = (typeof SurfacePattern)[keyof typeof SurfacePattern];

export interface Material {
  baseColor: Vec3;
  metallic: number;
  roughness: number;
  emissive: Vec3;
  pattern: SurfacePattern;
  /** `FrameData.occluder`가 만드는 앰비언트 오클루전을 받는다. 캐릭터 자신에는 끈다. */
  receivesOccluder: boolean;
}

export interface DrawItem {
  mesh: MeshKind;
  model: Mat4;
  normal: Mat3;
  material: Material;
  castShadow: boolean;
  /**
   * 스킨 메시의 뼈마다 기본 자세의 정점을 월드로 옮기는 행렬. 있으면 `model`과 `normal` 대신
   * 정점마다 가중치로 섞은 이 행렬을 쓴다. 회전과 이동만 있어야 한다.
   */
  skin?: readonly Mat4[];
}

export interface Environment {
  /** 표면에서 광원을 향하는 단위 벡터 */
  lightDirection: Vec3;
  lightColor: Vec3;
  skyColor: Vec3;
  groundColor: Vec3;
  /** 해가 지면 해 반대쪽에서 비추는 달빛의 색과 세기. 그림자는 없다 */
  moonColor: Vec3;
  /** 밤인 곳의 앰비언트 색. 낮의 하늘·땅 평균색 대신 쓴다 */
  nightAmbient: Vec3;
  /** 화면 출력값(sRGB) 기준 배경색 */
  background: Vec3;
  /** 그림자 맵이 덮는 원점 기준 반경 */
  shadowRadius: number;
}

export interface CameraView {
  position: Vec3;
  target: Vec3;
  /** 화면의 위쪽이 되는 방향. 행성 위에서는 위치마다 다르다. */
  up: Vec3;
  /** 세로 시야각 (라디안) */
  fovY: number;
  near: number;
  far: number;
}

/** 행성 둘레를 떠다니는 비눗방울 하나 (`game/bubbleBelt.ts`) */
export interface BubbleFrame {
  center: Vec3;
  radius: number;
  /** 막의 무지개 물결이 흐른 정도. 방울마다 다르게 천천히 바뀐다. */
  swirl: number;
}

export interface FrameData {
  items: readonly DrawItem[];
  /** 카메라를 보는 사각 빌보드. 순서는 상관없고, 렌더러가 한 번에 모아 그린다 (`billboard.ts`). */
  billboards: readonly Billboard[];
  /** 반투명 비눗방울. 렌더러가 인스턴스로 한 번에 가산 혼합해 그린다 (`bubbleRenderer.ts`). */
  bubbles: readonly BubbleFrame[];
  camera: CameraView;
  environment: Environment;
  /** 앰비언트 오클루전을 만드는 구 */
  occluder: { center: Vec3; radius: number };
}
