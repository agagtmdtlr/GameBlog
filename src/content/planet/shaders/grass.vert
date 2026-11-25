// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// 잎 하나(position: x는 폭 방향 -0.5~0.5, y는 밑동 0~끝 1)를 잔디 포기마다 인스턴스로 그린다.
// 잎은 바람과 밀어내는 몸 쪽으로 일정한 곡률의 호를 그리며 휜다. 길이는 휘어도 그대로다.

in vec3 position;
in vec3 iRoot;
// 방향각, 높이, 폭, 고유값(0~1)
in vec4 iBlade;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

uniform vec3 uCameraPos;
uniform float uTime;
uniform vec3 uWindAxis;
uniform float uWindStrength;
uniform float uGustPhase;
// x: 잎이 줄기 시작하는 거리, y: 다 사라지는 거리 (카메라에서)
uniform vec2 uFade;
// 잔디를 밀어내는 몸: xyz 가운데, w 반지름. w가 0이면 없다.
uniform vec4 uPushers[8];

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vUp;
out float vT;
out float vSeed;
out float vGust;
out float vPressed;

const float PI = 3.14159265;
/** 잎이 휘는 가장 큰 각 (라디안) */
const float MAX_BEND = 1.35;

void main() {
  vec3 up = normalize(iRoot);
  float yaw = iBlade.x;
  float height = iBlade.y;
  float width = iBlade.z;
  float seed = iBlade.w;

  // 뿌리 자리의 접평면 기저
  vec3 helper = abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(helper, up));
  vec3 e2 = cross(up, e1);
  vec3 side = e1 * cos(yaw) + e2 * sin(yaw);
  vec3 facing = cross(side, up);

  // 멀리 있는 잎은 듬성듬성 남기고 키를 줄여 땅으로 사라지게 한다. 남는 잎은 조금 넓혀 빈 곳을 메운다.
  float dist = length(iRoot - uCameraPos);
  float far = smoothstep(uFade.x * 0.55, uFade.y, dist);
  float keep = mix(1.0, 0.3, far);
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, dist);
  height *= fade;
  if (seed > keep || height < 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  width *= mix(1.0, 2.4, far);

  // 바람: 축 둘레를 도는 흐름. 축 가까이는 잔잔하다.
  vec3 flow = cross(uWindAxis, up);
  float flowLength = length(flow);
  vec3 windDir = flowLength > 1e-4 ? flow / flowLength : e1;
  float reach = smoothstep(0.0, 0.4, flowLength);

  // 돌풍 띠: 축 둘레 각도를 따라 나아가는 물결 두 겹. 고유값으로 조금씩 어긋나 띠의 가장자리가 부드럽다.
  vec3 a1 = normalize(cross(uWindAxis, abs(uWindAxis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 a2 = cross(uWindAxis, a1);
  float around = atan(dot(up, a2), dot(up, a1));
  float across = dot(up, uWindAxis);
  float wave = sin(3.0 * around - uGustPhase + 1.7 * sin(4.0 * across + 0.3 * uGustPhase))
    + 0.5 * sin(7.0 * around - 1.9 * uGustPhase + 5.0 * across + seed * 0.8);
  float gust = smoothstep(0.1, 1.3, wave) * uWindStrength;

  // 센 바람일수록 깊게 눕고, 잎마다 다른 빠르기로 떤다.
  float sway = sin(uTime * (2.3 + 1.6 * seed) + seed * 40.0 + dot(iRoot, vec3(0.9, 0.6, 0.75)) * 1.4);
  float lean = reach * (uWindStrength * 0.38 + gust * 0.85 + sway * (0.06 + 0.2 * uWindStrength + 0.25 * gust));
  vec3 bend = windDir * lean;
  // 바람이 없어도 잎이 조금씩 제멋대로 기운다.
  bend += facing * (seed - 0.5) * 0.5;

  // 몸이 지나가면 잎이 바깥으로 눕는다.
  float pressed = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 p = uPushers[i];
    if (p.w <= 0.0) continue;
    vec3 d = iRoot - p.xyz;
    float vertical = dot(d, up);
    vec3 flat_ = d - up * vertical;
    float r = length(flat_);
    float s = (1.0 - smoothstep(p.w * 0.35, p.w * 1.25, r)) * (1.0 - smoothstep(p.w * 1.2, p.w * 2.2, abs(vertical)));
    if (s <= 0.0) continue;
    vec3 away = r > 1e-3 ? flat_ / r : side;
    bend += away * s * 1.6;
    pressed = max(pressed, s);
  }

  float m = min(length(bend), MAX_BEND);
  vec3 bendDir = length(bend) > 1e-4 ? normalize(bend) : facing;

  // 곡률이 일정한 호: 밑동에서 t만큼 간 자리 = h × (위 × sin(mt)/m + 휜 쪽 × (1 - cos(mt))/m)
  float t = position.y;
  float mt = m * t;
  float along = m > 1e-3 ? sin(mt) / m : t;
  float out_ = m > 1e-3 ? (1.0 - cos(mt)) / m : 0.0;
  vec3 spine = iRoot + (up * along + bendDir * out_) * height;
  // 폭은 끝으로 갈수록 가늘어진다.
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
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
