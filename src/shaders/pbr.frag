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
/** 물이 든 구. xyz: 중심, w: 반지름 */
uniform vec4 uWaterBall;
uniform float uWaterOpacity;
uniform float uTime;

uniform sampler2DShadow uShadowMap;
uniform float uShadowTexel;

out vec4 fragColor;

const float PI = 3.14159265359;
const int PATTERN_SPHERE_BANDS = 1;
const int PATTERN_GRID = 2;

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

// 물이 든 구가 빛을 통과시키며 만드는 옅은 그림자와 일렁이는 커스틱. x: 빛 투과율, yzw: 추가 빛
vec4 waterBallLight() {
  if (uWaterOpacity <= 0.0 || uPattern == PATTERN_SPHERE_BANDS) return vec4(1.0, vec3(0.0));
  vec3 toBall = uWaterBall.xyz - vWorldPos;
  float along = dot(toBall, uLightDir);
  if (along <= 0.0) return vec4(1.0, vec3(0.0));

  vec3 offset = (toBall - uLightDir * along) / uWaterBall.w;
  float radial = length(offset);
  float inside = 1.0 - smoothstep(0.9, 1.08, radial);
  float shadow = mix(1.0, mix(1.0, 0.0, inside), 1.0 - 0.62 * uWaterOpacity);

  float wobble = sin(offset.x * 9.0 + uTime * 2.3) * sin(offset.z * 11.0 - uTime * 1.9);
  float focus = exp(-radial * radial * 5.0) * (1.25 + 0.3 * wobble);
  float ring = exp(-pow((radial - 0.72 - wobble * 0.05) * 9.0, 2.0)) * 0.55;
  vec3 caustic = vec3(0.72, 0.95, 1.0) * (focus + ring) * inside * uWaterOpacity;
  return vec4(shadow, caustic);
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
  if (uPattern == PATTERN_GRID && N.y > 0.9) {
    vec2 c = vWorldPos.xz / 2.0;
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
  vec4 ballLight = waterBallLight();
  float shadow = sampleShadow();
  vec3 direct = (diffuseColor / PI * (1.0 - F) + specular) * uLightColor * NoL * shadow * ballLight.x;
  direct += diffuseColor / PI * ballLight.yzw * uLightColor * NoL * shadow;

  float visibility = uPattern == PATTERN_SPHERE_BANDS ? 1.0 : occluderVisibility(N);
  visibility = mix(visibility, 1.0, uWaterOpacity * 0.5);
  vec3 irradiance = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  vec3 R = reflect(-V, N);
  vec3 envColor = mix(uGroundColor, uSkyColor, R.y * 0.5 + 0.5);
  vec3 ambient = (diffuseColor * irradiance + envBrdfApprox(f0, roughness, NoV) * envColor) * visibility;

  fragColor = vec4(linearToSrgb(acesFilm(direct + ambient + uEmissive)), 1.0);
}
