// 테스트 프로젝트 목록. vite.config.ts와 tools/test/only.mjs가 함께 쓴다.
import { readdirSync } from 'node:fs';

/** `src/<parent>/` 아래 폴더 이름들 */
const folders = (parent) =>
  readdirSync(new URL(`../../src/${parent}/`, import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

/**
 * 따로 돌릴 수 있는 게임·콘텐츠 폴더 (`src/games/<이름>/`, `src/content/<이름>/`).
 * `content/common/`은 여러 콘텐츠가 함께 써서 `shared`에 들어간다.
 */
export function contentFolders() {
  return {
    games: folders('games'),
    contents: folders('content').filter((name) => name !== 'common'),
  };
}

/** `test:only`로 고를 수 있는 프로젝트 이름. `layers`(계층 규칙)는 늘 함께 돈다. */
export function projectNames() {
  const { games, contents } = contentFolders();
  return [...games, ...contents, 'shared'];
}
