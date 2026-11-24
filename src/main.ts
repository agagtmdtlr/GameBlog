import { findScene } from './content';
import { App } from './engine/app';
import './style.css';

/** 엔진(`engine/`)을 만들고 콘텐츠(`content/`)의 씬 하나를 올린다. */
function main(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const app = App.create(canvas);
  if (!app) return;
  app.load(findScene(new URLSearchParams(window.location.search).get('scene')));
  app.start();
}

main();
