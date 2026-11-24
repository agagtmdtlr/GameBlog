import { createRandom, type GlyphMetrics, layoutRansomText, type Point, type RansomLayout, type RansomOptions } from './ransomLayout';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 캔버스 `measureText`로 글자의 잉크 상자를 잰다. */
export function canvasMeasure(ctx: Context2D) {
  return (char: string, font: string): GlyphMetrics => {
    ctx.font = font;
    const m = ctx.measureText(char);
    return {
      width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
    };
  };
}

function tracePolygon(ctx: Context2D, points: readonly Point[]): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

/**
 * 배치한 오림 글자를 `ctx`의 지금 좌표계 (0,0)~(layout.width, layout.height)에 그린다.
 * DOM 캔버스, 빌보드 그림(`BillboardImageDef.draw`), 텍스처용 캔버스 어디에나 쓸 수 있다.
 */
export function drawRansomLayout(ctx: Context2D, layout: RansomLayout): void {
  for (const piece of layout.pieces) {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rotation);

    // 찢긴 가장자리: 종이 속살이 드러난 흰 테두리와 붙인 그림자
    ctx.save();
    ctx.shadowColor = 'rgba(40, 25, 20, 0.28)';
    ctx.shadowBlur = piece.height * 0.06;
    ctx.shadowOffsetX = piece.height * 0.015;
    ctx.shadowOffsetY = piece.height * 0.03;
    tracePolygon(ctx, piece.torn);
    ctx.fillStyle = '#fbfaf6';
    ctx.fill();
    ctx.restore();

    // 색 면
    tracePolygon(ctx, piece.face);
    ctx.fillStyle = piece.paper;
    ctx.fill();

    ctx.save();
    ctx.clip();
    drawPaperGrain(ctx, piece.width, piece.height, piece.grain, piece.newsprint);
    ctx.restore();

    // 글자
    ctx.font = piece.font;
    ctx.fillStyle = piece.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(piece.char);
    ctx.fillText(piece.char, (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2, piece.baseline);
    ctx.restore();
  }
}

/** 종이 결: 옅은 얼룩 점, 신문지면 가는 글줄 무늬 */
function drawPaperGrain(ctx: Context2D, width: number, height: number, grain: number, newsprint: boolean): void {
  const random = createRandom(grain);
  const hw = width / 2;
  const hh = height / 2;
  if (newsprint) {
    ctx.fillStyle = 'rgba(30, 30, 30, 0.13)';
    const gap = Math.max(3, height * 0.07);
    for (let y = -hh + gap * random(); y < hh; y += gap) {
      // 단어 사이가 띄어진 글줄처럼 끊어 그린다.
      for (let x = -hw; x < hw; ) {
        const word = gap * (1 + random() * 3);
        ctx.fillRect(x, y, word, gap * 0.35);
        x += word + gap * (0.5 + random() * 0.6);
      }
    }
  }
  const dots = Math.round((width * height) / 260);
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.1)';
    const r = 0.4 + random() * 1.4;
    ctx.fillRect(-hw + random() * width, -hh + random() * height, r, r);
  }
}

export interface RansomCanvasOptions extends RansomOptions {
  /** 캔버스 픽셀 배율. 기본 `devicePixelRatio`(최대 2) */
  readonly pixelRatio?: number;
}

/**
 * 오림 글자 캔버스를 만든다. CSS 크기는 배치 크기(px)이고, 원하는 크기로 늘이거나 줄여 써도 된다.
 * 스크린 리더에는 `aria-label`로 글이 전해진다.
 */
export function createRansomCanvas(text: string, options: RansomCanvasOptions = {}): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const layout = layoutRansomText(text, canvasMeasure(ctx), options);
  const ratio = options.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.ceil(layout.width * ratio));
  canvas.height = Math.max(1, Math.ceil(layout.height * ratio));
  canvas.style.aspectRatio = `${layout.width} / ${layout.height}`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', layout.text.replace(/\n/g, ' '));
  canvas.className = 'ransom-text';
  ctx.scale(ratio, ratio);
  drawRansomLayout(ctx, layout);
  return canvas;
}
