precision highp float;

// 번개 줄기의 빛. 심은 거의 흰빛이고 번짐은 푸른빛으로 퍼진다. 화면에 더한다(가산 혼합). 색은 화면 출력값(sRGB)이다.
// 번개는 안개 너머 멀리서 치므로 안개를 조금만 받는다.

uniform vec3 uColor;
uniform float uFlash;
uniform vec2 uFogRange;

in float vAcross;
in float vGlow;
in float vWeight;
in float vDistance;

out vec4 fragColor;

void main() {
  float edge = 1.0 - vAcross * vAcross;
  float core = edge * edge;
  float halo = edge * edge * edge * 0.22;
  float shape = mix(core, halo, vGlow);
  vec3 tint = mix(vec3(1.0), uColor, vGlow * 0.8 + 0.2);
  float fog = uFogRange.y > uFogRange.x ? smoothstep(uFogRange.x, uFogRange.y, vDistance) : 0.0;
  vec3 light = tint * shape * uFlash * mix(0.6, 1.0, vWeight) * (1.0 - 0.35 * fog);
  if (max(light.r, max(light.g, light.b)) < 0.002) discard;
  fragColor = vec4(light, 1.0);
}
