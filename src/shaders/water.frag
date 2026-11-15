precision highp float;

// 물이 든 투명한 구. 메시는 외곽만 제공하고, 내부는 단위 구 공간에서 광선을 추적한다.

in vec3 vWorldPos;
in vec3 vObjectPos;

uniform mat4 uViewProj;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;

uniform sampler2D uSceneColor;
/** xyz: 중심, w: 반지름 */
uniform vec4 uBall;
/** 구가 놓인 행성. xyz: 중심, w: 반지름 */
uniform vec4 uGround;
/** xyz: 수면 법선, w: 수면 높이 (구 반지름 기준) */
uniform vec4 uSurface;
uniform float uOpacity;
uniform float uRipple;
uniform float uTime;

out vec4 fragColor;

const float WATER_IOR = 1.33;
const vec3 ABSORPTION = vec3(1.25, 0.36, 0.13);
const vec3 SCATTER_COLOR = vec3(0.015, 0.13, 0.25);
const vec3 SOFTBOX_DIRECTION = normalize(vec3(-0.25, 0.9, 0.35));

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

float fresnel(float cosine, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0);
}

vec3 environment(vec3 direction) {
  vec3 gradient = mix(uGroundColor, uSkyColor, direction.y * 0.5 + 0.5);
  float softbox = smoothstep(0.78, 0.96, dot(direction, SOFTBOX_DIRECTION));
  return gradient + softbox * 1.8;
}

/** 물결이 더해진 수면 법선 */
vec3 surfaceNormal(vec3 point, vec3 up) {
  float amplitude = 0.03 + uRipple * 0.16;
  vec2 d1 = vec2(0.83, 0.56);
  vec2 d2 = vec2(-0.45, 0.89);
  vec2 d3 = vec2(0.2, -0.98);
  // 수면 위의 좌표축. 행성 위에서는 up이 어느 방향이든 될 수 있다.
  vec3 axisU = normalize(cross(up, abs(up.x) > 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 axisV = cross(up, axisU);
  vec2 q = vec2(dot(point, axisU), dot(point, axisV));
  vec2 slope =
    d1 * cos(dot(q, d1) * 7.0 + uTime * 3.1) +
    d2 * cos(dot(q, d2) * 11.0 - uTime * 4.3) * 0.6 +
    d3 * cos(dot(q, d3) * 17.0 + uTime * 5.7) * 0.3;
  return normalize(up - (axisU * slope.x + axisV * slope.y) * amplitude);
}

/** 구 안의 한 점에서 출발한 광선이 구 표면에 닿기까지의 거리 */
float distanceToShell(vec3 origin, vec3 direction) {
  float b = dot(origin, direction);
  return -b + sqrt(max(b * b - dot(origin, origin) + 1.0, 0.0));
}

/** 구를 빠져나간 광선 뒤에 보이는 장면. 광선이 행성 표면에 닿는 곳의 화면 좌표를 찾는다. */
vec3 sampleScene(vec3 worldOrigin, vec3 direction) {
  vec3 fromGround = worldOrigin - uGround.xyz;
  float b = dot(fromGround, direction);
  float discriminant = b * b - dot(fromGround, fromGround) + uGround.w * uGround.w;
  float travel = 6.0;
  if (b < 0.0 && discriminant > 0.0) travel = clamp(-b - sqrt(discriminant), 0.0, 14.0);
  vec4 clip = uViewProj * vec4(worldOrigin + direction * travel, 1.0);
  if (clip.w <= 0.0) return environment(direction) * 0.25;
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  return srgbToLinear(texture(uSceneColor, uv).rgb);
}

void main() {
  vec3 up = uSurface.xyz;
  float level = uSurface.w;

  vec3 entry = normalize((vWorldPos - uBall.xyz) / uBall.w);
  vec3 incident = normalize(vWorldPos - uCameraPos);
  vec3 toLight = uLightDir;

  float entryCos = dot(-incident, entry);
  float entryFresnel = fresnel(entryCos, 0.04);
  vec3 reflected = reflect(incident, entry);
  float specular = pow(max(dot(reflected, toLight), 0.0), 900.0) * 14.0;
  vec3 added = entryFresnel * environment(reflected) + uLightColor * specular;

  bool inWater = dot(entry, up) < level;
  vec3 position = entry;
  vec3 direction = inWater ? refract(incident, entry, 1.0 / WATER_IOR) : incident;
  float waterPath = 0.0;
  float transmit = 1.0 - entryFresnel;

  // 수면과의 교차. 위에서 들어오면 반사와 굴절, 아래에서 보면 전반사가 일어난다.
  float shellDistance = distanceToShell(position, direction);
  float towardSurface = dot(direction, up);
  float surfaceDistance = abs(towardSurface) > 1e-4 ? (level - dot(position, up)) / towardSurface : -1.0;
  if (surfaceDistance > 0.0 && surfaceDistance < shellDistance) {
    vec3 hit = position + direction * surfaceDistance;
    vec3 normal = surfaceNormal(hit, up);
    float rimRadius = sqrt(max(1.0 - level * level, 1e-3));
    float rim = smoothstep(0.88, 1.0, length(hit - up * level) / rimRadius);
    added += vec3(0.75, 0.92, 1.0) * rim * 0.28;

    if (inWater) {
      waterPath += surfaceDistance;
      vec3 outgoing = refract(direction, -normal, WATER_IOR);
      if (dot(outgoing, outgoing) < 1e-6) {
        direction = reflect(direction, -normal);
        added += vec3(0.1, 0.24, 0.3) * 0.35;
      } else {
        direction = outgoing;
        inWater = false;
      }
    } else {
      float surfaceFresnel = fresnel(dot(-direction, normal), 0.02);
      vec3 surfaceReflection = reflect(direction, normal);
      added += surfaceFresnel * environment(surfaceReflection);
      added += uLightColor * pow(max(dot(surfaceReflection, toLight), 0.0), 240.0) * 1.4;
      transmit *= 1.0 - surfaceFresnel;
      direction = refract(direction, normal, 1.0 / WATER_IOR);
      inWater = true;
    }
    position = hit;
    shellDistance = distanceToShell(position, direction);
  }

  vec3 exitPoint = position + direction * shellDistance;
  vec3 scene;
  if (inWater) {
    waterPath += shellDistance;
    vec3 outgoing = refract(direction, -exitPoint, WATER_IOR);
    if (dot(outgoing, outgoing) < 1e-6) {
      scene = environment(reflect(direction, -exitPoint)) * 0.45;
    } else {
      scene = sampleScene(uBall.xyz + exitPoint * uBall.w, outgoing);
    }
  } else {
    scene = sampleScene(uBall.xyz + exitPoint * uBall.w, direction);
  }

  // 외곽에 맺히는 수면 경계선과, 구의 회전을 보여 주는 옅은 띠
  float waterline = 1.0 - smoothstep(0.0, 0.022, abs(dot(entry, up) - level));
  added += vec3(0.8, 0.95, 1.0) * waterline * 0.22;
  vec3 objectDirection = normalize(vObjectPos);
  float bandDistance = min(abs(objectDirection.y), abs(objectDirection.x));
  float bandWidth = fwidth(bandDistance);
  added += vec3(0.1) * (1.0 - smoothstep(0.03 - bandWidth, 0.03 + bandWidth, bandDistance));

  vec3 absorbed = scene * exp(-waterPath * ABSORPTION);
  vec3 scattered = SCATTER_COLOR * (1.0 - exp(-waterPath * 0.8)) * (0.55 + 0.45 * dot(toLight, up));
  vec3 color = (absorbed + scattered) * transmit + acesFilm(added);
  fragColor = vec4(linearToSrgb(clamp(color, 0.0, 1.0)), uOpacity);
}
