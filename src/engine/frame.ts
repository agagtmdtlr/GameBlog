import type { Billboard } from './render/billboard';
import type { Mat3, Mat4, Vec3 } from './math';

/**
 * 한 프레임을 그리는 데 필요한 값의 모양.
 * three.js에 의존하지 않으므로 `World`와 테스트가 GPU 없이 쓸 수 있다.
 */

/**
 * 그릴 메시의 이름. 엔진은 `ENGINE_MESHES`만 기본으로 가지고, 나머지는 콘텐츠가
 * `Graphics.defineMesh`·`defineSkinnedMesh`로 등록한 이름이다 (`render/graphics.ts`).
 * 카메라를 보는 평면은 메시가 아니라 `FrameData.billboards`로 그린다.
 */
export type MeshKind = string;

/**
 * 엔진이 기본으로 가진 메시. `sphere`는 반지름 1 구, `box`는 한 변 1 정육면체,
 * `cylinder`는 축이 Z인 지름 1, 길이 1의 원기둥이다.
 */
export const ENGINE_MESHES = ['sphere', 'box', 'cylinder'] as const;

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

export interface FrameData {
  items: readonly DrawItem[];
  /** 카메라를 보는 사각 빌보드. 순서는 상관없고, 렌더러가 한 번에 모아 그린다 (`render/billboard.ts`). */
  billboards: readonly Billboard[];
  camera: CameraView;
  environment: Environment;
  /** 앰비언트 오클루전을 만드는 구 */
  occluder: { center: Vec3; radius: number };
}
