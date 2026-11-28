// 하늘 텔레비전이 함께 쓰는 식. 텔레비전 본체(skyTv.*)와 화면 앞 번짐(skyTvGlow.*)이 앞에 붙여 쓴다.
// SCREEN_CENTER(화면 유리 가운데, 텔레비전 좌표)와 SCREEN_HALF(유리의 반 폭·반 높이)는 skyTvLayer.ts가 이 앞에 붙인다.

vec3 rotate(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

// 위아래로 둥실거리는 높이. 크기가 클수록 느리다.
float tvBob(float time, float scale, float phase) {
  return sin(time * (0.9 / (0.6 + scale * 0.2)) + phase) * 0.35 * scale * 0.25;
}

float signalHash(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

// 텔레비전마다 송출되는 화면의 빛 (선형 RGB). 몇 초마다 장면이 바뀌어 색과 밝기가 달라지고,
// 장면이 바뀌는 순간 잠깐 꺼졌다 켜지며, 브라운관처럼 미세하게 깜빡인다. phase는 0~2π.
vec3 tvSignal(float time, float phase) {
  float k = time * (0.15 + 0.2 * signalHash(phase * 7.1)) + phase * 3.0;
  float id = floor(k);
  float f = fract(k);
  float h = signalHash(id * 1.37 + phase * 19.3);
  vec3 hue = h < 0.35 ? vec3(0.42, 0.6, 1.0)
    : h < 0.62 ? vec3(0.82, 0.88, 1.0)
    : h < 0.82 ? vec3(0.4, 0.95, 0.85)
    : vec3(1.0, 0.68, 0.42);
  float level = 0.4 + 0.6 * signalHash(id * 2.71 + phase * 5.3);
  float cut = smoothstep(0.0, 0.02, f) * smoothstep(1.0, 0.99, f);
  float flicker = 0.93 + 0.07 * sin(time * 47.0 + phase * 13.0) * sin(time * 11.0 + phase * 3.0);
  return hue * level * cut * flicker;
}
