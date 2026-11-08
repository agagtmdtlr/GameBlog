#version 300 es

layout(location = 0) in vec3 aPosition;

uniform mat4 uModel;
uniform mat4 uLightViewProj;

void main() {
  gl_Position = uLightViewProj * uModel * vec4(aPosition, 1.0);
}
