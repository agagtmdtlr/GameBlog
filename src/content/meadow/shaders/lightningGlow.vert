// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// 번개가 친 구름 속이 번쩍이는 빛. 구름 자리에 카메라를 향한 큰 사각형 하나를 둔다.

in vec2 position; // 사각형 모서리 -1~1

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCameraPos;
uniform vec3 uCenter;
uniform float uSize;

out vec2 vUv;

void main() {
  vec3 toCamera = normalize(uCameraPos - uCenter);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCamera));
  vec3 up = cross(toCamera, right);
  // 구름 속 빛은 옆으로 넓게 퍼진다.
  vec3 world = uCenter + (right * position.x * 1.4 + up * position.y * 0.8) * uSize;
  vUv = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
