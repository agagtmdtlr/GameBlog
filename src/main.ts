import { showComicPage } from './home/comicPage';
import './style.css';

/**
 * 주소에 `?scene=<id>`가 있으면 엔진(`engine/`)을 만들고 콘텐츠(`content/`)의 그 씬을 올린다.
 * 없으면 메인 페이지(코믹 프레임, `home/`)를 보여 준다. 메인 페이지는 엔진과 씬 코드를 내려받지 않는다.
 */
async function main(): Promise<void> {
  const sceneId = new URLSearchParams(window.location.search).get('scene');
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
