import type { VertexLayout } from './vertex';

/**
 * 셰이더와 재질의 모양. three.js 없이 쓰므로 콘텐츠의 `World`가 GPU 없이 그리기 항목을 만들 수 있다.
 * 콘텐츠는 `Graphics.defineShader`로 셰이더를 등록하고, `DrawItem.material`에 `ShaderMaterial`을 넣어 쓴다.
 * 엔진 툰 셰이더는 이름이 `toon`인 기본 셰이더이고, 툰 재질(`frame.ts`의 `Material`)로 쓴다.
 */

export type ShaderKind = string;

/**
 * uniform 값. 숫자·참거짓은 float·int·bool, 길이 2·3·4 배열은 vec2·vec3·vec4,
 * 길이 9·16 배열은 열 우선 mat3·mat4다.
 */
export type UniformValue = number | boolean | readonly number[] | Float32Array;

export interface ShaderSpec {
  /** GLSL 3.00 ES. `#version`은 쓰지 않는다. `modelMatrix`, `viewMatrix`, `projectionMatrix`는 선언만 하면 채워진다. */
  vertexShader: string;
  fragmentShader: string;
  /** 지오메트리가 가져야 하는 정점 속성. 맞지 않는 메시는 그리지 않고 한 번 알린다. */
  layout: VertexLayout;
  /**
   * 그리기 항목마다 따로 갖는 uniform과 기본값. 그리기 항목의 `uniforms`가 덮어쓴다.
   * 여기 없는 이름도 그리기 항목이 넣으면 쓰인다.
   */
  uniforms?: Readonly<Record<string, UniformValue>>;
  /** 섞는 방법. 기본은 `opaque` */
  blending?: 'opaque' | 'normal' | 'additive';
  /** 깊이를 쓴다. 기본은 `blending`이 `opaque`일 때만 참 */
  depthWrite?: boolean;
  /** 그리는 면. 기본은 `front` */
  side?: 'front' | 'back' | 'double';
}

/**
 * 엔진이 모든 셰이더에 프레임마다 채워 주는 uniform. 셰이더에 선언한 것만 쓰인다.
 * 그림자 패스는 정점 셰이더를 쓰지 않고 `position`만 읽으므로, 정점을 움직이는 셰이더의 그림자는 움직이지 않는다.
 */
export const FRAME_UNIFORMS = {
  uNormalMatrix: 'mat3. 그리기 항목의 월드 공간 법선 행렬',
  uLightViewProj: 'mat4. 그림자 광원의 뷰·투영 행렬',
  uShadowMap: 'sampler2DShadow. 그림자 깊이',
  uShadowTexel: 'float. 그림자 맵 한 칸의 크기',
  uCameraPos: 'vec3. 카메라 월드 위치',
  uLightDir: 'vec3. 표면에서 광원을 향하는 단위 벡터',
  uLightColor: 'vec3. 직사광 색',
  uSkyColor: 'vec3. 하늘 앰비언트',
  uGroundColor: 'vec3. 땅 앰비언트',
  uMoonColor: 'vec3. 달빛',
  uNightAmbient: 'vec3. 밤 앰비언트',
  uWorldCenter: 'vec3. 중력이 향하는 땅의 중심 (`Environment.worldCenter`)',
  uOccluder: 'vec4. 앰비언트 오클루전 구 (중심, 반지름)',
  uHalftoneCell: 'float. 하프톤 점 한 칸의 픽셀 크기',
} as const;

/** 등록한 셰이더로 그리는 재질 */
export interface ShaderMaterial {
  shader: ShaderKind;
  /** 이 그리기 항목의 uniform 값. 셰이더의 기본값을 덮어쓴다. */
  uniforms?: Readonly<Record<string, UniformValue>>;
}

/** 엔진 툰 셰이더의 이름 */
export const TOON_SHADER: ShaderKind = 'toon';
