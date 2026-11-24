import { atlasKey, type AtlasLayout, type BillboardImage, type BillboardImageDef } from './billboard';

/**
 * 빌보드 그림을 모두 한 캔버스에 그린다. 브라우저에서만 호출한다.
 * 칸 밖(여백 포함)은 투명이다. 흰색으로 칠한 그림은 빌보드의 `color`가 색을 정한다.
 */
export function drawBillboardAtlas(layout: AtlasLayout, images: Readonly<Record<BillboardImage, BillboardImageDef>>): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('빌보드 아틀라스를 그릴 2D 캔버스를 만들 수 없습니다.');

  for (const [image, def] of Object.entries(images)) {
    if (!def.draw) continue;
    for (let frame = 0; frame < def.frames; frame++) {
      const rect = layout.rects.get(atlasKey(image, frame))!;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
      def.draw(ctx, rect, frame);
      ctx.restore();
    }
  }
  return canvas;
}

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
