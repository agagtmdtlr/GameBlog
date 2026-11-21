import type { Vec3 } from './math';

/**
 * 행성 둘레에 떠 있는 코믹한 별들. 별은 모델이 아니라 캔버스에 그린 얼굴 텍스처를
 * 늘 카메라를 보는 빌보드에 붙인 것이다. three.js를 쓰지 않고, 렌더러가 스프라이트를 만든다.
 */
export const STARFIELD = {
  count: 48,
  /** 행성 중심에서 별까지 거리 범위. 해 궤도(70)보다 바깥이다. */
  minDistance: 110,
  maxDistance: 200,
  /** 빌보드 한 변의 월드 크기 범위 */
  minSize: 9,
  maxSize: 20,
  /** 화면 위쪽 기준으로 기울이는 최대 각 (라디안) */
  maxTilt: 0.45,
  /** 같은 별자리가 나오도록 고정한 난수 씨앗 */
  seed: 0x5eed,
  /** 얼굴 텍스처 한 변의 픽셀 수 */
  textureSize: 256,
};

/** 얼굴 생김새. 눈 크기와 눈동자 방향만 다르다. */
export interface StarFace {
  /** 왼눈, 오른눈 크기 배율 */
  eyeScale: readonly [number, number];
  /** 눈동자가 쏠린 방향 (-1~1, 화면 x·y. y는 아래가 +) */
  look: readonly [number, number];
}

export const STAR_FACES: readonly StarFace[] = [
  { eyeScale: [1, 1.05], look: [0, 0.1] },
  { eyeScale: [1.1, 0.9], look: [-0.6, -0.2] },
  { eyeScale: [0.95, 1.15], look: [0.6, 0.3] },
  { eyeScale: [1.2, 1.2], look: [0, -0.6] },
];

export interface StarPlacement {
  position: Vec3;
  size: number;
  /** `STAR_FACES`의 번호 */
  face: number;
  /** 화면 안에서 기울인 각 (라디안) */
  tilt: number;
  /** 좌우로 뒤집어 그린다 */
  mirrored: boolean;
}

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

/** 행성 중심(원점) 둘레의 껍질 안에 별을 고르게 놓는다. */
export function placeStars(settings = STARFIELD): StarPlacement[] {
  const random = createRandom(settings.seed);
  const stars: StarPlacement[] = [];
  for (let i = 0; i < settings.count; i++) {
    const z = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const distance = settings.minDistance + random() * (settings.maxDistance - settings.minDistance);
    stars.push({
      position: [r * Math.cos(phi) * distance, r * Math.sin(phi) * distance, z * distance],
      size: settings.minSize + random() * (settings.maxSize - settings.minSize),
      face: Math.floor(random() * STAR_FACES.length),
      tilt: (random() * 2 - 1) * settings.maxTilt,
      mirrored: random() < 0.5,
    });
  }
  return stars;
}

/** 꼭짓점이 위를 향하는 오각별의 꼭짓점들. 바깥과 안쪽을 번갈아 둔다. */
export function starOutline(cx: number, cy: number, outer: number, inner: number): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? outer : inner;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

/** 노란 별에 흰 눈, 검은 눈동자, 빨간 세모 코를 그린 캔버스. 브라우저에서만 호출한다. */
export function drawStarFace(face: StarFace, size = STARFIELD.textureSize): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('별을 그릴 2D 캔버스를 만들 수 없습니다.');
  const u = size / 256;
  const cx = 128 * u;
  // 오각별의 무게중심은 바깥 원 중심보다 조금 아래라 원을 위로 올려 가운데에 맞춘다.
  const cy = 140 * u;

  ctx.beginPath();
  for (const [x, y] of starOutline(cx, cy, 118 * u, 48 * u)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = '#fff200';
  ctx.fill();
  // 꼭짓점을 조금 둥글게 한다.
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8 * u;
  ctx.strokeStyle = '#fff200';
  ctx.stroke();

  const eyes: [number, number][] = [[cx - 24 * u, cy - 28 * u], [cx + 26 * u, cy - 24 * u]];
  eyes.forEach(([x, y], i) => {
    const s = face.eyeScale[i];
    ctx.beginPath();
    ctx.ellipse(x, y, 16 * u * s, 25 * u * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + face.look[0] * 6 * u * s, y + face.look[1] * 11 * u * s, 7.5 * u * s, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
  });

  ctx.beginPath();
  ctx.moveTo(cx - 13 * u, cy + 12 * u);
  ctx.lineTo(cx + 13 * u, cy + 14 * u);
  ctx.lineTo(cx, cy + 34 * u);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2 * u;
  ctx.fillStyle = '#ee1c24';
  ctx.strokeStyle = '#ee1c24';
  ctx.fill();
  ctx.stroke();
  return canvas;
}
