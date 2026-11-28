import { chooseMove, type SearchOptions } from './ai';
import { moveToUci, replay } from './rules';

/** 컴퓨터 상대의 세기: 4반수까지, 0.7초 안에 보고, 최선과 15센티폰 안의 수에서 골라 판마다 다르게 둔다. */
export const AI_OPTIONS: SearchOptions = { maxDepth: 4, timeMs: 700, spread: 15 };

export interface AiRequest {
  readonly id: number;
  /** 처음부터 둔 수 (UCI) */
  readonly moves: readonly string[];
}

export interface AiReply {
  readonly id: number;
  /** 고른 수 (UCI). 둘 수가 없으면 `null` */
  readonly move: string | null;
}

/** 워커를 쓸 수 없을 때 화면 스레드에서 고른다. */
export function chooseHere(moves: readonly string[]): string | null {
  const position = replay(moves);
  const result = position ? chooseMove(position, AI_OPTIONS) : null;
  return result?.move ? moveToUci(result.move) : null;
}
