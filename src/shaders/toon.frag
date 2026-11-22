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
uniform vec4 uOccluder;
uniform bool uReceiveOccluder;

/** 표면 영역. uZoneParams x: 반지름(라디안), y: 경계선 폭(라디안), z: 빛남, w: 구가 위에 있음 */
const int MAX_ZONES = 8;
uniform bool uShowZones;
uniform int uZoneCount;
uniform vec3 uZoneDir[MAX_ZONES];
uniform vec3 uZoneColor[MAX_ZONES];
uniform vec4 uZoneParams[MAX_ZONES];

uniform sampler2DShadow uShadowMap;
uniform float uShadowTexel;

out vec4 fragColor;

const float PI = 3.14159265359;
const int PATTERN_GRID = 2;
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

vec3 applySurfacePattern(vec3 albedo, vec3 N) {
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

// 구 표면에 원형 영역을 칠한다. 안쪽은 영역 색으로 물들이고 경계에 선을 두른다.
// 활성 영역은 빛나고, 구가 올라서 있으면 경계선이 밝아진다.
void applySurfaceZones(vec3 N, inout vec3 albedo, inout vec3 emissive) {
  if (!uShowZones) return;
  for (int i = 0; i < MAX_ZONES; i++) {
    if (i >= uZoneCount) break;
    vec4 p = uZoneParams[i];
    float angle = acos(clamp(dot(N, uZoneDir[i]), -1.0, 1.0));
    float aa = fwidth(angle);
    float inside = 1.0 - smoothstep(p.x - aa, p.x + aa, angle);
    float edge = inside * (1.0 - smoothstep(p.y - aa, p.y + aa, p.x - angle));
    vec3 color = uZoneColor[i];
    albedo = mix(albedo, color, inside * 0.8);
    // 영역 색이 바탕과 같아도 보이도록 경계선은 어둡게, 구가 올라서면 영역 색으로 밝힌다.
    albedo = mix(albedo, albedo * 0.35, edge * (1.0 - p.w));
    emissive += color * (inside * p.z * 0.35 + edge * (p.z * 0.6 + p.w * 1.2));
  }
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 L = uLightDir;
  vec3 H = normalize(V + L);

  vec3 albedo = applySurfacePattern(uBaseColor, N);
  vec3 emissive = uEmissive;
  applySurfaceZones(N, albedo, emissive);
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

  // 밤의 정도. 행성 중심(원점)에서 이 점을 향하는 방향과 해 방향으로 정하므로,
  // 물체가 어느 쪽을 보든 행성에서 서 있는 자리가 밤이면 같이 밤이 된다. 해 질 녘에 걸쳐 넘어간다.
  float sunHeight = dot(normalize(vWorldPos), L);
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

  // 그늘과 그림자에 하프톤 점을 씌운다. 해와 달 중 밝은 쪽 빛이 밝은 단계에 못 미칠수록 점이 커지고,
  // 몸 아래 오클루전도 그늘로 친다. 발광은 점의 영향을 받지 않는다.
  float lightAmount = max(NoL * shadow, max(dot(N, -L), 0.0) * night);
  float shade = 1.0 - smoothstep(0.0, HALFTONE_LIGHT_LIMIT, lightAmount);
  shade = max(shade, 0.6 * (1.0 - visibility) / 0.45);
  vec3 shaded = (direct + ambient) * mix(1.0, HALFTONE_INK, halftoneDots(shade));

  fragColor = vec4(linearToSrgb(acesFilm(shaded + emissive)), 1.0);
}
