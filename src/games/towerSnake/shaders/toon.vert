// 타워 뱀의 툰 메시 (뱀의 셰이더를 복사). three.js ShaderMaterial(GLSL3)로 쓴다 (행렬과 position, normal, instanceMatrix, instanceColor는 three.js가 선언한다).
// InstancedMesh면 조각마다의 행렬과 색을, 아니면 uColor를 쓴다.

uniform vec3 uColor;

out vec3 vNormal;
out vec3 vColor;
out vec3 vView;

void main() {
  mat4 model = modelMatrix;
#ifdef USE_INSTANCING
  model = model * instanceMatrix;
#endif
  vColor = uColor;
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#endif
  vec4 world = model * vec4(position, 1.0);
  // 크기를 고르게 키운 공·둥근 상자가 대부분이라 모델 행렬로 돌린 뒤 길이만 맞춘다.
  vNormal = normalize(mat3(model) * normal);
  vView = cameraPosition - world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
