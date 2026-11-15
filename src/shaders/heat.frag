precision highp float;

// 달아오른 구의 표면. 불투명한 구 위에 더하기 블렌딩으로 겹쳐 그린다.

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vObjectPos;

uniform vec3 uCameraPos;
uniform float uHeat;
uniform float uTime;

out vec4 fragColor;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += valueNoise(p) * amplitude;
    p = p * 2.03 + 11.7;
    amplitude *= 0.5;
  }
  return sum;
}

vec3 acesFilm(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);

  // 오브젝트 공간의 무늬라 구가 구르면 함께 돈다. 시간에 따라 천천히 일렁인다.
  vec3 p = normalize(vObjectPos) * 3.2;
  float n = fbm(p + vec3(0.0, uTime * 0.25, 0.0));
  n += 0.35 * fbm(p * 2.6 - vec3(uTime * 0.4));
  float veins = smoothstep(0.42, 0.78, n);

  float pulse = 0.88 + 0.12 * sin(uTime * 4.3);
  float glow = (0.04 + 0.5 * veins + 0.55 * rim) * pulse;
  vec3 ember = mix(vec3(1.0, 0.1, 0.015), vec3(1.0, 0.45, 0.08), clamp(veins * 0.7 + rim * 0.3, 0.0, 1.0));

  fragColor = vec4(linearToSrgb(acesFilm(ember * glow)), uHeat);
}
