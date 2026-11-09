import type { Vec3 } from '../engine/math';
import type { GraphicsContent } from './types';

/** 구 안에 물이 차오르며 투명해지는 콘텐츠 */
export function createWaterSphereContent(id: string, label: string, color: Vec3): GraphicsContent {
  return {
    id,
    label,
    activate: (ctx) => {
      ctx.sphere.setColor(color);
      ctx.sphere.setWaterFilled(true);
    },
    deactivate: (ctx) => ctx.sphere.setWaterFilled(false),
  };
}
