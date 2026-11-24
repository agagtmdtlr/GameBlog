import { showComicPage } from './home/comicPage';
import './style.css';

/**
 * 주소에 `?scene=<id>`가 있으면 엔진(`engine/`)을 만들고 콘텐츠(`content/`)의 그 씬을 올린다.
 * `?game=<id>`가 있으면 엔진 없이 미니 게임(`games/`)을 연다.
 * 둘 다 없으면 메인 페이지(코믹 프레임, `home/`)를 보여 준다. 메인 페이지는 엔진·씬·게임 코드를 내려받지 않는다.
 */
async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get('game');
  if (gameId !== null) {
    const { findGame } = await import('./games');
    const game = findGame(gameId);
    if (game) {
      document.documentElement.classList.add('is-game');
      const root = document.getElementById('play') as HTMLElement;
      root.hidden = false;
      game.start(root);
      return;
    }
  }
  const sceneId = params.get('scene');
  if (sceneId === null) {
    document.documentElement.classList.add('is-home');
    showComicPage(document.getElementById('home') as HTMLElement);
    return;
  }
  const [{ findScene }, { App }] = await Promise.all([import('./content'), import('./engine/app')]);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const app = App.create(canvas);
  if (!app) return;
  app.load(findScene(sceneId));
  app.start();
}

void main();
