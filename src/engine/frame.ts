import type { Mat3, Mat4, Vec3 } from './math';

/**
 * 한 프레임을 그리는 데 필요한 값의 모양.
 * three.js에 의존하지 않으므로 `World`와 테스트가 GPU 없이 쓸 수 있다.
 */

/** `sphere`는 three.js 기본 구, `leg`는 `assets/character.glb`의 캐릭터 다리 스킨 메시다. */
export type MeshKind = 'sphere' | 'leg';

/** 스킨 메시가 쓰는 뼈 수. `leg` 메시의 뼈 순서는 [허벅지, 정강이, 발]이다. */
export const LEG_BONE_COUNT = 3;

export const SurfacePattern = { None: 0, Grid: 2 } as const;
export type SurfacePattern = (typeof SurfacePattern)[keyof typeof SurfacePattern];

export interface Material {
  baseColor: Vec3;
  metallic: number;
  roughness: number;
  emissive: Vec3;
  pattern: SurfacePattern;
  /** `FrameData.surfaceZones`를 표면에 그린다. 원점 기준 구 메시(행성)에 쓴다. */
  showsZones: boolean;
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

/**
 * PBR 그리기 목록만으로 표현할 수 없는 콘텐츠가 프레임마다 넘기는 값.
 * `kind`가 같은 콘텐츠 렌더러(`engine/contentRenderers/`)가 받아서 그린다.
 */
export interface ContentFrame {
  readonly kind: string;
}

/** 한 번에 그릴 수 있는 표면 영역 수. `pbr.frag`의 `MAX_ZONES`와 같아야 한다. */
export const MAX_SURFACE_ZONES = 8;

/** 구 표면에 칠하는 원형 영역 */
export interface SurfaceZoneFrame {
  /** 구 중심에서 영역 중심을 향하는 단위 벡터 */
  direction: Vec3;
  /** 영역의 반지름 (라디안) */
  angularRadius: number;
  /** 경계선의 폭 (라디안) */
  edgeWidth: number;
  color: Vec3;
  /** 활성 영역의 빛남 (0~1) */
  glow: number;
  /** 구가 영역 위에 있을 때의 강조 (0~1) */
  presence: number;
}

export interface FrameData {
  items: readonly DrawItem[];
  camera: CameraView;
  environment: Environment;
  /** 앰비언트 오클루전을 만드는 구 */
  occluder: { center: Vec3; radius: number };
  /** `showsZones` 재질에 칠하는 영역. `MAX_SURFACE_ZONES`개까지만 그린다. */
  surfaceZones: readonly SurfaceZoneFrame[];
  /** 전용 렌더러가 그리는 콘텐츠. 나머지 장면을 모두 그린 뒤에 순서대로 그린다. */
  contents: readonly ContentFrame[];
}
