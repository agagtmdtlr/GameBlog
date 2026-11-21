import type { Vec3 } from './math';
import { createRandom } from './starfield';

/**
 * 아주 먼 우주를 큐브맵 여섯 면의 캔버스로 그린다. 검은 바탕에 알록달록한 점, 네 갈래 반짝이,
 * 작은 오각별, 초승달을 납작한 색으로 흩뿌린다. 가까운 의인화 별(`starfield.ts`)과는 따로다.
 * three.js를 쓰지 않고, 렌더러가 이 캔버스로 `CubeTexture`를 만든다.
 *
 * 면 순서와 좌표는 WebGL 큐브맵 규약(+X, -X, +Y, -Y, +Z, -Z)을 따른다.
 * 캔버스 위쪽 줄이 텍스처 t = 0이므로 `flipY = false`로 올린다.
 */
export const SKYBOX = {
  /** 면 한 변의 픽셀 수 */
  faceSize: 1024,
  /** 같은 하늘이 나오도록 고정한 난수 씨앗 */
  seed: 0xc0105,
  /** 화면 출력값(sRGB) 기준 바탕색 */
  background: '#050608',
};

export type SkyShapeKind = 'dot' | 'sparkle' | 'star' | 'crescent';

/** 모양마다 개수와 면 가운데 기준 반지름(픽셀) 범위 */
export const SKY_SHAPES: Record<SkyShapeKind, { count: number; minRadius: number; maxRadius: number }> = {
  dot: { count: 3600, minRadius: 0.9, maxRadius: 2.4 },
  sparkle: { count: 150, minRadius: 5, maxRadius: 16 },
  star: { count: 110, minRadius: 3.5, maxRadius: 6.5 },
  crescent: { count: 24, minRadius: 5, maxRadius: 8 },
};

/** 점은 흰색이 절반쯤이고, 나머지는 분홍·빨강·파랑·노랑·초록·주황이다. */
const DOT_COLORS = [
  '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff',
  '#f27aa8', '#e8325a', '#5fb4ea', '#f5d33a', '#86cf6b', '#f07a3a', '#2f5fb0',
];
/** 반짝이는 조금 옅은 색이 섞인다. */
const SPARKLE_COLORS = ['#ffffff', '#f6e27a', '#f59ac0', '#5ec2ee', '#1fa89a', '#e8325a', '#c9d9a0', '#f4b6c8'];
const STAR_COLORS = ['#f5d33a', '#f5d33a', '#f07a3a', '#e8325a', '#5b6fe0', '#86cf6b', '#5fb4ea'];
const CRESCENT_COLORS = ['#f5a623', '#f07a3a', '#f5c04a'];

export interface SkyShape {
  kind: SkyShapeKind;
  direction: Vec3;
  /** 면 가운데 기준 반지름(픽셀) */
  radius: number;
  /** 면 안에서 돌린 각 (라디안) */
  rotation: number;
  color: string;
  /** 반짝이의 세로 길이 배율. 1보다 크면 위아래로 긴 반짝이다. */
  stretch: number;
}

/** 면마다 [주축 성분, s축, t축]. 각 축은 [성분 번호, 부호]다. */
const FACE_AXES: readonly (readonly [readonly [number, number], readonly [number, number], readonly [number, number]])[] = [
  [[0, 1], [2, -1], [1, -1]], // +X
  [[0, -1], [2, 1], [1, -1]], // -X
  [[1, 1], [0, 1], [2, 1]], // +Y
  [[1, -1], [0, 1], [2, -1]], // -Y
  [[2, 1], [0, 1], [1, -1]], // +Z
  [[2, -1], [0, -1], [1, -1]], // -Z
];

/**
 * 방향을 `face` 면의 평면에 투영한 텍스처 좌표(0~1 밖일 수 있다)와 그 지점의 확대율을 반환한다.
 * 방향이 그 면 쪽을 향하지 않으면 `null`이다. 이웃 면의 평면으로 이어서 투영하므로
 * 모서리 근처 모양을 양쪽 면에 그리면 이음매에서 끊기지 않는다.
 */
export function projectToFace(direction: Vec3, face: number): { s: number; t: number; scale: number } | null {
  const [major, sAxis, tAxis] = FACE_AXES[face];
  const ma = direction[major[0]] * major[1];
  if (ma <= 1e-6) return null;
  const sc = direction[sAxis[0]] * sAxis[1];
  const tc = direction[tAxis[0]] * tAxis[1];
  // 면 평면 위 점까지 거리. 모서리 쪽일수록 같은 각이 더 많은 픽셀을 차지한다.
  const distance = Math.hypot(1, sc / ma, tc / ma);
  return { s: (sc / ma + 1) / 2, t: (tc / ma + 1) / 2, scale: distance ** 1.5 };
}

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)];
}

/** 하늘 전체에 모양을 고르게 흩뿌린다. 같은 씨앗이면 같은 하늘이다. */
export function generateSkyShapes(seed = SKYBOX.seed): SkyShape[] {
  const random = createRandom(seed);
  const shapes: SkyShape[] = [];
  const colors: Record<SkyShapeKind, readonly string[]> = {
    dot: DOT_COLORS,
    sparkle: SPARKLE_COLORS,
    star: STAR_COLORS,
    crescent: CRESCENT_COLORS,
  };
  // 큰 모양이 점 위에 오도록 점부터 만든다.
  for (const kind of ['dot', 'crescent', 'star', 'sparkle'] as const) {
    const { count, minRadius, maxRadius } = SKY_SHAPES[kind];
    for (let i = 0; i < count; i++) {
      const z = random() * 2 - 1;
      const phi = random() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      // 작은 것이 많고 큰 것이 드물게 한다.
      const size = random() ** 2;
      const sparkleTall = kind === 'sparkle' && random() < 0.3;
      shapes.push({
        kind,
        direction: [r * Math.cos(phi), r * Math.sin(phi), z],
        radius: minRadius + size * (maxRadius - minRadius),
        // 반짝이는 대부분 똑바로 서고, 나머지 모양은 아무렇게나 돈다.
        rotation: kind === 'sparkle' ? (random() - 0.5) * 0.3 : random() * Math.PI * 2,
        color: pick(random, colors[kind]),
        stretch: sparkleTall ? 1.6 + random() * 0.8 : 1,
      });
    }
  }
  return shapes;
}

/** 큐브맵 여섯 면을 그린 캔버스. 브라우저에서만 호출한다. */
export function drawSkyboxFaces(): HTMLCanvasElement[] {
  const size = SKYBOX.faceSize;
  const shapes = generateSkyShapes();
  const faces: HTMLCanvasElement[] = [];
  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('우주 배경을 그릴 2D 캔버스를 만들 수 없습니다.');
    ctx.fillStyle = SKYBOX.background;
    ctx.fillRect(0, 0, size, size);
    for (const shape of shapes) drawShape(ctx, shape, face, size);
    faces.push(canvas);
  }
  return faces;
}

function drawShape(ctx: CanvasRenderingContext2D, shape: SkyShape, face: number, size: number): void {
  const p = projectToFace(shape.direction, face);
  if (!p) return;
  const radius = shape.radius * p.scale;
  const reach = radius * shape.stretch + 2;
  const x = p.s * size;
  const y = p.t * size;
  if (x < -reach || y < -reach || x > size + reach || y > size + reach) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(shape.rotation);
  ctx.fillStyle = shape.color;
  ctx.beginPath();
  switch (shape.kind) {
    case 'dot':
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      break;
    case 'sparkle':
      sparklePath(ctx, radius, shape.stretch);
      break;
    case 'star':
      starPath(ctx, radius);
      break;
    case 'crescent':
      // 큰 원에서 옮긴 원을 빼서 초승달을 만든다. 옮긴 원이 큰 원 밖으로 나간 부분이
      // 짝수-홀수 채우기로 칠해지지 않도록 큰 원으로 먼저 자른다.
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.moveTo(radius * 0.35 + radius * 0.85, -radius * 0.3);
      ctx.arc(radius * 0.35, -radius * 0.3, radius * 0.85, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.restore();
      return;
  }
  ctx.fill();
  ctx.restore();
}

/** 가운데가 오목한 네 갈래 반짝이. 세로는 `stretch`배 길다. */
function sparklePath(ctx: CanvasRenderingContext2D, radius: number, stretch: number): void {
  const w = radius;
  const h = radius * stretch;
  // 갈래 사이를 가운데 쪽으로 당겨 오목하게 만든다.
  const pinch = radius * 0.12;
  ctx.moveTo(0, -h);
  ctx.quadraticCurveTo(pinch, -pinch, w, 0);
  ctx.quadraticCurveTo(pinch, pinch, 0, h);
  ctx.quadraticCurveTo(-pinch, pinch, -w, 0);
  ctx.quadraticCurveTo(-pinch, -pinch, 0, -h);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, radius: number): void {
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
}
