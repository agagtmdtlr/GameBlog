import type { Vec3 } from './math';

/**
 * 배경 우주의 별 하늘을 큐브맵 여섯 면의 캔버스로 그린다. 별은 모델이 아니라 텍스처 위의 점이다.
 * three.js를 쓰지 않고, 렌더러가 이 캔버스로 `CubeTexture`를 만든다.
 *
 * 면 순서와 좌표는 WebGL 큐브맵 규약(+X, -X, +Y, -Y, +Z, -Z)을 따른다.
 * 캔버스 위쪽 줄이 텍스처 t = 0이므로 `flipY = false`로 올린다.
 */
export const STARFIELD = {
  /** 면 한 변의 픽셀 수 */
  faceSize: 1024,
  starCount: 5000,
  /** 같은 별 하늘이 나오도록 고정한 난수 씨앗 */
  seed: 0x5eed,
  /** 화면 출력값(sRGB) 기준 바탕색 */
  background: [2, 3, 8] as const,
};

export interface Star {
  direction: Vec3;
  /** 0~1. 크기와 밝기를 함께 정한다. */
  magnitude: number;
  /** sRGB 0~255 */
  color: readonly [number, number, number];
}

/** 별 색 후보. 대부분 흰색이고 일부가 푸르거나 노랗다. */
const STAR_TINTS: readonly (readonly [number, number, number])[] = [
  [255, 255, 255],
  [255, 255, 255],
  [255, 255, 255],
  [200, 220, 255],
  [170, 200, 255],
  [255, 240, 210],
  [255, 215, 170],
];

/** 면마다 [주축 성분, s축, t축]. 각 축은 [성분 번호, 부호]다. */
const FACE_AXES: readonly (readonly [readonly [number, number], readonly [number, number], readonly [number, number]])[] = [
  [[0, 1], [2, -1], [1, -1]], // +X
  [[0, -1], [2, 1], [1, -1]], // -X
  [[1, 1], [0, 1], [2, 1]], // +Y
  [[1, -1], [0, 1], [2, -1]], // -Y
  [[2, 1], [0, 1], [1, -1]], // +Z
  [[2, -1], [0, -1], [1, -1]], // -Z
];

/** 결과가 늘 같은 32비트 난수 (mulberry32) */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateStars(count: number, seed: number): Star[] {
  const random = createRandom(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    // 구 위에 고르게 퍼뜨린다.
    const z = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    // 거듭제곱으로 어두운 별을 많이, 밝은 별을 드물게 만든다.
    const magnitude = random() ** 6;
    const color = STAR_TINTS[Math.floor(random() * STAR_TINTS.length)];
    stars.push({ direction: [r * Math.cos(phi), r * Math.sin(phi), z], magnitude, color });
  }
  return stars;
}

/**
 * 방향을 `face` 면의 평면에 투영한 텍스처 좌표(0~1 밖일 수 있다)와 그 지점의 확대율을 반환한다.
 * 방향이 그 면 쪽을 향하지 않으면 `null`이다. 이웃 면의 평면으로 이어서 투영하므로
 * 모서리 근처 별을 양쪽 면에 그리면 이음매에서 끊기지 않는다.
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

/** 큐브맵 여섯 면을 그린 캔버스. 브라우저에서만 호출한다. */
export function drawStarfieldFaces(): HTMLCanvasElement[] {
  const { faceSize: size, starCount, seed, background } = STARFIELD;
  const stars = generateStars(starCount, seed);
  const faces: HTMLCanvasElement[] = [];
  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('별 하늘을 그릴 2D 캔버스를 만들 수 없습니다.');
    ctx.fillStyle = `rgb(${background.join(',')})`;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    for (const star of stars) drawStar(ctx, star, face, size);
    faces.push(canvas);
  }
  return faces;
}

function drawStar(ctx: CanvasRenderingContext2D, star: Star, face: number, size: number): void {
  const p = projectToFace(star.direction, face);
  if (!p) return;
  // 텍스처 한 칸 기준 반지름. 작은 별도 사라지지 않게 최소값을 둔다.
  const radius = (0.6 + star.magnitude * 1.2) * p.scale;
  // 밝은 별만 은은한 번짐을 둔다. 크게 번지면 별보다 성운처럼 보인다.
  const glow = radius * (1.6 + star.magnitude * 2.4);
  const x = p.s * size;
  const y = p.t * size;
  if (x < -glow || y < -glow || x > size + glow || y > size + glow) return;

  const [r, g, b] = star.color;
  const alpha = 0.3 + star.magnitude * 0.7;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, glow);
  gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
  gradient.addColorStop(radius / glow / 2, `rgba(${r},${g},${b},${alpha * 0.8})`);
  gradient.addColorStop(radius / glow, `rgba(${r},${g},${b},${alpha * 0.15 * star.magnitude})`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - glow, y - glow, glow * 2, glow * 2);
}
