// 하늘 구. 원점에 놓은 큰 구의 안쪽 면을 그린다.

out vec3 vDirection;

void main() {
  vDirection = normalize(position);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // 가장 먼 깊이에 그려 다른 물체를 가리지 않는다.
  gl_Position = clip.xyww;
}
