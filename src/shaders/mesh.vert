// three.js의 RawShaderMaterial(GLSL3)로 쓴다. #version은 three.js가 붙인다.
// position, normal 속성과 modelMatrix, viewMatrix, projectionMatrix는 three.js가 채운다.

in vec3 position;
in vec3 normal;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 uNormalMatrix;
uniform mat4 uLightViewProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vObjectPos;
out vec3 vShadowCoord;

const float NORMAL_OFFSET = 0.03;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 worldNormal = normalize(uNormalMatrix * normal);

  vWorldPos = world.xyz;
  vNormal = worldNormal;
  vObjectPos = position;

  // 법선 방향으로 살짝 밀어 그림자 여드름(shadow acne)을 줄인다.
  vec4 lightClip = uLightViewProj * vec4(world.xyz + worldNormal * NORMAL_OFFSET, 1.0);
  vShadowCoord = lightClip.xyz / lightClip.w * 0.5 + 0.5;

  gl_Position = projectionMatrix * viewMatrix * world;
}
