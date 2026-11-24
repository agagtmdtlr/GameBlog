import type { SceneDefinition } from '../engine/scene';
import { planetScene } from './planet';

/**
 * 콘텐츠 층이 내놓는 씬 목록. 새 씬은 `content/<씬>/index.ts`에 `SceneDefinition`을 만들고 여기에 더한다.
 * 첫째가 기본 씬이고, 주소에 `?scene=<id>`를 붙이면 다른 씬으로 시작한다.
 */
export const SCENES: readonly SceneDefinition[] = [planetScene];

/** `id`의 씬. 없으면 기본 씬 */
export function findScene(id: string | null): SceneDefinition {
  return SCENES.find((scene) => scene.id === id) ?? SCENES[0];
}
