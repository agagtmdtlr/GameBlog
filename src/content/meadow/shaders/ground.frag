precision highp float;

// 초원 땅. 흐린 날 빛을 받는 툰 음영이고, 잔디와 같은 채도·안개를 써서 먼 잎이 땅으로 녹아드는 색과 맞는다.
// 엔진 툰 셰이더 대신 이 셰이더로 그리므로 그림자 맵은 받지 않는다.

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uAlbedo;
uniform float uSaturation;
uniform vec3 uFogColor;
uniform vec2 uFogRange;

in vec3 vWorldPos;
in vec3 vNormal;

out vec4 fragColor;

const float PI = 3.14159265;
const vec3 TOON_EDGES = vec3(0.06, 0.32, 0.68);
const vec3 TOON_STEPS = vec3(0.4, 0.35, 0.25);

float toonStep(float edge, float x) {
  float w = max(fwidth(x), 1e-4);
  return smoothstep(edge - w, edge + w, x);
}

float toonDiffuse(float x) {
  return dot(TOON_STEPS, vec3(toonStep(TOON_EDGES.x, x), toonStep(TOON_EDGES.y, x), toonStep(TOON_EDGES.z, x)));
}

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 N = normalize(vNormal);
  float NoL = max(dot(N, uLightDir), 0.0);
  vec3 ambient = uGroundColor * 0.4 + uSkyColor * 0.6;
  vec3 color = uAlbedo * (uLightColor / PI * toonDiffuse(NoL) + ambient);
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, uSaturation);

  vec3 outColor = linearToSrgb(acesFilm(color));
  if (uFogRange.y > uFogRange.x) {
    outColor = mix(outColor, uFogColor, smoothstep(uFogRange.x, uFogRange.y, length(uCameraPos - vWorldPos)));
  }
  fragColor = vec4(outColor, 1.0);
}
