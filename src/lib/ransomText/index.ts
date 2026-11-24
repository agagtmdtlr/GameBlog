/**
 * 오림 글자: 종이를 찢어 오린 글자를 이어 붙인 제목. 영어만 지원한다.
 * 구조와 쓰는 법은 `docs/analysis/ransomText.md`에 있다.
 */
export { canvasMeasure, createRansomCanvas, drawRansomLayout, type RansomCanvasOptions } from './drawRansomText';
export {
  layoutRansomText,
  normalizeRansomText,
  RANSOM_CHARSET,
  type GlyphMetrics,
  type MeasureGlyph,
  type RansomLayout,
  type RansomOptions,
  type RansomPiece,
} from './ransomLayout';
