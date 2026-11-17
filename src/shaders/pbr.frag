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
uniform vec4 uOccluder;

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
const int PATTERN_SPHERE_BANDS = 1;
const int PATTERN_GRID = 2;
/** 정육면체 한 면의 절반에 들어가는 격자 칸 수 */
const float GRID_CELLS = 7.0;

float distributionGGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

float visibilitySmith(float NoV, float NoL, float a) {
  float k = a * 0.5;
  float gv = NoV * (1.0 - k) + k;
  float gl = NoL * (1.0 - k) + k;
  return 0.25 / max(gv * gl, 1e-4);
}

vec3 fresnelSchlick(float VoH, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
}

// 환경 맵 없이 간접 반사의 크기를 근사한다 (Karis, 2014).
vec3 envBrdfApprox(vec3 f0, float roughness, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = roughness * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return f0 * ab.x + ab.y;
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

// 구가 만드는 해석적 앰비언트 오클루전. 구를 바닥에 붙어 보이게 한다.
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
  if (uPattern == PATTERN_SPHERE_BANDS) {
    // 오브젝트 공간의 대원 두 개. 회전이 눈에 보이게 하는 표식이다.
    vec3 p = normalize(vObjectPos);
    float d = min(abs(p.y), abs(p.x));
    float aa = fwidth(d);
    float band = 1.0 - smoothstep(0.05 - aa, 0.05 + aa, d);
    return mix(albedo, vec3(0.92), band * 0.5);
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
  float a = roughness * roughness;
  vec3 f0 = mix(vec3(0.04), albedo, uMetallic);
  vec3 diffuseColor = albedo * (1.0 - uMetallic);

  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 1e-3);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);

  vec3 F = fresnelSchlick(VoH, f0);
  vec3 specular = distributionGGX(NoH, a) * visibilitySmith(NoV, NoL, a) * F;
  float shadow = sampleShadow();
  vec3 direct = (diffuseColor / PI * (1.0 - F) + specular) * uLightColor * NoL * shadow;

  float visibility = uPattern == PATTERN_SPHERE_BANDS ? 1.0 : occluderVisibility(N);
  vec3 irradiance = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  vec3 R = reflect(-V, N);
  vec3 envColor = mix(uGroundColor, uSkyColor, R.y * 0.5 + 0.5);
  vec3 ambient = (diffuseColor * irradiance + envBrdfApprox(f0, roughness, NoV) * envColor) * visibility;

  fragColor = vec4(linearToSrgb(acesFilm(direct + ambient + emissive)), 1.0);
}
