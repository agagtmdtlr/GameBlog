import meshVert from './shaders/mesh.vert?raw';
import toonFrag from './shaders/toon.frag?raw';
import type { Material } from '../frame';
import type { ShaderSpec, UniformValue } from '../shader';
import { STANDARD_LAYOUT } from '../vertex';

/**
 * 엔진 툰 셰이더. 셰이더 이름은 `toon`(`shader.ts`의 `TOON_SHADER`)이고, 툰 재질(`Material`)로 그린다.
 * 콘텐츠가 툰 셰이더를 바탕으로 제 셰이더를 만들 때 정점·조각 셰이더 원문을 가져다 쓸 수 있다.
 */
export const MESH_VERTEX_SHADER: string = meshVert;
export const TOON_FRAGMENT_SHADER: string = toonFrag;

export const TOON_SHADER_SPEC: ShaderSpec = {
  vertexShader: MESH_VERTEX_SHADER,
  fragmentShader: TOON_FRAGMENT_SHADER,
  layout: STANDARD_LAYOUT,
  uniforms: {
    uBaseColor: [0, 0, 0],
    uEmissive: [0, 0, 0],
    uMetallic: 0,
    uRoughness: 1,
    uPattern: 0,
    uReceiveOccluder: false,
  },
};

/** 툰 재질을 툰 셰이더의 uniform 값으로 바꾼다. */
export function toonUniforms(m: Material): Record<string, UniformValue> {
  return {
    uBaseColor: m.baseColor,
    uEmissive: m.emissive,
    uMetallic: m.metallic,
    uRoughness: m.roughness,
    uPattern: m.pattern,
    uReceiveOccluder: m.receivesOccluder,
  };
}
