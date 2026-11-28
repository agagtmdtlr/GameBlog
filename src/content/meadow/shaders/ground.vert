// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다. 앞에 terrainGlsl.ts의 땅 함수가 붙는다.
// 카메라 둘레의 땅 격자. 정점을 격자 칸의 월드 수평 좌표에 두고 지금 너울 위로 올린다.
// 격자는 칸 크기로 끊어 카메라를 따라가므로, 땅은 제자리에 있고 너울만 흘러간다.

in vec2 position; // 격자 가운데에서 센 칸 번호

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform ivec2 uGridCenter;
uniform float uSpacing;

out vec3 vWorldPos;
out vec3 vNormal;

void main() {
  vec2 xz = (vec2(uGridCenter) + position) * uSpacing;
  vec3 world = meadowPoint(xz, 0.0);
  // 이웃 높이 차로 법선을 구한다. 땅이 이루는 구는 아주 커서 이 범위에서는 위쪽을 +Y로 본다.
  float e = uSpacing;
  float hx = meadowSurface(xz + vec2(e, 0.0)) - meadowSurface(xz - vec2(e, 0.0));
  float hz = meadowSurface(xz + vec2(0.0, e)) - meadowSurface(xz - vec2(0.0, e));
  vNormal = normalize(vec3(-hx, 2.0 * e, -hz));
  vWorldPos = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
