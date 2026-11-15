import type { ContentRenderer } from './contentRenderer';
import { HeatSphereRenderer } from './heatSphere';
import { WaterSphereRenderer } from './waterSphere';

/**
 * 전용 그리기가 있는 콘텐츠의 렌더러 목록. 새 렌더러는 여기에 한 줄을 추가한다.
 * 구 색 발판처럼 PBR 그리기 목록만으로 표현되는 콘텐츠는 렌더러가 필요 없다.
 */
export function createContentRenderers(): ContentRenderer[] {
  // 연기는 물이 든 구가 복사한 장면에 섞이지 않도록 그 뒤에 그린다.
  return [new WaterSphereRenderer(), new HeatSphereRenderer()];
}
