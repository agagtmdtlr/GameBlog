// 노을 하늘. 안 칠하면 옅은 종이색 그라데이션, 칠하면 그 색으로 지평선은 밝고 따뜻하게, 위로 갈수록 짙어진다.
// 해 쪽(uSunDir)은 노을빛이 번진다. 칠할 때는 누른 방향(uOrigin)에서 하늘 전체로 색이 퍼진다.

uniform vec3 uNew;
uniform vec3 uPrev;
uniform vec3 uOrigin;
uniform float uStart;
uniform float uUnfilled;
uniform float uPainted;
uniform float uPrevPainted;

uniform float uTime;
uniform float uHint;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uPaper;
uniform vec3 uHintColor;

in vec3 vDirection;


const float SPREAD_SECONDS = 0.9;
const float PI = 3.14159265;

vec3 skyOf(vec3 color, float painted, vec3 dir) {
  float h = clamp(dir.y, 0.0, 1.0);
  float sun = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  vec3 paperSky = mix(uPaper, uPaper * vec3(0.9, 0.92, 0.97), smoothstep(0.0, 0.7, h));
  vec3 horizon = mix(color, vec3(1.0, 0.62, 0.35), 0.35) * 1.08;
  vec3 zenith = color * 0.38 + vec3(0.06, 0.04, 0.16);
  vec3 painting = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
  painting = mix(painting, uSunColor, sun * 0.55 * (1.0 - h));
  return mix(paperSky, painting, painted);
}

out vec4 fragColor;

void main() {
  vec3 dir = normalize(vDirection);
  float t = clamp((uTime - uStart) / SPREAD_SECONDS, 0.0, 1.0);
  float radius = (1.0 - pow(1.0 - t, 3.0)) * PI;
  float angle = acos(clamp(dot(dir, normalize(uOrigin)), -1.0, 1.0));
  float inside = 1.0 - smoothstep(radius - 0.03, radius, angle);
  vec3 color = mix(skyOf(uPrev, uPrevPainted, dir), skyOf(uNew, uPainted, dir), inside);
  if (uUnfilled > 0.5 && uHint > 0.0) {
    float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
    color = mix(color, uHintColor, uHint * pulse * 0.5);
  }
  fragColor = vec4(color, 1.0);
}
