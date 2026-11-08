export interface ContextLossHandlers {
  onLost(): void;
  onRestored(): void;
}

/** WebGL2를 쓸 수 없으면 null을 반환한다. */
export function createContext(
  canvas: HTMLCanvasElement,
  handlers: ContextLossHandlers,
): WebGL2RenderingContext | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  canvas.addEventListener('webglcontextlost', (event) => {
    // 기본 동작을 막아야 브라우저가 컨텍스트를 복구해 준다.
    event.preventDefault();
    handlers.onLost();
  });
  canvas.addEventListener('webglcontextrestored', () => handlers.onRestored());
  return gl;
}
