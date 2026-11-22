precision highp float;

uniform sampler2D uAtlas;

in vec2 vUv;
in vec4 vColor;
in float vToneMap;

out vec4 fragColor;

// toon.frag와 같은 톤 매핑과 sRGB 변환. 톤 매핑을 켠 빌보드는 툰 발광색과 같은 색으로 보인다.
vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  // 아틀라스는 알파를 곱해 올린다(premultiplied). 거른 가장자리에 검은 테가 생기지 않는다.
  vec4 texel = texture(uAtlas, vUv);
  float alpha = texel.a * vColor.a;
  // 투명한 칸 가장자리가 깊이를 써서 뒤에 그릴 빌보드를 가리지 않게 버린다.
  if (alpha < 0.01) discard;
  // 색과 톤 매핑은 알파를 나눈 원래 색으로 계산한다.
  vec3 color = texel.rgb / texel.a * vColor.rgb;
  if (vToneMap > 0.5) color = acesFilm(color);
  fragColor = vec4(linearToSrgb(clamp(color, 0.0, 1.0)) * alpha, alpha);
}
