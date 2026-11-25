precision highp float;

// 잔디 잎. 밑동은 짙고 끝은 옅은 풀빛이고, 넓게 퍼진 얼룩으로 노란빛·푸른빛 풀이 섞인다.
// 툰 셰이더처럼 빛을 단계로 나누고, 돌풍이 지나는 잎은 밝게 빛나 바람 물결이 초원을 훑는 것이 보인다.
// 그림자 맵은 받지 않는다.

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uFadeColor;
// 카메라 수평 거리: 이 사이에서 잎 색이 땅 색으로 녹아든다.
uniform vec2 uColorFade;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vUp;
in float vT;
in float vSeed;
in float vGust;
in float vPressed;
in float vFlower;

out vec4 fragColor;

const float PI = 3.14159265;
const vec3 TOON_EDGES = vec3(0.06, 0.32, 0.68);
const vec3 TOON_STEPS = vec3(0.4, 0.35, 0.25);
/** 잎 밑동과 끝의 풀빛 (선형 RGB, sRGB #3F8F3A, #B9E58A) */
const vec3 ROOT_COLOR = vec3(0.05, 0.275, 0.042);
const vec3 TIP_COLOR = vec3(0.485, 0.783, 0.254);
/** 얼룩 풀빛: 노란 풀, 푸른 풀 */
const vec3 DRY_TINT = vec3(1.25, 1.05, 0.55);
const vec3 COOL_TINT = vec3(0.7, 1.0, 1.05);
/** 꽃 색: 흰색, 노랑, 분홍 (선형 RGB) */
const vec3 FLOWER_COLORS[3] = vec3[3](vec3(0.95, 0.93, 0.88), vec3(1.0, 0.75, 0.08), vec3(0.95, 0.38, 0.62));

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
  vec2 p = vWorldPos.xz;
  // 수십 단위 크기로 퍼진 얼룩
  float patchA = sin(p.x * 0.07 + 0.4) * sin(p.y * 0.06 - 1.2) + 0.5 * sin((p.x + p.y) * 0.13);
  float patchB = sin(p.x * 0.045 - p.y * 0.08 + 2.0);

  vec3 green = mix(ROOT_COLOR, TIP_COLOR, smoothstep(0.0, 1.0, vT));
  green *= 0.82 + 0.36 * vSeed;
  green *= mix(vec3(1.0), DRY_TINT, smoothstep(0.4, 1.3, patchA) * 0.7);
  green *= mix(vec3(1.0), COOL_TINT, smoothstep(0.3, 1.0, patchB) * 0.6);
  vec3 albedo = green;
  if (vFlower > 0.5) {
    albedo = mix(albedo, FLOWER_COLORS[int(vFlower) - 1], smoothstep(0.82, 0.9, vT));
  }
  // 밑동 쪽 그늘(잎끼리 가리는 것)과 밟힌 잎의 그늘
  albedo *= mix(0.4, 1.0, smoothstep(0.0, 0.7, vT));
  albedo *= 1.0 - 0.3 * vPressed;

  // 잎은 얇으므로 면 법선과 위쪽을 섞어 둥근 덤불처럼 빛을 받게 한다.
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  if (dot(N, V) < 0.0) N = -N;
  N = normalize(mix(vUp, N, 0.35));
  vec3 L = uLightDir;

  float NoL = max(dot(N, L), 0.0);
  vec3 color = albedo / PI * uLightColor * toonDiffuse(NoL);
  color += albedo * mix(uGroundColor, uSkyColor, 0.6);

  // 역광: 해를 마주 보면 잎 끝이 비쳐 빛난다.
  float back = pow(max(dot(-V, L), 0.0), 4.0) * smoothstep(0.4, 1.0, vT);
  color += TIP_COLOR * uLightColor * back * 0.12;

  // 돌풍이 지나는 잎은 뒤집혀 옅은 면이 햇빛에 반짝인다. 끝으로 갈수록 세다.
  float sheen = vGust * smoothstep(0.3, 1.0, vT);
  color += mix(TIP_COLOR, vec3(1.0), 0.5) * sheen * 0.35;

  // 멀리서는 땅 색으로 녹아들어 잔디가 끝나는 경계가 보이지 않는다.
  float far = smoothstep(uColorFade.x, uColorFade.y, length(vWorldPos.xz - uCameraPos.xz));
  color = mix(color, uFadeColor, far);

  fragColor = vec4(linearToSrgb(acesFilm(color)), 1.0);
}
