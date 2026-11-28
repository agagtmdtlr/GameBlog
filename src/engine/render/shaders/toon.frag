precision highp float;
precision highp sampler2DShadow;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vObjectPos;
in vec3 vShadowCoord;

uniform vec3 uBaseColor;
uniform vec3 uEmissive;
uniform float uMetallic;
uniform float uRoughness;
uniform int uPattern;

uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uMoonColor;
uniform vec3 uNightAmbient;
uniform vec3 uWorldCenter;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform vec4 uOccluder;
uniform bool uReceiveOccluder;

uniform sampler2DShadow uShadowMap;
uniform float uShadowTexel;

out vec4 fragColor;

const float PI = 3.14159265359;
const int PATTERN_GRID = 2;
const int PATTERN_DREAMY = 3;
const int PATTERN_GRADIENT = 4;
/** 지형물 아래쪽에 스미는 보랏빛 (선형 RGB) */
const vec3 DREAM_SHADE = vec3(0.3, 0.2, 0.9);
/** 정육면체 한 면의 절반에 들어가는 격자 칸 수 */
const float GRID_CELLS = 7.0;

/** 직사광 단계. 빛의 양이 경계값을 넘을 때마다 밝기가 한 단계 오른다 (그늘, 어두움, 중간, 밝음) */
const vec3 TOON_EDGES = vec3(0.06, 0.32, 0.68);
const vec3 TOON_STEPS = vec3(0.4, 0.35, 0.25);

// 경계를 화면에서 한두 픽셀 폭으로만 부드럽게 넘긴다. 단계는 또렷하고 계단 현상은 없다.
float toonStep(float edge, float x) {
  float w = max(fwidth(x), 1e-4);
  return smoothstep(edge - w, edge + w, x);
}

float toonDiffuse(float x) {
  return dot(TOON_STEPS, vec3(toonStep(TOON_EDGES.x, x), toonStep(TOON_EDGES.y, x), toonStep(TOON_EDGES.z, x)));
}

/** 하프톤 점. 화면 격자를 기울이고, 그늘이 짙을수록 점이 커진다. 점은 그 자리 색을 `HALFTONE_INK`배로 어둡게 칠한다 */
const float HALFTONE_ANGLE = 0.35;
const float HALFTONE_MAX_RADIUS = 0.48;
const float HALFTONE_INK = 0.5;
/** 빛의 양(N·L × 그림자)이 이 값 이상이면 점이 없다. 0에서 가장 크다 */
const float HALFTONE_LIGHT_LIMIT = 0.5;
/** 점 격자 한 칸의 크기(화면 픽셀). 기기 픽셀 비율을 곱해 CSS 픽셀 기준으로 같은 크기가 된다 */
uniform float uHalftoneCell;

// 화면 공간 점 무늬. 반지름은 칸 크기 단위이고, 경계는 한 픽셀 폭으로 부드럽게 넘긴다.
float halftoneDots(float shade) {
  if (shade <= 0.0) return 0.0;
  float c = cos(HALFTONE_ANGLE);
  float s = sin(HALFTONE_ANGLE);
  vec2 p = mat2(c, s, -s, c) * gl_FragCoord.xy / uHalftoneCell;
  float d = length(fract(p) - 0.5);
  float radius = HALFTONE_MAX_RADIUS * sqrt(shade);
  float aa = 1.0 / uHalftoneCell;
  return 1.0 - smoothstep(radius - aa, radius + aa, d);
}

float sampleShadow() {
  vec3 coord = vShadowCoord;
  if (any(lessThan(coord, vec3(0.0))) || any(greaterThan(coord, vec3(1.0)))) return 1.0;
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y)) * uShadowTexel * 1.5;
      sum += texture(uShadowMap, vec3(coord.xy + offset, coord.z));
    }
  }
  return sum / 9.0;
}

// 캐릭터 몸(구)이 만드는 해석적 앰비언트 오클루전. 몸 아래 땅을 어둡게 한다.
float occluderVisibility(vec3 N) {
  vec3 toOccluder = uOccluder.xyz - vWorldPos;
  float d2 = dot(toOccluder, toOccluder);
  float r2 = uOccluder.w * uOccluder.w;
  float occlusion = max(dot(N, toOccluder) / sqrt(d2), 0.0) * r2 / d2;
  return 1.0 - clamp(occlusion, 0.0, 1.0);
}

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// 파스텔 무지개. 코사인 팔레트를 sRGB로 만들고 선형으로 푼다.
vec3 dreamPalette(float t) {
  vec3 srgb = 0.7 + 0.3 * cos(2.0 * PI * (t + vec3(0.0, 0.33, 0.67)));
  return pow(srgb, vec3(2.2));
}

vec3 applySurfacePattern(vec3 albedo, vec3 N) {
  if (uPattern == PATTERN_DREAMY) {
    // 방향에 따라 여러 겹의 물결로 색이 천천히 바뀐다. 원점 기준 구나 월드 좌표 땅 모두 같은 무늬다.
    vec3 p = normalize(vObjectPos);
    float w = sin(dot(p, vec3(5.1, 3.7, -4.3)) + 0.6)
      + 0.6 * sin(dot(p, vec3(-7.9, 6.3, 5.2)) + 2.1)
      + 0.35 * sin(dot(p, vec3(13.0, -11.0, 9.0)));
    return albedo * dreamPalette(0.5 + 0.22 * w);
  }
  if (uPattern == PATTERN_GRADIENT) {
    // 아래는 보랏빛으로 가라앉고 위로 갈수록 옅어진다. 지형물 메시는 y가 위쪽이다.
    float t = smoothstep(-0.6, 1.0, vObjectPos.y);
    vec3 bottom = mix(albedo, DREAM_SHADE, 0.4) * 0.85;
    vec3 top = mix(albedo, vec3(1.0), 0.15);
    return mix(bottom, top, t);
  }
  if (uPattern == PATTERN_GRID) {
    // 구를 정육면체의 여섯 면으로 나눠 격자를 그린다. 위도·경도 격자와 달리 극점에서 선이 몰리지 않는다.
    vec3 p = normalize(vObjectPos);
    vec3 a = abs(p);
    vec2 uv = a.x >= a.y && a.x >= a.z ? p.yz / a.x : (a.y >= a.z ? p.xz / a.y : p.xy / a.z);
    // atan으로 펴서 면의 가운데와 가장자리의 칸 크기를 비슷하게 맞춘다.
    vec2 c = atan(uv) * (4.0 / PI) * GRID_CELLS;
    vec2 g = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), vec2(1e-4));
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    return albedo * mix(1.0, 0.86, line);
  }
  return albedo;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 L = uLightDir;
  vec3 H = normalize(V + L);

  vec3 albedo = applySurfacePattern(uBaseColor, N);
  vec3 emissive = uEmissive;
  float roughness = clamp(uRoughness, 0.04, 1.0);
  vec3 diffuseColor = albedo * (1.0 - uMetallic);

  // 그림자까지 곱한 빛의 양을 단계로 나눠, 몸의 음영과 드리운 그림자가 같은 단계로 보이게 한다.
  float NoL = max(dot(N, L), 0.0);
  float shadow = sampleShadow();
  float lit = toonDiffuse(NoL * shadow);
  vec3 direct = diffuseColor / PI * uLightColor * lit;

  // 하이라이트는 한 단계짜리 점. 매끈할수록 작고 진하며, 거칠기 1이면 없다.
  float shininess = mix(96.0, 6.0, roughness);
  float highlight = toonStep(0.5, pow(max(dot(N, H), 0.0), shininess)) * toonStep(TOON_EDGES.y, NoL * shadow);
  vec3 highlightColor = mix(vec3(1.0), albedo, uMetallic);
  direct += highlightColor * uLightColor * highlight * (1.0 - roughness) * 0.25;

  // 밤의 정도. 땅의 중심(uWorldCenter, 행성이면 원점)에서 이 점을 향하는 방향과 해 방향으로 정하므로,
  // 물체가 어느 쪽을 보든 행성에서 서 있는 자리가 밤이면 같이 밤이 된다. 해 질 녘에 걸쳐 넘어간다.
  float sunHeight = dot(normalize(vWorldPos - uWorldCenter), L);
  float night = smoothstep(0.05, -0.2, sunHeight);

  // 달빛은 해 반대쪽에서 비춘다. 해처럼 단계로 나누지만 그림자는 없다.
  float moonLit = toonDiffuse(max(dot(N, -L), 0.0)) * night;
  direct += diffuseColor / PI * uMoonColor * moonLit;

  // 앰비언트는 한 색으로 칠해 그늘을 평평하게 둔다. 낮에는 하늘과 땅 색의 평균, 밤에는 푸른 밤 색이다.
  // 몸 아래 오클루전도 한 단계로 나눈다.
  float occlusion = uReceiveOccluder ? 1.0 - occluderVisibility(N) : 0.0;
  float visibility = 1.0 - 0.45 * toonStep(0.18, occlusion);
  vec3 ambientLight = mix(mix(uGroundColor, uSkyColor, 0.6), uNightAmbient, night);
  vec3 ambient = (diffuseColor + albedo * uMetallic * 0.5) * ambientLight * visibility;

  // 몽환적인 땅과 지형물은 가장자리가 은은하게 빛나고, 밤에는 스스로 조금 빛난다.
  if (uPattern == PATTERN_DREAMY || uPattern == PATTERN_GRADIENT) {
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    emissive += albedo * (rim * 0.18 + night * 0.16);
  }

  // 그늘과 그림자에 하프톤 점을 씌운다. 해와 달 중 밝은 쪽 빛이 밝은 단계에 못 미칠수록 점이 커지고,
  // 몸 아래 오클루전도 그늘로 친다. 발광은 점의 영향을 받지 않는다.
  float lightAmount = max(NoL * shadow, max(dot(N, -L), 0.0) * night);
  float shade = 1.0 - smoothstep(0.0, HALFTONE_LIGHT_LIMIT, lightAmount);
  shade = max(shade, 0.6 * (1.0 - visibility) / 0.45);
  vec3 shaded = (direct + ambient) * mix(1.0, HALFTONE_INK, halftoneDots(shade));

  // 거리 안개는 화면 출력값(sRGB)에서 배경색으로 섞는다. 그래야 먼 땅이 하늘과 같은 색으로 사라진다.
  vec3 outColor = linearToSrgb(acesFilm(shaded + emissive));
  if (uFogRange.y > uFogRange.x) {
    float fog = smoothstep(uFogRange.x, uFogRange.y, length(uCameraPos - vWorldPos));
    outColor = mix(outColor, uFogColor, fog);
  }
  fragColor = vec4(outColor, 1.0);
}
