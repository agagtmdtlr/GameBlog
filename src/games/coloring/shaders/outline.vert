// 선 그림 테두리: 뒷면만 그리는 껍데기를 화면에서 법선 쪽으로 uThickness 픽셀만큼 밀어낸다.
// 껍데기 지오메트리는 꼭짓점을 합쳐 부드러운 법선을 가진다 (모서리가 끊기지 않게).

uniform float uThickness;
uniform vec2 uResolution;

void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec3 viewNormal = normalize(normalMatrix * normal);
  vec2 dir = viewNormal.xy;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(0.0);
  clip.xy += dir * uThickness * 2.0 / uResolution * clip.w;
  gl_Position = clip;
}
