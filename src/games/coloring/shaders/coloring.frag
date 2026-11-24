precision highp float;
precision highp int;

// 색칠 그림. 픽셀마다 영역 번호(uLabels)로 영역의 색(uRegions)을 찾아 칠하고 그 위에 선(uInk)을 얹는다.
// 영역을 칠하면 누른 자리에서 둥글게 번지며 새 색이 퍼진다.
//
// uRegions: 가로는 영역 번호, 세로 세 줄
//   0: 새 색 rgb, 칠한 시각(초)
//   1: 이전 색 rgb, 번질 거리(픽셀)
//   2: 누른 자리 xy(픽셀), 안 칠했으면 1

uniform sampler2D uLabels;
uniform sampler2D uInk;
uniform sampler2D uRegions;
uniform vec2 uMapSize;
uniform float uTime;
uniform float uHint;
uniform vec3 uPaper;
uniform vec3 uInkColor;
uniform vec3 uHintColor;

in vec2 vUv;

out vec4 fragColor;

// 번지는 데 걸리는 시간 (초)
const float SPREAD_SECONDS = 0.45;

void main() {
  // 그림 픽셀은 위쪽 줄부터 올렸다.
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 pixel = uv * uMapSize;
  vec4 label = texelFetch(uLabels, ivec2(clamp(pixel, vec2(0.0), uMapSize - 1.0)), 0);
  int id = int(label.r * 255.0 + 0.5) + int(label.g * 255.0 + 0.5) * 256;

  vec3 color = uPaper;
  if (id > 0) {
    vec4 next = texelFetch(uRegions, ivec2(id, 0), 0);
    vec4 prev = texelFetch(uRegions, ivec2(id, 1), 0);
    vec4 info = texelFetch(uRegions, ivec2(id, 2), 0);
    float t = clamp((uTime - next.w) / SPREAD_SECONDS, 0.0, 1.0);
    float radius = (1.0 - pow(1.0 - t, 3.0)) * prev.w;
    float d = distance(pixel, info.xy);
    float edge = max(1.5, uMapSize.x * 0.002);
    float inside = 1.0 - smoothstep(radius - edge, radius, d);
    color = mix(prev.rgb, next.rgb, inside);
    // 번지는 물결 앞에 밝은 띠
    float rim = (1.0 - t) * smoothstep(radius - edge * 6.0, radius - edge, d) * inside;
    color = mix(color, vec3(1.0), rim * 0.55);
    // 오래 누르지 않으면 안 칠한 곳이 반짝인다.
    if (info.z > 0.5 && uHint > 0.0) {
      float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
      color = mix(color, uHintColor, uHint * pulse * 0.75);
    }
  }

  float ink = texture(uInk, uv).r;
  fragColor = vec4(mix(color, uInkColor, ink), 1.0);
}
