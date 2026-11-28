precision highp float;

// 빗줄기. 하늘빛보다 조금 밝은 반투명 선이고, 폭 가운데가 가장 진하다. 색은 이미 sRGB다.

uniform vec3 uColor;
uniform float uOpacity;

in float vAlpha;
in float vAcross;

out vec4 fragColor;

void main() {
  float alpha = uOpacity * vAlpha * (1.0 - vAcross * vAcross);
  if (alpha < 0.003) discard;
  fragColor = vec4(uColor, alpha);
}
