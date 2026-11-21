import type { ContentRenderer } from './contentRenderer';

/**
 * 전용 그리기가 있는 콘텐츠의 렌더러 목록. 새 렌더러는 여기에 한 줄을 추가한다. 목록 순서가 그리는 순서다.
 * 행성 색 발판처럼 툰 그리기 목록만으로 표현되는 콘텐츠는 렌더러가 필요 없다.
 */
export function createContentRenderers(): ContentRenderer[] {
  return [];
}
