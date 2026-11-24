import { describe, expect, it } from 'vitest';
import { SCENES } from '../content';
import { loadCutContents, loadPageTitle, targetLink } from './comicContents';
import { COMIC_LAYOUT, insetPolygon, isConvex, placeCuts, signedArea, type Point } from './comicLayout';
import contentsData from './contents.json';

const PREVIEW_FILES = Object.keys(import.meta.glob('./previews/*')).map((path) => path.slice('./previews/'.length));

describe('코믹 프레임 배치', () => {
  const { width, height } = COMIC_LAYOUT;

  it('컷 id가 겹치지 않는다', () => {
    const ids = COMIC_LAYOUT.cuts.map((cut) => cut.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('컷은 페이지 안의 볼록 다각형이다', () => {
    for (const cut of COMIC_LAYOUT.cuts) {
      expect(isConvex(cut.points), cut.id).toBe(true);
      for (const [x, y] of cut.points) {
        expect(x, cut.id).toBeGreaterThanOrEqual(0);
        expect(x, cut.id).toBeLessThanOrEqual(width);
        expect(y, cut.id).toBeGreaterThanOrEqual(0);
        expect(y, cut.id).toBeLessThanOrEqual(height);
      }
    }
  });

  it('컷들이 페이지를 빈틈없이 채운다', () => {
    const total = COMIC_LAYOUT.cuts.reduce((sum, cut) => sum + Math.abs(signedArea(cut.points)), 0);
    expect(total).toBeCloseTo(width * height, 6);
  });

  it('여백을 낸 컷은 원래 컷 안에 있고, 변마다 여백의 절반만큼 떨어진다', () => {
    const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(insetPolygon(square, 1).map(([x, y]) => [x, y])).toEqual([[1, 1], [9, 1], [9, 9], [1, 9]]);
    // 반대로 도는 다각형도 안쪽으로 줄인다
    const reversed = [...square].reverse();
    expect(Math.abs(signedArea(insetPolygon(reversed, 1)))).toBeCloseTo(64);
  });

  it('배치한 컷은 종이 안에 있고 넓이가 남아 있다', () => {
    const page = placeCuts(COMIC_LAYOUT);
    expect(page.width).toBe(width + COMIC_LAYOUT.margin * 2);
    expect(page.height).toBe(height + COMIC_LAYOUT.header + COMIC_LAYOUT.margin * 2);
    // 제목 띠는 컷 영역 위에 있다
    expect(page.header.y + page.header.height).toBeLessThanOrEqual(Math.min(...page.cuts.map((c) => c.box.y)));
    for (const cut of page.cuts) {
      expect(isConvex(cut.points), cut.id).toBe(true);
      expect(Math.abs(signedArea(cut.points)), cut.id).toBeGreaterThan(100);
      expect(cut.box.x, cut.id).toBeGreaterThanOrEqual(COMIC_LAYOUT.margin);
      expect(cut.box.y + cut.box.height, cut.id).toBeLessThanOrEqual(page.height - COMIC_LAYOUT.margin);
    }
  });
});

describe('컷 콘텐츠 (contents.json)', () => {
  const contents = loadCutContents(contentsData);

  it('모든 콘텐츠가 있는 컷을 가리킨다', () => {
    const ids = COMIC_LAYOUT.cuts.map((cut) => cut.id);
    for (const id of contents.keys()) expect(ids, id).toContain(id);
  });

  it('씬으로 들어가는 컷은 있는 씬을 가리키고, 미리 보기 파일이 previews/에 있다', () => {
    for (const [id, content] of contents) {
      if (content.open.kind === 'scene') expect(SCENES.map((s) => s.id), id).toContain(content.open.sceneId);
      if (content.preview.kind !== 'youtube') expect(PREVIEW_FILES, id).toContain(content.preview.file);
    }
  });

  it('누르면 갈 주소를 만든다', () => {
    expect(targetLink({ kind: 'scene', sceneId: 'planet' })).toEqual({ href: '?scene=planet', external: false });
    expect(targetLink({ kind: 'youtube', videoId: 'aqz-KE-bpKQ' })).toEqual({
      href: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      external: true,
    });
  });

  it('모양이 틀린 콘텐츠를 알린다', () => {
    const cut = { title: 't', preview: { image: 'a.png' }, open: { scene: 'planet' } };
    expect(() => loadCutContents({ cuts: { a: cut } })).not.toThrow();
    expect(() => loadCutContents({ cuts: { a: { ...cut, title: '' } } })).toThrow('cuts.a.title');
    expect(() => loadCutContents({ cuts: { a: { ...cut, preview: { image: 'a.png', youtube: 'x' } } } })).toThrow(
      'cuts.a.preview',
    );
    expect(() => loadCutContents({ cuts: { a: { ...cut, preview: { youtube: 'short' } } } })).toThrow(
      'cuts.a.preview.youtube',
    );
    expect(() => loadCutContents({ cuts: { a: { ...cut, open: { url: 'javascript:alert(1)' } } } })).toThrow(
      'cuts.a.open.url',
    );
  });

  it('제목은 영어만 쓴다', () => {
    expect(loadPageTitle(contentsData)).toMatch(/\S/);
    expect(loadPageTitle({ title: "Hello, World!" })).toBe('Hello, World!');
    expect(() => loadPageTitle({ title: '게임 블로그' })).toThrow('contents.title');
    expect(() => loadPageTitle({})).toThrow('contents.title');
  });
});
