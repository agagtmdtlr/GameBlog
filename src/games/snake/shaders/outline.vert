// 선 그림 테두리: 뒷면만 그리는 껍데기를 화면에서 법선 쪽으로 uThickness 픽셀만큼 밀어낸다.
// InstancedMesh면 조각마다의 행렬을 쓴다. 지오메트리는 부드러운 법선을 가져야 모서리가 끊기지 않는다.

uniform float uThickness;
uniform vec2 uResolution;

void main() {
  mat4 model = modelMatrix;
#ifdef USE_INSTANCING
  model = model * instanceMatrix;
#endif
  vec4 clip = projectionMatrix * viewMatrix * model * vec4(position, 1.0);
  vec3 viewNormal = normalize(mat3(viewMatrix) * mat3(model) * normal);
  vec2 dir = viewNormal.xy;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(0.0);
  clip.xy += dir * uThickness * 2.0 / uResolution * clip.w;
  gl_Position = clip;
}
