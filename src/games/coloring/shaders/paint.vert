// 칠할 수 있는 메시. three.js ShaderMaterial(GLSL3)로 쓴다 (행렬과 position, normal은 three.js가 선언한다).

out vec3 vLocal;
out vec3 vNormal;

void main() {
  vLocal = position;
  // 늘인 상자도 면 법선은 축 방향이라 모델 행렬로 돌린 뒤 길이만 맞춘다.
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
