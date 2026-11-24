/**
 * SVG 그림을 정사각 픽셀로 그려 선의 진하기를 읽는다 (브라우저 전용).
 */

export interface InkImage {
  readonly size: number;
  /** 픽셀마다 선의 진하기 0~255 */
  readonly amount: Uint8Array;
  /** 진하기가 절반을 넘으면 1 (선) */
  readonly mask: Uint8Array;
}

export async function rasterizeSvg(svg: string, size: number): Promise<InkImage> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image(size, size);
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D 캔버스를 만들지 못했습니다');
    ctx.drawImage(image, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    const amount = new Uint8Array(size * size);
    const mask = new Uint8Array(size * size);
    for (let p = 0; p < amount.length; p++) {
      const i = p * 4;
      // 흰 면 위 검은 선: 불투명도 × 어두운 정도. 액자 바깥은 투명해서 0이다.
      const dark = 1 - (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 765;
      const value = Math.round(dark * pixels[i + 3]);
      amount[p] = value;
      mask[p] = value > 127 ? 1 : 0;
    }
    return { size, amount, mask };
  } finally {
    URL.revokeObjectURL(url);
  }
}
