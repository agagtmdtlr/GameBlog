// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// 번개 줄기. 마디 하나가 사각형 하나이고, 마디 방향으로 늘여 카메라를 향해 돈다.
// 같은 마디를 가는 심(aGlow 0)과 넓은 번짐(aGlow 1)으로 두 번 그린다.

in vec3 position; // 마디의 시작점 (three.js가 이 속성의 개수로 정점 수를 센다)
in vec3 aEnd;     // 마디의 끝점
in vec2 aCorner;  // x: 폭 방향 -1~1, y: 시작 0 ~ 끝 1
in float aWeight; // 줄기 1, 곁가지는 더 가늘고 옅다
in float aGlow;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCameraPos;
uniform vec2 uWidth; // 심, 번짐의 폭

out float vAcross;
out float vGlow;
out float vWeight;
out float vDistance;

void main() {
  vec3 world = mix(position, aEnd, aCorner.y);
  vec3 toCamera = uCameraPos - world;
  vec3 side = cross(aEnd - position, toCamera);
  side = side / max(length(side), 1e-4);
  float width = mix(uWidth.x, uWidth.y, aGlow) * mix(0.55, 1.0, aWeight);
  world += side * aCorner.x * width;
  vAcross = aCorner.x;
  vGlow = aGlow;
  vWeight = aWeight;
  vDistance = length(toCamera);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
