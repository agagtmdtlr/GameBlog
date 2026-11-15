import type { Vec3 } from '../engine/math';
import type { GraphicsContent } from './types';

/** 구가 달아올라 표면이 빛나고 연기를 뿜는 콘텐츠 */
export function createHeatSphereContent(id: string, label: string, color: Vec3): GraphicsContent {
  return {
    id,
    label,
    activate: (ctx) => {
      ctx.sphere.setColor(color);
      ctx.sphere.setHeated(true);
    },
    deactivate: (ctx) => ctx.sphere.setHeated(false),
  };
}
