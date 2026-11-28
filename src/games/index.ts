import { chessGame } from './chess';
import { coloringGame } from './coloring';
import { game2048 } from './game2048';
import { snakeGame } from './snake';
import type { GameDefinition } from './game';

/** 미니 게임 목록. 새 게임은 `games/<게임>/index.ts`에 `GameDefinition`을 만들고 여기에 더한다. */
export const GAMES: readonly GameDefinition[] = [coloringGame, game2048, snakeGame, chessGame];

/** `id`의 게임. 없으면 `null` */
export function findGame(id: string): GameDefinition | null {
  return GAMES.find((game) => game.id === id) ?? null;
}
