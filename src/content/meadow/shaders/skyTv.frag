precision highp float;

// 하늘 텔레비전. 흐린 날의 빛을 받는 툰 음영의 검은 플라스틱이고, 화면은 방송 빛(vSignal)을 내며 그 빛이 앞면의 테·몸통에 번진다.
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
in vec3 vLocal;
in vec3 vLocalNormal;
in float vPhase;
flat in vec3 vSignal;

out vec4 fragColor;

const float PI = 3.14159265;
// 화면이 내는 빛의 세기와, 그 빛이 앞면에 번지는 세기
const float SCREEN_GLOW = 1.5;
const float SPILL = 0.55;
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

  // 흐린 날 빛에 맞춰 채도를 낮춘다. 방송 빛은 그 뒤에 더해 제 색을 지킨다.
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, uSaturation);

  if (vScreen > 0.5) {
    // 방송 화면: 장면 빛에 흐릿한 그림 얼룩, 주사선, 잡음 알갱이, 흘러내리는 띠를 얹고 가장자리를 어둡게 한다.
    vec2 uv = (vLocal.xy - SCREEN_CENTER.xy) / SCREEN_HALF;
    vec2 cell = floor(vLocal.xy * 90.0);
    float frame = floor(uTime * 14.0 + vPhase * 10.0);
    float noise = hash(cell + frame);
    float band = smoothstep(0.85, 1.0, sin(vLocal.y * 9.0 + uTime * 1.3 + vPhase));
    float picture = 0.75 + 0.25 * sin(uv.x * 2.6 + vPhase * 4.0 + uTime * 0.4) * sin(uv.y * 2.1 - vPhase * 2.0 - uTime * 0.25);
    float scan = 0.82 + 0.18 * sin(vLocal.y * 520.0);
    float vignette = 1.0 - 0.35 * dot(uv * uv, vec2(0.7, 0.9));
    color = color * 0.4 + vSignal * SCREEN_GLOW * picture * scan * vignette * (0.8 + 0.2 * noise) + vSignal * band * 0.25;
  } else {
    // 화면 빛이 앞면에 번진다. 화면 유리에서 멀수록 약해지고, 앞면 근처에서만, 화면을 향한 면일수록 밝다.
    vec2 outside = max(abs(vLocal.xy - SCREEN_CENTER.xy) - SCREEN_HALF, 0.0);
    float falloff = exp(-length(outside) * 12.0);
    float front = smoothstep(SCREEN_CENTER.z - 0.05, SCREEN_CENTER.z, vLocal.z);
    vec3 n = normalize(vLocalNormal);
    vec3 toScreen = normalize(vec3(SCREEN_CENTER.xy, SCREEN_CENTER.z + 0.08) - vLocal);
    float facing = 0.25 + 0.75 * max(dot(n, toScreen), 0.0);
    color += vSignal * SPILL * falloff * front * facing;
  }

  vec3 outColor = linearToSrgb(acesFilm(color));
  if (uFogRange.y > uFogRange.x) {
    // 빛나는 화면은 안개를 조금 더 뚫고 보인다.
    float fog = smoothstep(uFogRange.x, uFogRange.y, length(uCameraPos - vWorldPos));
    outColor = mix(outColor, uFogColor, fog * (vScreen > 0.5 ? 0.8 : 1.0));
  }
  fragColor = vec4(outColor, 1.0);
}
