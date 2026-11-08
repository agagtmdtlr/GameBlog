import { cross, type Vec3 } from './math';

export interface MeshData {
  /** position(xyz) + normal(xyz)이 교차 저장된 정점 배열 */
  vertices: Float32Array;
  indices: Uint16Array;
}

export interface Mesh {
  vao: WebGLVertexArrayObject;
  indexCount: number;
}

/** 반지름 1인 구 */
export function createSphereData(latSegments = 32, lonSegments = 48): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= latSegments; i++) {
    const theta = (Math.PI * i) / latSegments;
    for (let j = 0; j <= lonSegments; j++) {
      const phi = (2 * Math.PI * j) / lonSegments;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      vertices.push(x, y, z, x, y, z);
    }
  }
  const stride = lonSegments + 1;
  for (let i = 0; i < latSegments; i++) {
    for (let j = 0; j < lonSegments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      if (i > 0) indices.push(a, c, b);
      if (i < latSegments - 1) indices.push(c, d, b);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

/** 한 변이 1이고 원점이 중심인 박스 */
export function createBoxData(): MeshData {
  const faces: ReadonlyArray<{ n: Vec3; u: Vec3 }> = [
    { n: [1, 0, 0], u: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 1, 0] },
    { n: [0, 1, 0], u: [0, 0, 1] },
    { n: [0, -1, 0], u: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0] },
    { n: [0, 0, -1], u: [1, 0, 0] },
  ];
  const vertices: number[] = [];
  const indices: number[] = [];
  faces.forEach(({ n, u }, face) => {
    const v = cross(n, u);
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      vertices.push(
        (n[0] + u[0] * su + v[0] * sv) * 0.5,
        (n[1] + u[1] * su + v[1] * sv) * 0.5,
        (n[2] + u[2] * su + v[2] * sv) * 0.5,
        n[0], n[1], n[2],
      );
    }
    const base = face * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

/** 반지름 1, 높이 1이고 원점이 중심인 원기둥 */
export function createCylinderData(segments = 64): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  const ring = (y: number, normal: (cos: number, sin: number) => Vec3): number => {
    const start = vertices.length / 6;
    for (let j = 0; j <= segments; j++) {
      const phi = (2 * Math.PI * j) / segments;
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      vertices.push(cos, y, sin, ...normal(cos, sin));
    }
    return start;
  };

  const sideTop = ring(0.5, (c, s) => [c, 0, s]);
  const sideBottom = ring(-0.5, (c, s) => [c, 0, s]);
  for (let j = 0; j < segments; j++) {
    const t0 = sideTop + j;
    const t1 = t0 + 1;
    const b0 = sideBottom + j;
    const b1 = b0 + 1;
    indices.push(t0, t1, b0, t1, b1, b0);
  }

  const topRim = ring(0.5, () => [0, 1, 0]);
  const topCenter = vertices.length / 6;
  vertices.push(0, 0.5, 0, 0, 1, 0);
  const bottomRim = ring(-0.5, () => [0, -1, 0]);
  const bottomCenter = vertices.length / 6;
  vertices.push(0, -0.5, 0, 0, -1, 0);
  for (let j = 0; j < segments; j++) {
    indices.push(topCenter, topRim + j + 1, topRim + j);
    indices.push(bottomCenter, bottomRim + j, bottomRim + j + 1);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

/** 한 변이 1이고 위를 향하는 XZ 평면 */
export function createPlaneData(): MeshData {
  return {
    vertices: new Float32Array([
      -0.5, 0, -0.5, 0, 1, 0,
      -0.5, 0, 0.5, 0, 1, 0,
      0.5, 0, 0.5, 0, 1, 0,
      0.5, 0, -0.5, 0, 1, 0,
    ]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}

export function uploadMesh(gl: WebGL2RenderingContext, data: MeshData): Mesh {
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ibo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindVertexArray(null);
  return { vao, indexCount: data.indices.length };
}
