import { atlasKey, BILLBOARD_IMAGES, type AtlasLayout, type AtlasRect, type BillboardImage } from './billboard';
import { drawSpeechBubble, GREETINGS } from './speechBubble';
import { drawStarFace, STAR_FACES } from './starfield';
import { signalArcOutline } from './signalArc';
import { sunRayPositions, sunRaysExtent } from './sunRays';

/**
 * 빌보드 그림을 모두 한 캔버스에 그린다. 브라우저에서만 호출한다.
 * 칸 밖(여백 포함)은 투명이다. 흰색으로 칠한 그림은 빌보드의 `color`가 색을 정한다.
 */
export function drawBillboardAtlas(layout: AtlasLayout): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('빌보드 아틀라스를 그릴 2D 캔버스를 만들 수 없습니다.');

  for (const image of Object.keys(BILLBOARD_IMAGES) as BillboardImage[]) {
    for (let frame = 0; frame < BILLBOARD_IMAGES[image].frames; frame++) {
      const rect = layout.rects.get(atlasKey(image, frame))!;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
      DRAW[image](ctx, rect, frame);
      ctx.restore();
    }
  }
  return canvas;
}

type Draw = (ctx: CanvasRenderingContext2D, rect: AtlasRect, frame: number) => void;

/** 파일에서 불러온 그림을 그 칸에 맞춰 그린다. 그림의 가로세로 비를 지키고 가운데에 둔다. */
export function drawImageIntoCell(canvas: HTMLCanvasElement, layout: AtlasLayout, image: BillboardImage, source: CanvasImageSource & { width: number; height: number }): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('빌보드 아틀라스의 2D 캔버스를 얻을 수 없습니다.');
  const rect = layout.rects.get(atlasKey(image))!;
  const fit = Math.min(rect.width / source.width, rect.height / source.height);
  const w = source.width * fit;
  const h = source.height * fit;
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  ctx.drawImage(source, rect.x + (rect.width - w) / 2, rect.y + (rect.height - h) / 2, w, h);
}

const DRAW: Record<BillboardImage, Draw> = {
  // 파일에서 불러와 `drawImageIntoCell`로 채운다. 그 전에는 비워 둔다.
  astronaut() {},

  signalArc(ctx, { x, y, width, height }, frame) {
    // 칸 절반을 1로 둔 좌표를 칸에 옮긴다. 캔버스는 y가 아래로 커지므로 뒤집는다.
    const outline = signalArcOutline(frame);
    ctx.beginPath();
    outline.forEach(([u, v], i) => {
      const px = x + ((u + 1) / 2) * width;
      const py = y + ((1 - v) / 2) * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  },

  starFace(ctx, rect, frame) {
    ctx.drawImage(drawStarFace(STAR_FACES[frame], rect.width), rect.x, rect.y, rect.width, rect.height);
  },

  speechBubble(ctx, rect, frame) {
    drawSpeechBubble(ctx, rect, GREETINGS[frame]);
  },

  disk(ctx, { x, y, width, height }) {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  },

  sunRays(ctx, { x, y, width, height }) {
    // 해 반지름 1 기준의 XY 평면을 칸에 옮긴다. 캔버스는 y가 아래로 커지므로 뒤집는다.
    const positions = sunRayPositions();
    const extent = sunRaysExtent(positions);
    const px = (u: number) => x + ((u / extent + 1) / 2) * width;
    const py = (v: number) => y + ((1 - v / extent) / 2) * height;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < positions.length; i += 9) {
      ctx.beginPath();
      ctx.moveTo(px(positions[i]), py(positions[i + 1]));
      ctx.lineTo(px(positions[i + 3]), py(positions[i + 4]));
      ctx.lineTo(px(positions[i + 6]), py(positions[i + 7]));
      ctx.closePath();
      ctx.fill();
    }
  },
};
