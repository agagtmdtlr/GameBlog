// three.js ShaderMaterial(GLSL3)로 쓴다. 출력 fragColor는 직접 선언한다.
uniform vec3 uInk;

out vec4 fragColor;

void main() {
  fragColor = vec4(uInk, 1.0);
}
