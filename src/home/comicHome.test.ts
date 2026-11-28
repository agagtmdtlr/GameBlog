import { describe, expect, it } from 'vitest';
import { SCENES } from '../content';
import { GAMES } from '../games';
import { loadContents, loadCutContents, loadPageTitle, placeContents, targetLink, titleLineOptions, type CutContent } from './comicContents';
import { COMIC_LAYOUT, insetPolygon, isConvex, MIN_PAGE_ASPECT, naturalAspect, placeCuts, signedArea, type Point } from './comicLayout';
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

  it('세로로 긴 화면에 맞춰 종이를 늘이되, 컷 사이 여백 두께는 그대로다', () => {
    const natural = placeCuts(COMIC_LAYOUT);
    const tall = placeCuts(COMIC_LAYOUT, 0.47);
    expect(tall.width / tall.height).toBeCloseTo(0.47);
    expect(tall.header.height).toBeGreaterThan(natural.header.height);
    // 위 줄 a, b 사이 세로 여백은 늘여도 gutter 그대로
    const gap = (page: typeof natural) => {
      const [a, b] = page.cuts;
      return Math.min(...b.points.map((p) => p[0])) - Math.max(...a.points.map((p) => p[0]));
    };
    expect(gap(tall)).toBeCloseTo(gap(natural));
    // 가로 사이 여백(위 줄과 가운데 줄 사이)도 gutter 그대로
    const rowGap = (page: typeof natural) =>
      Math.min(...page.cuts[2].points.map((p) => p[1])) - Math.max(...page.cuts[0].points.map((p) => p[1]));
    expect(rowGap(tall)).toBeCloseTo(COMIC_LAYOUT.gutter);
    for (const cut of tall.cuts) expect(isConvex(cut.points), cut.id).toBe(true);
  });

  it('넓은 화면에서는 늘이지 않고, 너무 긴 화면에서는 한계까지만 늘인다', () => {
    expect(placeCuts(COMIC_LAYOUT, 2)).toEqual(placeCuts(COMIC_LAYOUT));
    const page = placeCuts(COMIC_LAYOUT, 0.2);
    expect(page.width / page.height).toBeCloseTo(MIN_PAGE_ASPECT);
    expect(naturalAspect(COMIC_LAYOUT)).toBeGreaterThan(MIN_PAGE_ASPECT);
  });
});

describe('컷 콘텐츠 (contents.json)', () => {
  const cutIds = COMIC_LAYOUT.cuts.map((cut) => cut.id);
  const contents = loadCutContents(contentsData, cutIds);

  it('콘텐츠가 컷 수보다 많지 않다', () => {
    expect(loadContents(contentsData).length).toBeLessThanOrEqual(cutIds.length);
  });

  it('최근에 더한 콘텐츠부터 컷 순서대로 놓는다 (같은 날이면 목록 뒤쪽이 먼저)', () => {
    const item = (title: string, added: string): CutContent => ({
      title,
      added,
      preview: { kind: 'image', file: 'a.png' },
      open: { kind: 'game', gameId: title },
    });
    const placed = placeContents([item('old', '2026-11-01'), item('new', '2026-11-20'), item('newer', '2026-11-20'), item('mid', '2026-11-10')], ['a', 'b', 'c']);
    expect([...placed].map(([id, content]) => `${id}:${content.title}`)).toEqual(['a:newer', 'b:new', 'c:mid']);
    // 지금 목록에서 가장 최근 콘텐츠가 첫 컷에 온다.
    const list = loadContents(contentsData);
    const newest = [...list].reverse().reduce((best, content) => (content.added > best.added ? content : best));
    expect(contents.get(cutIds[0])).toEqual(newest);
  });

  it('씬으로 들어가는 컷은 있는 씬을 가리키고, 미리 보기 파일이 previews/에 있다', () => {
    for (const [id, content] of contents) {
      if (content.open.kind === 'scene') expect(SCENES.map((s) => s.id), id).toContain(content.open.sceneId);
      if (content.open.kind === 'game') expect(GAMES.map((g) => g.id), id).toContain(content.open.gameId);
      if (content.preview.kind !== 'youtube') expect(PREVIEW_FILES, id).toContain(content.preview.file);
    }
  });

  it('누르면 갈 주소를 만든다', () => {
    expect(targetLink({ kind: 'scene', sceneId: 'planet' })).toEqual({ href: '?scene=planet', external: false });
    expect(targetLink({ kind: 'game', gameId: 'coloring' })).toEqual({ href: '?game=coloring', external: false });
    expect(targetLink({ kind: 'youtube', videoId: 'aqz-KE-bpKQ' })).toEqual({
      href: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      external: true,
    });
  });

  it('모양이 틀린 콘텐츠를 알린다', () => {
    const cut = { title: 't', added: '2026-11-28', preview: { image: 'a.png' }, open: { scene: 'planet' } };
    expect(() => loadContents({ contents: [cut] })).not.toThrow();
    expect(() => loadContents({ contents: [{ ...cut, title: '' }] })).toThrow('contents[0].title');
    expect(() => loadContents({ contents: [{ ...cut, added: '11/28' }] })).toThrow('contents[0].added');
    expect(() => loadContents({ cuts: { a: cut } })).toThrow('contents');
    expect(() => loadContents({ contents: [{ ...cut, preview: { image: 'a.png', youtube: 'x' } }] })).toThrow(
      'contents[0].preview',
    );
    expect(() => loadContents({ contents: [{ ...cut, preview: { youtube: 'short' } }] })).toThrow(
      'contents[0].preview.youtube',
    );
    expect(() => loadContents({ contents: [{ ...cut, open: { url: 'javascript:alert(1)' } }] })).toThrow(
      'contents[0].open.url',
    );
  });

  it('제목은 영어만 쓴다', () => {
    expect(loadPageTitle(contentsData)).toMatch(/\S/);
    expect(loadPageTitle({ title: "Hello, World!" })).toBe('Hello, World!');
    expect(() => loadPageTitle({ title: '게임 블로그' })).toThrow('contents.title');
    expect(() => loadPageTitle({})).toThrow('contents.title');
  });

  it('제목을 한 줄과 고르게 나눈 두 줄로 나눠 본다', () => {
    expect(titleLineOptions('Game Blog')).toEqual(['Game Blog', 'Game\nBlog']);
    expect(titleLineOptions('My Big Game Blog')).toEqual(['My Big Game Blog', 'My Big\nGame Blog']);
    expect(titleLineOptions('Games')).toEqual(['Games']);
    expect(titleLineOptions('A\nB C')).toEqual(['A\nB C']);
  });
});
