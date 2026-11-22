precision highp float;

// 비눗방울. 가산 혼합으로 그리므로 검은색이 투명이다.
// 가운데는 거의 비어 있고, 가장자리에 무지개빛 막, 화면 기준 왼쪽 위·오른쪽 아래에 비친 창과 반짝임이 있다.

uniform vec3 uCameraPos;
uniform vec3 uLightDir;

in vec3 vNormal;
in vec3 vViewNormal;
in vec3 vWorldPos;
in float vSwirl;

out vec4 fragColor;

const float PI = 3.14159265;

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// 막 두께에 따라 도는 무지개색 (얇은 막 간섭을 흉내 낸다)
vec3 filmColor(float thickness) {
  vec3 c = 0.5 + 0.5 * cos(2.0 * PI * (thickness + vec3(0.0, 0.33, 0.67)));
  return c * c;
}

// 화면에서 본 방울 위, 극좌표(각 theta, 반지름 r)의 휘어진 창 하나
float windowPane(vec2 p, float theta, float halfWidth, float r0, float r1) {
  float r = length(p);
  float a = atan(p.y, p.x) - theta;
  a = atan(sin(a), cos(a));
  float across = 1.0 - smoothstep(halfWidth * 0.75, halfWidth, abs(a));
  float along = smoothstep(r0, r0 + 0.06, r) * (1.0 - smoothstep(r1 - 0.05, r1, r));
  return across * along;
}

// 네 갈래로 뻗는 반짝임
float sparkle(vec2 p, vec2 at, float size) {
  vec2 d = (p - at) / size;
  float core = 0.02 / (dot(d, d) + 0.02);
  float cross4 = exp(-abs(d.x) * 30.0) * exp(-abs(d.y) * 3.0) + exp(-abs(d.y) * 30.0) * exp(-abs(d.x) * 3.0);
  return core + cross4 * 0.8;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 nv = normalize(vViewNormal);
  bool front = gl_FrontFacing;
  if (!front) {
    N = -N;
    nv = -nv;
  }
  vec3 V = normalize(uCameraPos - vWorldPos);
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float rim = 1.0 - ndv;

  // 막 두께가 천천히 흐르는 물결처럼 바뀐다.
  float flow = 0.55 * sin(3.0 * N.y + 2.0 * PI * vSwirl) + 0.35 * sin(4.0 * (N.x + N.z) - 1.7 * PI * vSwirl);
  vec3 film = filmColor(0.25 + 0.9 * ndv + 0.3 * flow + vSwirl);

  // 프레넬: 가운데는 비고 가장자리가 밝다. 맨 바깥에는 가는 띠가 한 번 더 빛난다.
  float fresnel = 0.03 + 0.97 * pow(rim, 3.0);
  vec3 color = film * fresnel * 1.6;
  color += film * smoothstep(0.86, 0.97, rim) * (1.0 - smoothstep(0.985, 1.0, rim)) * 1.2;

  if (front) {
    vec2 p = nv.xy;
    // 왼쪽 위의 푸른 창, 오른쪽 아래의 초록 창. 가장자리 쪽이 더 밝다.
    float paneA = windowPane(p, 2.25, 0.42, 0.42, 0.8);
    float paneB = windowPane(p, -0.75, 0.5, 0.4, 0.78);
    float rimGlow = smoothstep(0.3, 0.85, length(p));
    color += paneA * mix(vec3(0.05, 0.25, 0.9), vec3(0.3, 0.9, 1.2), rimGlow) * 0.55;
    color += paneB * mix(vec3(0.15, 0.6, 0.08), vec3(0.6, 1.1, 0.5), rimGlow) * 0.45;
    // 창 모서리의 반짝임
    color += vec3(1.0, 0.97, 0.9) * sparkle(p, vec2(-0.35, 0.33), 0.09) * 1.2;
    color += vec3(0.95, 1.0, 0.9) * sparkle(p, vec2(0.36, -0.22), 0.07);

    // 해가 비치는 날카로운 하이라이트
    vec3 R = reflect(-V, N);
    color += vec3(1.0, 0.95, 0.85) * pow(max(dot(R, uLightDir), 0.0), 600.0) * 3.0;
  } else {
    // 안쪽 면은 너머의 가장자리만 은은하게 비친다.
    color *= 0.45;
  }

  fragColor = vec4(linearToSrgb(acesFilm(color)), 1.0);
}
