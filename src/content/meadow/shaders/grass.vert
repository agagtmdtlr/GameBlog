// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙이고, 앞에 meadowTerrainGlsl()이 붙는다.
// 잔디는 버퍼에 담지 않는다. 카메라 앞쪽에 둔 N × N 격자의 칸마다 잎 하나를 인스턴스로 그리고,
// 칸의 월드 좌표에서 해시로 자리·키·방향을 뽑으므로 카메라가 움직여도 잎은 제자리에 있다.
// 잎(position: x는 폭 방향 -0.5~0.5, y는 밑동 0~끝 1)은 바람과 몸 쪽으로 곡률이 일정한 호를 그리며 휜다.

in vec3 position;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

uniform vec3 uCameraPos;
// 카메라가 보는 수평 방향 (x, z 단위 벡터)
uniform vec2 uCameraForward;
// 격자 가운데 칸 (월드 칸 번호), 칸 크기, 한 변의 칸 수
uniform ivec2 uGridCenter;
uniform float uSpacing;
uniform int uGridSize;
// 카메라 수평 거리로 정하는 이 격자의 몫: x~y에서 나타나고 z~w에서 사라진다.
uniform vec4 uBand;
// 카메라 수평 거리: 이 사이에서 잎이 땅 색으로 녹아들고 키가 준다 (grass.frag와 같은 값).
uniform vec2 uColorFade;
// 잎 키: x~y가 보통 잎, z~w가 길게 자란 잎. 길게 자란 잎의 비율과 밑동 폭 범위
uniform vec4 uHeight;
uniform float uTallChance;
uniform vec2 uWidth;
// 몸이 잎을 눕히는 수평 거리 (몸 반지름의 배수)
uniform float uPushReach;
// 먼 격자는 잎을 넓혀 빈 곳을 메운다.
uniform float uWidthScale;

uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uGustTravel;
// 잔디를 밀어내는 몸: xyz 가운데, w 반지름
uniform vec4 uPusher;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vUp;
out float vT;
out float vSeed;
out float vGust;
out float vPressed;
out float vFlower;

const float PI = 3.14159265;
/** 잎이 휘는 가장 큰 각 (라디안) */
const float MAX_BEND = 1.35;

// 정수 두 개에서 고르게 섞인 정수 두 개 (pcg2d)
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}

vec2 random2(ivec2 cell, uint salt) {
  uvec2 h = pcg2d(uvec2(cell) + uvec2(salt * 7919u, salt * 104729u));
  return vec2(h) * (1.0 / 4294967296.0);
}

void collapse() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

void main() {
  int i = gl_InstanceID % uGridSize;
  int j = gl_InstanceID / uGridSize;
  ivec2 cell = uGridCenter + ivec2(i, j) - ivec2(uGridSize / 2);

  vec2 r0 = random2(cell, 1u);
  vec2 r1 = random2(cell, 2u);
  vec2 r2 = random2(cell, 3u);
  vec2 xz = (vec2(cell) + r0) * uSpacing;

  // 카메라 뒤는 보이지 않는다.
  vec2 fromCamera = xz - uCameraPos.xz;
  if (dot(fromCamera, uCameraForward) < -3.0) {
    collapse();
    return;
  }
  float dist = length(fromCamera);
  float share = smoothstep(uBand.x, uBand.y, dist) * (1.0 - smoothstep(uBand.z, uBand.w, dist));
  if (r1.x >= share) {
    collapse();
    return;
  }

  float seed = r1.y;
  float yaw = r2.x * 2.0 * PI;
  // 대부분 보통 키이고 몇몇은 길게 자라 덤불 위로 솟는다.
  float height = r2.y < uTallChance ? mix(uHeight.z, uHeight.w, r1.y) : mix(uHeight.x, uHeight.y, r1.y);
  // 잎 색이 땅 색으로 녹아드는 먼 곳에서는 키도 줄어 땅으로 사라진다. 격자끼리 맞물리는 곳에서는 줄지 않는다.
  height *= 1.0 - smoothstep(uColorFade.x, uColorFade.y + 10.0, dist) * 0.7;
  float width = mix(uWidth.x, uWidth.y, r0.x) * uWidthScale;

  vec3 root = meadowPoint(xz, -0.06);
  vec3 up = normalize(vec3(root.x, root.y + MEADOW_CURVATURE, root.z));

  vec3 helper = abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(helper, up));
  vec3 e2 = cross(up, e1);
  vec3 side = e1 * cos(yaw) + e2 * sin(yaw);
  vec3 facing = cross(side, up);

  // 바람 방향 (접평면에 맞춘다)
  vec3 wind3 = vec3(uWindDir.x, 0.0, uWindDir.y);
  vec3 windDir = normalize(wind3 - up * dot(wind3, up));

  // 돌풍 띠: 바람 방향으로 나아가는 물결 두 겹. 옆으로도 조금 굽어 띠가 곧은 줄로 보이지 않는다.
  vec2 perp = vec2(-uWindDir.y, uWindDir.x);
  float along = dot(xz, uWindDir) - uGustTravel;
  float across = dot(xz, perp);
  float wave = sin(along * 0.11 + 1.6 * sin(across * 0.045 + uGustTravel * 0.02))
    + 0.5 * sin(along * 0.23 + across * 0.07 + seed * 0.8);
  float gust = smoothstep(0.1, 1.3, wave) * uWindStrength;

  // 센 바람일수록 깊게 눕고, 잎마다 다른 빠르기로 떤다.
  float sway = sin(uTime * (2.3 + 1.6 * seed) + seed * 40.0 + dot(xz, vec2(0.9, 0.75)) * 1.4);
  float lean = uWindStrength * 0.38 + gust * 0.85 + sway * (0.06 + 0.2 * uWindStrength + 0.25 * gust);
  vec3 bend = windDir * lean + facing * (seed - 0.5) * 0.5;

  // 몸이 지나가면 잎이 바깥으로 눕는다.
  float pressed = 0.0;
  if (uPusher.w > 0.0) {
    vec3 d = root - uPusher.xyz;
    float vertical = dot(d, up);
    vec3 flat_ = d - up * vertical;
    float r = length(flat_);
    float s = (1.0 - smoothstep(uPusher.w * 0.35, uPusher.w * uPushReach, r))
      * (1.0 - smoothstep(uPusher.w * 1.2, uPusher.w * 2.2, abs(vertical)));
    if (s > 0.0) {
      bend += (r > 1e-3 ? flat_ / r : side) * s * 1.6;
      pressed = s;
    }
  }

  float m = min(length(bend), MAX_BEND);
  vec3 bendDir = length(bend) > 1e-4 ? normalize(bend) : facing;

  // 곡률이 일정한 호: 밑동에서 t만큼 간 자리 = h × (위 × sin(mt)/m + 휜 쪽 × (1 - cos(mt))/m)
  float t = position.y;
  float mt = m * t;
  float rise = m > 1e-3 ? sin(mt) / m : t;
  float outward = m > 1e-3 ? (1.0 - cos(mt)) / m : 0.0;
  vec3 spine = root + (up * rise + bendDir * outward) * height;
  float taper = width * (1.0 - t * t * 0.85);
  vec3 worldPos = spine + side * position.x * taper;

  vec3 tangent = up * cos(mt) + bendDir * sin(mt);
  vNormal = normalize(cross(side, tangent));
  vUp = up;
  vWorldPos = worldPos;
  vT = t;
  vSeed = seed;
  vGust = gust;
  vPressed = pressed;
  // 드물게 끝에 작은 꽃이 핀다.
  vec2 r3 = random2(cell, 4u);
  vFlower = r3.x < 0.012 ? 1.0 + floor(r3.y * 3.0) : 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
