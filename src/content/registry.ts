import type { Vec3 } from '../engine/math';
import { createSphereColorContent } from './sphereColor';
import type { ContentEntry } from './types';

export const DEFAULT_SPHERE_COLOR: Vec3 = [0.02, 0.022, 0.028];

function colorPlate(id: string, label: string, x: number, z: number, color: Vec3): ContentEntry {
  return { content: createSphereColorContent(id, label, color), plate: { x, z, color } };
}

/** 새 콘텐츠는 여기에 한 줄을 추가하면 월드에 발판이 생긴다. */
export const CONTENT_ENTRIES: readonly ContentEntry[] = [
  colorPlate('color-default', '기본색', 0, 2, DEFAULT_SPHERE_COLOR),
  colorPlate('color-coral', '코랄', -9, -5, [0.78, 0.05, 0.03]),
  colorPlate('color-amber', '앰버', -3, -7, [0.84, 0.3, 0.008]),
  colorPlate('color-teal', '틸', 3, -7, [0.004, 0.36, 0.3]),
  colorPlate('color-blue', '블루', 9, -5, [0.015, 0.08, 0.66]),
];

export const INITIAL_CONTENT_ID = 'color-default';
