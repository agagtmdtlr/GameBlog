import type { Vec3 } from '../engine/math';
import type { GraphicsContent } from './types';

/** 행성 표면의 색을 바꾸는 콘텐츠 */
export function createPlanetColorContent(id: string, label: string, color: Vec3): GraphicsContent {
  return {
    id,
    label,
    activate: (ctx) => ctx.planet.setSurfaceColor(color),
    deactivate: () => {},
  };
}
