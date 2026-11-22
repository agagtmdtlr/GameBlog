import type { AtlasRect } from './billboard';

/** NPC 말풍선의 인사말. 아틀라스 `speechBubble` 그림의 프레임 순서다. */
export const GREETINGS = ['안녕!', '반가워!', '하이~', '어서 와!', '안녕하세요!'] as const;

/**
 * 말풍선 그림에서 꼬리 끝의 세로 위치 (칸 위가 0, 아래가 1).
 * 빌보드를 놓을 때 꼬리 끝이 머리 위에 오도록 가운데를 이만큼 올린다.
 */
export const SPEECH_BUBBLE_TAIL = 0.9;

const FONT_FAMILY = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif";

/**
 * 칸에 말풍선 하나를 그린다. 흰 둥근 사각형에 진한 테두리와 아래로 내민 꼬리, 가운데 인사말이다.
 * 색이 있는 그림이라 빌보드의 `color`는 [1, 1, 1]로 둔다.
 */
export function drawSpeechBubble(ctx: CanvasRenderingContext2D, { x, y, width, height }: AtlasRect, text: string): void {
  const line = width * 0.035;
  const left = x + width * 0.05;
  const right = x + width * 0.95;
  const top = y + height * 0.2;
  const bottom = y + height * 0.7;
  const radius = (bottom - top) * 0.42;
  const tailX = x + width * 0.5;
  const tailHalf = width * 0.08;
  const tailTip = y + height * SPEECH_BUBBLE_TAIL;

  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(right - radius, top);
  ctx.arcTo(right, top, right, top + radius, radius);
  ctx.lineTo(right, bottom - radius);
  ctx.arcTo(right, bottom, right - radius, bottom, radius);
  // 꼬리: 아래 변 가운데에서 조금 왼쪽으로 기울여 내민다.
  ctx.lineTo(tailX + tailHalf, bottom);
  ctx.lineTo(tailX - tailHalf * 0.6, tailTip);
  ctx.lineTo(tailX - tailHalf, bottom);
  ctx.lineTo(left + radius, bottom);
  ctx.arcTo(left, bottom, left, bottom - radius, radius);
  ctx.lineTo(left, top + radius);
  ctx.arcTo(left, top, left + radius, top, radius);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = '#1f2330';
  ctx.stroke();

  // 글자가 풍선 안쪽 폭에 들어가도록 크기를 줄인다.
  const maxWidth = (right - left) * 0.8;
  let size = (bottom - top) * 0.5;
  ctx.font = `800 ${size}px ${FONT_FAMILY}`;
  const measured = ctx.measureText(text).width;
  if (measured > maxWidth) {
    size *= maxWidth / measured;
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
  }
  ctx.fillStyle = '#1f2330';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tailX, (top + bottom) / 2 + size * 0.04);
}
