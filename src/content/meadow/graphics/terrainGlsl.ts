import { MEADOW } from '../objects/meadowTerrain';

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

/**
 * 초원 땅 높이(`meadowHeight`)와 땅 위의 점(`meadowPoint`)을 GLSL로 만든다.
 * `MEADOW`의 같은 값으로 만들므로 잔디 뿌리가 캐릭터가 걷는 땅과 늘 맞는다.
 */
export function meadowTerrainGlsl(): string {
  const waves = MEADOW.waves
    .map(([a, kx, kz, phase]) => `  h += ${f(a)} * sin(${f(kx)} * p.x + ${f(kz)} * p.y + ${f(phase)});`)
    .join('\n');
  const { start, end, height } = MEADOW.rim;
  return `
const float MEADOW_CURVATURE = ${f(MEADOW.curvature)};

// 수평 좌표 p = (x, z)의 땅 높이 (meadowTerrain.ts의 meadowHeight)
float meadowHeight(vec2 p) {
  float h = 0.0;
${waves}
  float s = smoothstep(${f(start)}, ${f(end)}, length(p));
  return h + ${f(height)} * s * s;
}

// 수평 좌표 p 땅 위의 점을 위쪽으로 lift만큼 띄운 자리 (meadowTerrain.ts의 meadowPoint)
vec3 meadowPoint(vec2 p, float lift) {
  float R = MEADOW_CURVATURE;
  float q = dot(p, p) / (R * R);
  float s = sqrt(max(0.0, 1.0 - q));
  float h = meadowHeight(p) + lift;
  return vec3(p.x * (1.0 + h / R), h * s - R * q / (1.0 + s), p.y * (1.0 + h / R));
}
`;
}
