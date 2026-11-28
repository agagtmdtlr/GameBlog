// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// 하늘 텔레비전 화면 앞의 빛 번짐. 화면 가운데 조금 앞에 카메라를 향한 사각형을 두고, 화면이 카메라를 볼수록 밝게 한다.
// 비 오는 뿌연 공기에 화면 빛이 퍼지는 느낌을 낸다. 인스턴스 속성은 텔레비전 본체와 같다.

in vec2 position; // 사각형 모서리 -1~1
in vec3 iPosition;
in vec4 iRotation;
in float iScale;
in float iPhase;

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCameraPos;
uniform float uTime;

out vec2 vUv;
out float vStrength;
out float vDistance;
flat out vec3 vSignal;

void main() {
  vec3 center = iPosition + rotate(iRotation, (SCREEN_CENTER + vec3(0.0, 0.0, 0.06)) * iScale)
    + vec3(0.0, tvBob(uTime, iScale, iPhase), 0.0);
  vec3 toCamera = normalize(uCameraPos - center);
  vec3 screenNormal = rotate(iRotation, vec3(0.0, 0.0, 1.0));
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCamera));
  vec3 up = cross(toCamera, right);
  float size = iScale * 1.5;
  vec3 world = center + (right * position.x + up * position.y * 0.85) * size;

  vUv = position;
  // 화면을 정면에서 볼수록 밝고, 옆에서는 약하게 남으며, 뒤에서는 보이지 않는다.
  vStrength = smoothstep(-0.15, 0.8, dot(screenNormal, toCamera));
  vDistance = length(uCameraPos - center);
  vSignal = tvSignal(uTime, iPhase);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
