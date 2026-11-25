precision highp float;

// 잔디 잎. 땅(툰 셰이더의 PATTERN_DREAMY)과 같은 파스텔 물결을 섞은 풀빛이고, 툰 셰이더처럼 빛을 단계로 나눈다.
// 돌풍이 지나는 잎은 밝게 빛나 바람 물결이 땅을 훑는 것이 보인다. 그림자 맵은 받지 않는다.

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uMoonColor;
uniform vec3 uNightAmbient;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vUp;
in float vT;
in float vSeed;
in float vGust;
in float vPressed;

out vec4 fragColor;

const float PI = 3.14159265;
const vec3 TOON_EDGES = vec3(0.06, 0.32, 0.68);
const vec3 TOON_STEPS = vec3(0.4, 0.35, 0.25);
/** 잎 밑동과 끝의 풀빛 (선형 RGB, sRGB #4FAE6E, #C9F2A6) */
const vec3 ROOT_COLOR = vec3(0.078, 0.423, 0.159);
const vec3 TIP_COLOR = vec3(0.584, 0.888, 0.381);

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

// 땅과 같은 파스텔 무지개 (toon.frag의 dreamPalette)
vec3 dreamPalette(float t) {
  vec3 srgb = 0.7 + 0.3 * cos(2.0 * PI * (t + vec3(0.0, 0.33, 0.67)));
  return pow(srgb, vec3(2.2));
}

void main() {
  vec3 p = vUp;
  float w = sin(dot(p, vec3(5.1, 3.7, -4.3)) + 0.6)
    + 0.6 * sin(dot(p, vec3(-7.9, 6.3, 5.2)) + 2.1)
    + 0.35 * sin(dot(p, vec3(13.0, -11.0, 9.0)));
  vec3 pastel = dreamPalette(0.5 + 0.22 * w);

  // 밑동은 짙고 끝은 옅다. 잎마다 색이 조금씩 다르고, 땅의 파스텔 물결이 스민다.
  vec3 green = mix(ROOT_COLOR, TIP_COLOR, smoothstep(0.0, 1.0, vT));
  green *= 0.85 + 0.3 * vSeed;
  vec3 albedo = mix(green, green * pastel * 1.6, 0.45);
  // 밑동 쪽 그늘(잎끼리 가리는 것)과 밟힌 잎의 그늘
  albedo *= mix(0.45, 1.0, smoothstep(0.0, 0.7, vT));
  albedo *= 1.0 - 0.3 * vPressed;

  // 잎은 얇으므로 면 법선과 위쪽을 섞어 둥근 덤불처럼 빛을 받게 한다.
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  if (dot(N, V) < 0.0) N = -N;
  N = normalize(mix(vUp, N, 0.35));
  vec3 L = uLightDir;

  float NoL = max(dot(N, L), 0.0);
  vec3 direct = albedo / PI * uLightColor * toonDiffuse(NoL);

  float sunHeight = dot(normalize(vWorldPos), L);
  float night = smoothstep(0.05, -0.2, sunHeight);
  direct += albedo / PI * uMoonColor * toonDiffuse(max(dot(N, -L), 0.0)) * night;

  vec3 ambientLight = mix(mix(uGroundColor, uSkyColor, 0.6), uNightAmbient, night);
  vec3 color = direct + albedo * ambientLight;

  // 돌풍이 지나는 잎은 뒤집혀 옅은 면이 햇빛에 반짝인다. 끝으로 갈수록 세다.
  float sheen = vGust * smoothstep(0.3, 1.0, vT);
  color += mix(TIP_COLOR, vec3(1.0), 0.5) * sheen * 0.35 * mix(1.0, 0.25, night);
  // 밤에는 땅처럼 스스로 은은하게 빛난다.
  color += albedo * night * 0.16;

  fragColor = vec4(linearToSrgb(acesFilm(color)), 1.0);
}
