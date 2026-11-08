import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드해 GitHub Pages 저장소 이름과 무관하게 동작하게 한다.
  base: './',
  build: { target: 'es2022' },
});
