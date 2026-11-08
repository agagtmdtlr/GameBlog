import type { Vec3 } from '../engine/math';
import type { GraphicsContent } from './types';

export function createSphereColorContent(id: string, label: string, color: Vec3): GraphicsContent {
  return {
    id,
    label,
    activate: (ctx) => ctx.sphere.setColor(color),
    deactivate: () => {},
  };
}
