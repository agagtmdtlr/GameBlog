precision highp float;

// 하늘 텔레비전. 흐린 날의 빛을 받는 툰 음영의 검은 플라스틱이고, 꺼진 화면에는 희미한 잡음(지지직)이 흐른다.
// 멀수록 안개(하늘색)로 사라져, 「골콩드」처럼 겹겹이 멀어지는 깊이가 생긴다. 그림자 맵은 받지 않는다.

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uTime;
uniform float uSaturation;
uniform vec3 uFogColor;
uniform vec2 uFogRange;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;
in float vScreen;
in vec2 vScreenUv;
in float vPhase;

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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = uLightDir;

  vec3 albedo = vColor;
  float NoL = max(dot(N, L), 0.0);
  vec3 color = albedo / PI * uLightColor * toonDiffuse(NoL);
  color += albedo * mix(uGroundColor, uSkyColor, 0.6);
  // 검은 플라스틱의 광택. 흐린 하늘을 비추는 반사(비스듬할수록 강하다)와, 빛 쪽의 또렷한 하이라이트.
  // 몸통이 거의 검으므로 이 광택이 모서리와 면을 드러낸다. 하이라이트는 툰 음영처럼 경계를 끊는다.
  float NoV = max(dot(N, V), 0.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  float gloss = vScreen > 0.5 ? 0.6 : 1.0;
  color += uSkyColor * fresnel * 0.55 * gloss;
  vec3 H = normalize(L + V);
  float highlight = toonStep(0.5, pow(max(dot(N, H), 0.0), 48.0));
  color += uLightColor * highlight * 0.05 * gloss;

  if (vScreen > 0.5) {
    // 꺼진 브라운관의 잡음: 화면 위 칸마다 무작위 밝기가 빠르게 바뀌고, 가로 띠가 천천히 흘러내린다.
    vec2 cell = floor(vScreenUv * 90.0);
    float frame = floor(uTime * 14.0 + vPhase * 10.0);
    float noise = hash(cell + frame);
    float band = smoothstep(0.85, 1.0, sin(vScreenUv.y * 9.0 + uTime * 1.3 + vPhase));
    color += vec3(0.06, 0.07, 0.075) * (0.4 + 0.6 * noise) + vec3(0.05) * band;
  }

  // 흐린 날 빛에 맞춰 채도를 낮춘다.
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, uSaturation);

  vec3 outColor = linearToSrgb(acesFilm(color));
  if (uFogRange.y > uFogRange.x) {
    outColor = mix(outColor, uFogColor, smoothstep(uFogRange.x, uFogRange.y, length(uCameraPos - vWorldPos)));
  }
  fragColor = vec4(outColor, 1.0);
}
