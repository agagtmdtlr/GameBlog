// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// 사각형 하나(position, uv)를 빌보드마다 인스턴스로 그린다. i로 시작하는 속성이 빌보드마다 다르다.

in vec3 position;
in vec2 uv;
in vec3 iCenter;
in vec2 iSize;
in float iRotation;
in vec4 iUvRect;
in vec4 iColor;
in float iToneMap;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCameraPos;
uniform vec3 uCameraUp;

out vec2 vUv;
out vec4 vColor;
out float vToneMap;

void main() {
  // 앞면은 빌보드에서 카메라를 향하고, 위쪽은 화면 위쪽에 맞춘다 (game/sunFace.ts의 sunBillboardBasis와 같다).
  vec3 z = normalize(uCameraPos - iCenter);
  vec3 x = cross(uCameraUp, z);
  if (length(x) < 1e-4) x = cross(abs(z.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0), z);
  x = normalize(x);
  vec3 y = cross(z, x);

  // 크기를 먼저 곱하므로 가로가 음수면 좌우가 뒤집힌 채로 돈다.
  vec2 local = position.xy * iSize;
  float c = cos(iRotation);
  float s = sin(iRotation);
  local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);

  vec3 world = iCenter + x * local.x + y * local.y;
  vUv = mix(iUvRect.xy, iUvRect.zw, uv);
  vColor = iColor;
  vToneMap = iToneMap;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
