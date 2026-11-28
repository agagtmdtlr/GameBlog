// 타워 사거리 원: 바닥에 눕힌 원판 (InstancedMesh). 조각마다의 행렬, 색(instanceColor), 진하기(aAlpha)를 쓴다.
// three.js ShaderMaterial(GLSL3)로 쓴다 (행렬과 position, uv, instanceMatrix, instanceColor는 three.js가 선언한다).

in float aAlpha;

out vec2 vUv;
out vec3 vColor;
out float vAlpha;
out vec2 vWorld;

void main() {
  vUv = uv;
  vColor = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#endif
  vAlpha = aAlpha;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
