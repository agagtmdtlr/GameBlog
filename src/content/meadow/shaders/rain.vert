// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// 빗줄기 하나는 속도 방향으로 늘인 얇은 사각형이고, 카메라를 향해 돈다. 자리는 인스턴스 번호의 해시로 정한다.
// 줄기는 세상에 붙어 있고(카메라가 움직여도 제자리), 카메라 둘레 상자를 벗어나면 반대쪽으로 되돌아온다.

in vec2 position; // 사각형 모서리. x: 폭 방향 -1~1, y: 머리 0 ~ 꼬리 1

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCameraPos;
uniform vec3 uBoxMin;   // 카메라 기준 상자의 아래 모서리
uniform vec3 uBoxSize;
uniform float uFall;    // 지금까지 떨어진 거리
uniform vec2 uDrift;    // 지금까지 바람에 밀린 수평 거리
uniform vec3 uVelocity;
uniform float uFallJitter;
uniform float uStreakSeconds;
uniform float uWidth;

out float vAlpha;
out float vAcross;

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

void main() {
  uint id = uint(gl_InstanceID);
  vec3 seed = vec3(pcg3d(uvec3(id, id * 7u + 3u, 1898u))) / 4294967296.0;
  // 떨어지는 빠르기 몫은 1/60 단위로 끊는다. 그래야 CPU가 떨어진 거리를 (상자 높이 × 60)마다 되감아도 줄기가 튀지 않는다.
  float jitter = fract(seed.x * 37.0 + seed.z * 11.0) * 2.0 - 1.0;
  float speed = 1.0 + floor(jitter * uFallJitter * 60.0 + 0.5) / 60.0;

  vec3 raw = seed * uBoxSize + vec3(uDrift.x, -uFall * speed, uDrift.y);
  vec3 origin = uCameraPos + uBoxMin;
  vec3 local = mod(raw - origin, uBoxSize);
  vec3 head = origin + local;

  vec3 velocity = vec3(uVelocity.x, uVelocity.y * speed, uVelocity.z);
  vec3 tail = head - velocity * uStreakSeconds;
  vec3 world = mix(head, tail, position.y);

  vec3 toCamera = uCameraPos - head;
  float dist = length(toCamera);
  vec3 side = cross(velocity, toCamera);
  side = side / max(length(side), 1e-4);
  float widen = 1.0 + dist * 0.03;
  world += side * position.x * uWidth * widen;

  // 카메라 바로 앞의 줄기와 상자 가장자리·위아래의 줄기는 흐리게 해 경계가 보이지 않게 한다.
  float horizontal = length(head.xz - uCameraPos.xz);
  float radius = uBoxSize.x * 0.5;
  vAlpha = smoothstep(1.5, 5.0, dist)
    * (1.0 - smoothstep(radius * 0.5, radius * 0.95, horizontal))
    * smoothstep(0.0, 4.0, local.y) * (1.0 - smoothstep(uBoxSize.y - 6.0, uBoxSize.y, local.y))
    / widen;
  vAcross = position.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
