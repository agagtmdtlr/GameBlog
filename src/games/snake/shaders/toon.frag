// 세 단계로 끊는 툰 음영과 위쪽 가장자리의 밝은 띠. 색은 sRGB 값 그대로 받아 그대로 낸다.
// uFade만큼 종이색 쪽으로 바랜다 (부딪혀 끝났을 때 뱀), uFlash만큼 흰빛으로 번쩍인다.

uniform vec3 uLightDir;
uniform vec3 uPaper;
uniform float uFade;
uniform float uFlash;

in vec3 vNormal;
in vec3 vColor;
in vec3 vView;

out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  float ndl = dot(n, uLightDir);
  float shade = ndl > 0.35 ? 1.0 : (ndl > -0.15 ? 0.86 : 0.72);
  vec3 color = vColor * shade;
  // 빛 쪽 가장자리에 얇은 밝은 띠
  float rim = 1.0 - max(dot(n, normalize(vView)), 0.0);
  color = mix(color, vec3(1.0), step(0.72, rim) * step(0.2, ndl) * 0.35);
  color = mix(color, mix(uPaper, vec3(dot(color, vec3(0.33))), 0.35), uFade);
  color = mix(color, vec3(1.0), uFlash);
  fragColor = vec4(color, 1.0);
}
