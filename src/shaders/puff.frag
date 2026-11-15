precision highp float;

// 가장자리가 부드러운 둥근 덩어리. 연기(uSmoke = 1)와 빛 번짐(uSmoke = 0)에 함께 쓴다.
// 프레임 버퍼에는 sRGB 값이 들어 있으므로 색은 sRGB 출력값으로 준다.

in vec2 vUv;
/** x: 불투명도, y: 무늬 씨앗, z: 열기 */
in vec3 vParams;

uniform vec3 uColor;
uniform vec3 uHotColor;
uniform float uSmoke;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += valueNoise(p) * amplitude;
    p = p * 2.1 + 5.3;
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  float r = length(vUv);
  if (r >= 1.0) discard;

  float n = fbm(vUv * 1.8 + vParams.y * 41.0);
  float billow = smoothstep(1.0, 0.15, r + (n - 0.45) * 0.7);
  float halo = pow(1.0 - r, 2.0);
  float alpha = mix(halo, billow, uSmoke) * vParams.x;

  vec3 smoke = uColor * mix(0.7, 1.15, n);
  vec3 color = mix(uColor, mix(smoke, uHotColor, vParams.z * 0.7), uSmoke);
  fragColor = vec4(color, alpha);
}
