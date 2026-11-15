import type { Vec3 } from '../engine/math';
import { createHeatSphereContent } from './heatSphere';
import { createSphereColorContent } from './sphereColor';
import type { ContentEntry } from './types';
import { createWaterSphereContent } from './waterSphere';

export const DEFAULT_SPHERE_COLOR: Vec3 = [0.02, 0.022, 0.028];
const BLUE: Vec3 = [0.015, 0.08, 0.66];
const CORAL: Vec3 = [0.78, 0.05, 0.03];

function colorPlate(
  id: string,
  label: string,
  latitude: number,
  longitude: number,
  color: Vec3,
): ContentEntry {
  return {
    content: createSphereColorContent(id, label, color),
    plate: { latitude, longitude, color },
  };
}

/**
 * 새 콘텐츠는 여기에 한 줄을 추가하면 행성에 발판이 생긴다.
 * 숫자는 위도와 경도(도)다. 발판은 해가 드는 쪽에 둔다.
 */
export const CONTENT_ENTRIES: readonly ContentEntry[] = [
  colorPlate('color-default', '기본색', 70, 180, DEFAULT_SPHERE_COLOR),
  {
    content: createHeatSphereContent('color-coral', '코랄', CORAL),
    plate: { latitude: 35, longitude: 215, color: CORAL },
  },
  colorPlate('color-amber', '앰버', 30, 150, [0.84, 0.3, 0.008]),
  colorPlate('color-teal', '틸', -5, 115, [0.004, 0.36, 0.3]),
  {
    content: createWaterSphereContent('water-blue', '블루', BLUE),
    plate: { latitude: 35, longitude: 60, color: BLUE },
  },
];

export const INITIAL_CONTENT_ID = 'color-default';
