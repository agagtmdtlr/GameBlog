// 카메라를 향하는 사각형을 인스턴스마다 하나씩 그린다.
// position은 -1~1 범위의 사각형이고, viewMatrix와 projectionMatrix는 three.js가 채운다.

in vec3 position;
/** 월드 공간 중심 */
in vec3 aCenter;
/** x: 반지름, y: 불투명도, z: 무늬 씨앗, w: 열기 */
in vec4 aParams;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

out vec2 vUv;
out vec3 vParams;

void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

  // 입자마다 다른 각도로 돌려 같은 무늬가 반복되어 보이지 않게 한다.
  float angle = aParams.z * 6.2831853;
  float c = cos(angle);
  float s = sin(angle);
  vec2 corner = vec2(position.x * c - position.y * s, position.x * s + position.y * c);

  vec3 world = aCenter + (right * corner.x + up * corner.y) * aParams.x;
  vUv = position.xy;
  vParams = aParams.yzw;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
