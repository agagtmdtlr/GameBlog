// 타워 사거리 원: 안은 아주 흐리게, 가장자리는 진한 띠. 색은 sRGB 값 그대로 낸다.

in vec2 vUv;
in vec3 vColor;
in float vAlpha;
in vec2 vWorld;

uniform float uHalf;

out vec4 fragColor;

void main() {
  // 판 밖(울타리 너머)에는 그리지 않는다.
  if (max(abs(vWorld.x), abs(vWorld.y)) > uHalf) discard;
  float r = length(vUv - 0.5) * 2.0;
  float aa = fwidth(r) * 1.5;
  float edge = smoothstep(0.94 - aa, 0.94, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  float fill = 0.12 * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  float alpha = vAlpha * max(fill, edge * 0.55);
  if (alpha < 0.003) discard;
  fragColor = vec4(vColor, alpha);
}
