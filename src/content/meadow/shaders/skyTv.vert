// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// 텔레비전 하나(한 변 1인 상자 안, 부품마다 색 color와 번호 aPart: 0 나무, 1 은색, 2 검은 판, 3 화면)를 하늘 텔레비전마다 인스턴스로 그린다.
// 텔레비전은 제자리에서 천천히 둥실거린다.

in vec3 position;
in vec3 normal;
in vec3 color;
in float aPart;
in vec3 iPosition;
in vec4 iRotation;
in float iScale;
in float iTint;
in float iPhase;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;
out float vScreen;
out vec2 vScreenUv;
out float vPhase;

vec3 rotate(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

void main() {
  // 위아래로 둥실거린다. 크기가 클수록 느리다.
  float bob = sin(uTime * (0.9 / (0.6 + iScale * 0.2)) + iPhase) * 0.35 * iScale * 0.25;
  vec3 world = iPosition + rotate(iRotation, position * iScale) + vec3(0.0, bob, 0.0);
  vWorldPos = world;
  vNormal = rotate(iRotation, normal);
  // 나무 색만 텔레비전마다 조금씩 다르다.
  vColor = color * (aPart < 0.5 ? iTint : 1.0);
  vScreen = step(2.5, aPart);
  vScreenUv = position.xy;
  vPhase = iPhase;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
