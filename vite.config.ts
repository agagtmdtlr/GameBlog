import { defineConfig } from 'vitest/config';
import { contentFolders } from './tools/test/projects.mjs';

const { games, contents } = contentFolders();
const contentDirs = [...games.map((name) => `games/${name}`), ...contents.map((name) => `content/${name}`)];

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages 저장소 이름과 무관하게 동작하게 한다.
  base: './',
  build: { target: 'es2022' },
  test: {
    // 테스트 프로젝트 (docs/PROJECT_OVERVIEW.md의 "테스트"): 게임·콘텐츠 폴더마다 하나,
    // 함께 쓰는 코드(`shared`: engine, lib, home, content/common), 계층 규칙(`layers`).
    // `npm test`는 전부, `npm run test:only <이름>`은 그 프로젝트와 `layers`만 돌린다.
    projects: [
      ...contentDirs.map((dir) => ({
        extends: true as const,
        test: { name: dir.split('/')[1], include: [`src/${dir}/**/*.test.ts`] },
      })),
      {
        extends: true,
        test: {
          name: 'shared',
          include: ['src/**/*.test.ts'],
          exclude: ['src/layers.test.ts', ...contentDirs.map((dir) => `src/${dir}/**`)],
        },
      },
      { extends: true, test: { name: 'layers', include: ['src/layers.test.ts'] } },
    ],
  },
});
