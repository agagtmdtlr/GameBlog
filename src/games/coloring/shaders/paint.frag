// 칠할 수 있는 메시. 안 칠하면 종이색, 누르면 누른 자리(uOrigin, 메시 자체 좌표)에서 새 색이 둥글게 번진다.
// 빛은 두세 단계로 끊는 툰 음영이다. 빛나는 조각(해, 가로등 머리)은 음영 없이 칠한 색 그대로 밝다.

uniform vec3 uNew;
uniform vec3 uPrev;
uniform vec3 uOrigin;
uniform float uStart;
uniform float uReach;
uniform float uUnfilled;
uniform float uGlow;

uniform float uTime;
uniform float uHint;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uHintColor;

in vec3 vLocal;
in vec3 vNormal;


const float SPREAD_SECONDS = 0.5;

out vec4 fragColor;

void main() {
  float t = clamp((uTime - uStart) / SPREAD_SECONDS, 0.0, 1.0);
  float radius = (1.0 - pow(1.0 - t, 3.0)) * uReach;
  float d = distance(vLocal, uOrigin);
  float edge = max(uReach * 0.02, 0.02);
  float inside = 1.0 - smoothstep(radius - edge, radius, d);
  vec3 base = mix(uPrev, uNew, inside);
  // 번지는 물결 앞의 밝은 띠
  float rim = (1.0 - t) * smoothstep(radius - edge * 6.0, radius - edge, d) * inside;
  base = mix(base, vec3(1.0), rim * 0.5);

  // 납작한 띠(도로)는 양면으로 그리지만 법선은 늘 지오메트리가 정한 쪽(위)을 쓴다.
  vec3 n = normalize(vNormal);
  float ndl = dot(n, uLightDir);
  float shade = ndl > 0.3 ? 1.0 : (ndl > -0.1 ? 0.88 : 0.76);
  vec3 lit = base * shade * mix(vec3(1.0), uLightColor, 0.3);
  vec3 color = mix(lit, base * 1.08, uGlow);

  if (uUnfilled > 0.5 && uHint > 0.0) {
    float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
    color = mix(color, uHintColor, uHint * pulse * 0.7);
  }
  fragColor = vec4(color, 1.0);
}
