precision highp float;

// 구름 속 번쩍임. 가운데가 밝고 가장자리로 부드럽게 사라지며, 화면에 더한다(가산 혼합). 색은 화면 출력값(sRGB)이다.
// 하늘의 한 부분만 밝아져 번개가 어디서 쳤는지 보인다.

uniform vec3 uColor;
uniform float uFlash;

in vec2 vUv;

out vec4 fragColor;

const float GLOW = 0.5;

void main() {
  float r2 = dot(vUv, vUv);
  float falloff = max(exp(-r2 * 2.5) - exp(-2.5), 0.0);
  vec3 light = uColor * falloff * uFlash * GLOW;
  if (max(light.r, max(light.g, light.b)) < 0.002) discard;
  fragColor = vec4(light, 1.0);
}
