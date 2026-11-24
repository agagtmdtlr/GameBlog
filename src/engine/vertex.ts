/**
 * 정점 속성의 모양. three.js 없이 쓰므로 콘텐츠의 모양 코드와 테스트가 GPU 없이 지오메트리를 만들 수 있다.
 * 속성 이름과 성분 수는 고정하지 않는다. 지오메트리는 가진 속성을 이름으로 내놓고,
 * 셰이더는 필요한 속성을 `VertexLayout`으로 밝힌다. 렌더러가 둘이 맞는지 확인한다.
 */

export type AttributeArray = Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;

/** 정점 하나당 성분 수. GLSL의 float, vec2, vec3, vec4(또는 int, ivec*)에 대응한다. */
export type AttributeSize = 1 | 2 | 3 | 4;

export interface VertexAttribute {
  array: AttributeArray;
  itemSize: AttributeSize;
  /** 정수 배열을 0~1(부호 있으면 -1~1)로 바꿔 읽는다. 색처럼 Uint8로 담은 값에 쓴다. */
  normalized?: boolean;
}

/** 이름 붙인 정점 속성들과 색인. 색인이 없으면 정점 순서대로 삼각형을 만든다. */
export interface GeometryData {
  attributes: Readonly<Record<string, VertexAttribute>>;
  index?: Uint16Array | Uint32Array;
}

/** 셰이더가 읽는 정점 속성: GLSL `in` 이름 → 성분 수 */
export type VertexLayout = Readonly<Record<string, AttributeSize>>;

/** 엔진 툰 셰이더(`mesh.vert`)가 읽는 속성. 엔진 기본 메시는 모두 이 속성을 가진다. */
export const STANDARD_LAYOUT: VertexLayout = { position: 3, normal: 3 };

/**
 * `layout`이 요구하는데 지오메트리에 없거나 성분 수가 다른 속성을 설명하는 문장들. 맞으면 빈 배열이다.
 * `available`은 지오메트리가 가진 속성 이름 → 성분 수다.
 */
export function layoutMismatches(layout: VertexLayout, available: Readonly<Record<string, number>>): string[] {
  const problems: string[] = [];
  for (const [name, size] of Object.entries(layout)) {
    const has = available[name];
    if (has === undefined) problems.push(`${name}(${size}) 없음`);
    else if (has !== size) problems.push(`${name}의 성분 수가 ${size}가 아니라 ${has}`);
  }
  return problems;
}

/** 모든 속성의 정점 수가 같은지 확인하고 정점 수를 돌려준다. */
export function vertexCount(data: GeometryData): number {
  let count = -1;
  for (const [name, { array, itemSize }] of Object.entries(data.attributes)) {
    if (array.length % itemSize !== 0) throw new Error(`정점 속성 ${name}의 길이가 성분 수 ${itemSize}의 배수가 아닙니다.`);
    const n = array.length / itemSize;
    if (count >= 0 && n !== count) throw new Error(`정점 속성 ${name}의 정점 수(${n})가 다른 속성(${count})과 다릅니다.`);
    count = n;
  }
  if (count < 0) throw new Error('정점 속성이 없습니다.');
  if (data.index) {
    for (const i of data.index) if (i >= count) throw new Error(`색인 ${i}가 정점 수 ${count}를 넘습니다.`);
  }
  return count;
}
