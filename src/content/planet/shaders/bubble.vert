// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// 반지름 1인 구(position)를 방울마다 인스턴스로 그린다. i로 시작하는 속성이 방울마다 다르다.

in vec3 position;
in vec3 iCenter;
in float iRadius;
in float iSwirl;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

out vec3 vNormal;
out vec3 vViewNormal;
out vec3 vWorldPos;
out float vSwirl;

void main() {
  // 단위 구라 위치가 곧 법선이다.
  vNormal = position;
  vViewNormal = mat3(viewMatrix) * position;
  vWorldPos = iCenter + position * iRadius;
  vSwirl = iSwirl;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
