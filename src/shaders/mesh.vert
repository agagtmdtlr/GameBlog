#version 300 es

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uModel;
uniform mat3 uNormalMatrix;
uniform mat4 uViewProj;
uniform mat4 uLightViewProj;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vObjectPos;
out vec3 vShadowCoord;

const float NORMAL_OFFSET = 0.03;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vec3 normal = normalize(uNormalMatrix * aNormal);

  vWorldPos = world.xyz;
  vNormal = normal;
  vObjectPos = aPosition;

  // 법선 방향으로 살짝 밀어 그림자 여드름(shadow acne)을 줄인다.
  vec4 lightClip = uLightViewProj * vec4(world.xyz + normal * NORMAL_OFFSET, 1.0);
  vShadowCoord = lightClip.xyz / lightClip.w * 0.5 + 0.5;

  gl_Position = uViewProj * world;
}
