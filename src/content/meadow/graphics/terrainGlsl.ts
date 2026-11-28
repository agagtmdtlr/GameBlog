import { MEADOW } from '../objects/meadowTerrain';

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

/**
 * 초원 땅 높이(`meadowHeight`), 너울(`meadowSwell`), 땅 위의 점(`meadowPoint`)을 GLSL로 만든다.
 * `MEADOW`의 같은 값으로 만들므로 잔디 뿌리와 땅이 캐릭터가 걷는 땅과 늘 맞는다.
 * 너울의 시각은 `uSwellTime` uniform으로 받는다 (`MeadowWorld.time`과 같아야 한다).
 */
export function meadowTerrainGlsl(): string {
  const waves = MEADOW.waves
    .map(([a, kx, kz, phase]) => `  h += ${f(a)} * sin(${f(kx)} * p.x + ${f(kz)} * p.y + ${f(phase)});`)
    .join('\n');
  const swells = MEADOW.swells
    .map(([a, wavelength, heading, speed, phase]) => {
      const k = (2 * Math.PI) / wavelength;
      return `  h += ${f(a)} * sin(${f(k)} * (${f(Math.cos(heading))} * p.x + ${f(Math.sin(heading))} * p.y - ${f(speed)} * time) + ${f(phase)});`;
    })
    .join('\n');
  const { start, end, height } = MEADOW.rim;
  return `
const float MEADOW_CURVATURE = ${f(MEADOW.curvature)};
uniform float uSwellTime;

// 수평 좌표 p = (x, z), 시각 time의 너울 높이 (meadowTerrain.ts의 meadowSwell)
float meadowSwell(vec2 p, float time) {
  float h = 0.0;
${swells}
  return h;
}

// 수평 좌표 p = (x, z)의 땅 높이 (meadowTerrain.ts의 meadowHeight)
float meadowHeight(vec2 p) {
  float h = 0.0;
${waves}
  float s = smoothstep(${f(start)}, ${f(end)}, length(p));
  return h + ${f(height)} * s * s;
}

// 지금(uSwellTime) 너울을 더한 땅 높이
float meadowSurface(vec2 p) {
  return meadowHeight(p) + meadowSwell(p, uSwellTime);
}

// 수평 좌표 p, 지금 너울 위의 점을 위쪽으로 lift만큼 띄운 자리 (meadowTerrain.ts의 meadowPoint에 시각을 준 것)
vec3 meadowPoint(vec2 p, float lift) {
  float R = MEADOW_CURVATURE;
  float q = dot(p, p) / (R * R);
  float s = sqrt(max(0.0, 1.0 - q));
  float h = meadowSurface(p) + lift;
  return vec3(p.x * (1.0 + h / R), h * s - R * q / (1.0 + s), p.y * (1.0 + h / R));
}
`;
}
