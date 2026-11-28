precision highp float;

// 화면 앞의 빛 번짐. 가운데가 밝고 가장자리로 부드럽게 사라지며, 화면에 더한다(가산 혼합). 색은 화면 출력값(sRGB)이다.
// 안개 속에서도 조금 남아, 먼 화면이 뿌연 빛 덩어리로 보인다.

uniform vec2 uFogRange;

in vec2 vUv;
in float vStrength;
in float vDistance;
flat in vec3 vSignal;

out vec4 fragColor;

const float GLOW = 0.5;

void main() {
  float r2 = dot(vUv, vUv);
  float falloff = max(exp(-r2 * 3.2) - exp(-3.2), 0.0);
  float fog = uFogRange.y > uFogRange.x ? smoothstep(uFogRange.x, uFogRange.y, vDistance) : 0.0;
  vec3 glow = vSignal * falloff * vStrength * GLOW * (1.0 - 0.7 * fog);
  if (max(glow.r, max(glow.g, glow.b)) < 0.002) discard;
  fragColor = vec4(glow, 1.0);
}
