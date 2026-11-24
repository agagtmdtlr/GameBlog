import type { BillboardImageDef } from '../../../engine/render/billboard';
import { drawSpeechBubble, GREETINGS } from '../../common/character/speechBubble';
import { SIGNAL_ARC, signalArcOutline } from '../shapes/signalArc';
import { drawStarFace, STAR_FACES } from '../shapes/starfield';
import { sunRayPositions, sunRaysExtent } from '../shapes/sunRays';

/**
 * 행성 씬의 빌보드 그림. 렌더러가 한 장의 아틀라스에 모아 그린다 (`Graphics.setBillboardImages`).
 * 흰색으로 칠한 그림은 빌보드의 `color`가 색을 정한다.
 */
export type PlanetBillboardImage = 'sunRays' | 'astronaut' | 'starFace' | 'speechBubble' | 'disk' | 'signalArc';

/** 파일에서 불러와 칸에 그리는 그림 */
export const FILE_BILLBOARD_IMAGES = ['astronaut'] as const satisfies readonly PlanetBillboardImage[];

export const PLANET_BILLBOARD_IMAGES: Readonly<Record<PlanetBillboardImage, BillboardImageDef>> = {
  /** 화면에 크게 보일 수 있어 가장 크게 둔다. */
  sunRays: {
    size: 512,
    frames: 1,
    draw(ctx, { x, y, width, height }) {
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
  },
  /** 파일(`assets/astronaut-sticker.png`)에서 불러와 채운다. 원본 사진이 466×580이라 512칸이면 충분하다. */
  astronaut: {
    size: 512,
    frames: 1,
  },
  /** 별 얼굴마다 프레임이 있다. */
  starFace: {
    size: 256,
    frames: STAR_FACES.length,
    draw(ctx, rect, frame) {
      ctx.drawImage(drawStarFace(STAR_FACES[frame], rect.width), rect.x, rect.y, rect.width, rect.height);
    },
  },
  /** NPC 말풍선. 인사말마다 프레임이 있다. */
  speechBubble: {
    size: 256,
    frames: GREETINGS.length,
    draw(ctx, rect, frame) {
      drawSpeechBubble(ctx, rect, GREETINGS[frame]);
    },
  },
  /** 칸을 꽉 채운 흰 원. 해 눈에 쓴다. */
  disk: {
    size: 128,
    frames: 1,
    draw(ctx, { x, y, width, height }) {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    },
  },
  /** 인공위성 신호 물결 하나(흰 초승달 호). 퍼질수록 가늘어지는 프레임이 있다. */
  signalArc: {
    size: 256,
    frames: SIGNAL_ARC.frames,
    draw(ctx, { x, y, width, height }, frame) {
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
  },
};
