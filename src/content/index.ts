import type { SceneDefinition } from '../engine/scene';
import { meadowScene } from './meadow';
import { planetScene } from './planet';

/**
 * 콘텐츠 층이 내놓는 씬 목록. 새 씬은 `content/<씬>/index.ts`에 `SceneDefinition`을 만들고 여기에 더한다.
 * 주소에 `?scene=<id>`가 있으면 그 씬으로 시작한다 (없으면 메인 페이지, `src/home/`). 첫째는 id를 찾지 못했을 때 쓴다.
 */
export const SCENES: readonly SceneDefinition[] = [planetScene, meadowScene];

/** `id`의 씬. 없으면 기본 씬 */
export function findScene(id: string | null): SceneDefinition {
  return SCENES.find((scene) => scene.id === id) ?? SCENES[0];
}
