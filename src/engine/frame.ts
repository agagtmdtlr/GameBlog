import type { Mat3, Mat4, Vec3 } from './math';

/**
 * 한 프레임을 그리는 데 필요한 값의 모양.
 * three.js에 의존하지 않으므로 `World`와 테스트가 GPU 없이 쓸 수 있다.
 */

export type MeshKind = 'sphere' | 'cylinder';

export const SurfacePattern = { None: 0, SphereBands: 1, Grid: 2 } as const;
export type SurfacePattern = (typeof SurfacePattern)[keyof typeof SurfacePattern];

export interface Material {
  baseColor: Vec3;
  metallic: number;
  roughness: number;
  emissive: Vec3;
  pattern: SurfacePattern;
}

export interface DrawItem {
  mesh: MeshKind;
  model: Mat4;
  normal: Mat3;
  material: Material;
  castShadow: boolean;
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

export interface WaterSphere extends ContentFrame {
  kind: 'water-sphere';
  /** 투명해지기 전의 불투명한 구. 그림자 맵에는 들어가지 않는다. */
  item: DrawItem;
  center: Vec3;
  radius: number;
  /** 구가 놓인 행성. 굴절된 광선이 닿는 바닥을 찾는 데 쓴다. */
  ground: { center: Vec3; radius: number };
  surfaceNormal: Vec3;
  /** 수면 높이 (구 반지름 기준) */
  level: number;
  /** 0이면 불투명한 구만, 1이면 물이 든 구만 보인다. */
  opacity: number;
  /** 물결의 세기 (0~1) */
  ripple: number;
  time: number;
}

/** 연기 입자 하나가 차지하는 값의 개수: x, y, z, 크기, 불투명도, 무늬 씨앗, 열기 */
export const SMOKE_STRIDE = 7;
/** 한 번에 그릴 수 있는 연기 입자 수 */
export const SMOKE_CAPACITY = 96;

export interface HeatSphere extends ContentFrame {
  kind: 'heat-sphere';
  /** 달아오른 구. 같은 자리에 빛나는 껍질을 겹쳐 그린다. */
  item: DrawItem;
  center: Vec3;
  radius: number;
  /** 0이면 식어 있고 1이면 완전히 달아올랐다. */
  heat: number;
  time: number;
  /** 입자마다 `SMOKE_STRIDE`개씩 들어 있는 연기 값. 앞의 `smokeCount`개만 유효하다. */
  smoke: Float32Array;
  smokeCount: number;
}

export interface FrameData {
  items: readonly DrawItem[];
  camera: CameraView;
  environment: Environment;
  /** 앰비언트 오클루전을 만드는 구 */
  occluder: { center: Vec3; radius: number };
  /** 전용 렌더러가 그리는 콘텐츠. 나머지 장면을 모두 그린 뒤에 순서대로 그린다. */
  contents: readonly ContentFrame[];
}
