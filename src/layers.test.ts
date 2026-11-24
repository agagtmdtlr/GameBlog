import { describe, expect, it } from 'vitest';

/**
 * 계층 규칙 (`docs/rules/world.md`의 "구조"):
 * - `engine/`은 `content/`를 가져오지 않는다.
 * - three.js는 `engine/render/`, `engine/app.ts`, 콘텐츠의 `graphics/` 폴더와 `*Graphics.ts` 파일에서만 가져온다.
 * - 콘텐츠의 씬끼리는 서로 가져오지 않고, 함께 쓰는 것은 `content/common/`에 둔다.
 * - 메인 페이지(`home/`)는 엔진과 콘텐츠를 가져오지 않는다. 씬은 id로만 가리킨다.
 * - 여러 곳이 함께 쓰는 기능(`lib/`)은 엔진, 콘텐츠, 메인 페이지를 가져오지 않는다. 누구나 `lib/`을 가져올 수 있다.
 * - 미니 게임(`games/`)은 엔진, 콘텐츠, 메인 페이지를 가져오지 않고, `main.ts` 말고는 아무도 게임을 가져오지 않는다.
 *   게임끼리도 서로 가져오지 않는다. three.js는 게임의 `graphics/`에서만 가져온다.
 */
const SOURCES = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true });

const imports = (source: string): string[] =>
  [...source.matchAll(/(?:from\s+|import\s+|import\()['"]([^'"]+)['"]/g)].map((m) => m[1]);

/** `./a/b.ts`에서 상대 경로 `spec`을 `./`로 시작하는 경로로 푼다. */
function resolve(file: string, spec: string): string {
  const parts = file.split('/').slice(0, -1);
  for (const part of spec.split('?')[0].split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return parts.join('/');
}

const THREE_ALLOWED = (file: string) =>
  file.startsWith('./engine/render/') || file === './engine/app.ts' || /\/graphics\//.test(file) || /Graphics\.ts$/.test(file);

const sceneOf = (file: string) => /^\.\/content\/([^/]+)\//.exec(file)?.[1];
const gameOf = (file: string) => /^\.\/games\/([^/]+)\//.exec(file)?.[1];

describe('계층 규칙', () => {
  const files = Object.entries(SOURCES).filter(([file]) => !file.endsWith('.test.ts'));

  it('소스 파일을 모두 읽는다', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('엔진은 콘텐츠를 가져오지 않는다', () => {
    for (const [file, source] of files.filter(([f]) => f.startsWith('./engine/'))) {
      for (const spec of imports(source).filter((s) => s.startsWith('.'))) {
        expect(resolve(file, spec), `${file} → ${spec}`).not.toMatch(/^\.\/content\//);
      }
    }
  });

  it('three.js는 정해진 그래픽 파일에서만 가져온다', () => {
    for (const [file, source] of files) {
      if (imports(source).some((s) => s === 'three' || s.startsWith('three/'))) {
        expect(THREE_ALLOWED(file), file).toBe(true);
      }
    }
  });

  it('씬끼리는 서로 가져오지 않는다', () => {
    for (const [file, source] of files) {
      const own = sceneOf(file);
      if (!own || own === 'common') continue;
      for (const spec of imports(source).filter((s) => s.startsWith('.'))) {
        const target = sceneOf(resolve(file, spec));
        if (target) expect([own, 'common'], `${file} → ${spec}`).toContain(target);
      }
    }
  });

  it('공용 콘텐츠는 씬을 가져오지 않는다', () => {
    for (const [file, source] of files.filter(([f]) => sceneOf(f) === 'common')) {
      for (const spec of imports(source).filter((s) => s.startsWith('.'))) {
        const target = sceneOf(resolve(file, spec));
        if (target) expect(target, `${file} → ${spec}`).toBe('common');
      }
    }
  });

  it('메인 페이지는 엔진과 콘텐츠를 가져오지 않는다', () => {
    for (const [file, source] of files.filter(([f]) => f.startsWith('./home/'))) {
      for (const spec of imports(source).filter((s) => s.startsWith('.'))) {
        expect(resolve(file, spec), `${file} → ${spec}`).not.toMatch(/^\.\/(engine|content)\//);
      }
    }
  });

  it('공용 기능(lib/)은 엔진, 콘텐츠, 메인 페이지를 가져오지 않는다', () => {
    for (const [file, source] of files.filter(([f]) => f.startsWith('./lib/'))) {
      for (const spec of imports(source).filter((s) => s.startsWith('.'))) {
        expect(resolve(file, spec), `${file} → ${spec}`).not.toMatch(/^\.\/(engine|content|home)\//);
      }
    }
  });

  it('미니 게임은 엔진, 콘텐츠, 메인 페이지, 다른 게임을 가져오지 않는다', () => {
    for (const [file, source] of files.filter(([f]) => f.startsWith('./games/'))) {
      for (const spec of imports(source).filter((s) => s.startsWith('.'))) {
        const target = resolve(file, spec);
        expect(target, `${file} → ${spec}`).not.toMatch(/^\.\/(engine|content|home)\//);
        const own = gameOf(file);
        const other = gameOf(target);
        if (own && other) expect(other, `${file} → ${spec}`).toBe(own);
      }
    }
  });

  it('미니 게임은 main.ts만 가져온다', () => {
    for (const [file, source] of files.filter(([f]) => !f.startsWith('./games/') && f !== './main.ts')) {
      for (const spec of imports(source).filter((s) => s.startsWith('.'))) {
        expect(resolve(file, spec), `${file} → ${spec}`).not.toMatch(/^\.\/games(\/|$)/);
      }
    }
  });
});
