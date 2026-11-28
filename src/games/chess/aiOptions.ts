import { chooseMove, type SearchOptions } from './ai';
import { moveToUci, replayRoulette, type RouletteLog } from './rules';

/**
 * 컴퓨터 세기: 체크메이트가 있으면 바로 두고, 없으면 맡은 색으로 4반수까지 0.7초 안에 보며
 * 최선과 15센티폰 안의 수에서 골라 판마다 다르게 둔다.
 */
export const AI_OPTIONS: SearchOptions = { maxDepth: 4, timeMs: 700, spread: 15 };

export interface AiRequest {
  readonly id: number;
  readonly log: RouletteLog;
}

export interface AiReply {
  readonly id: number;
  /** 고른 수 (UCI). 둘 수가 없으면 `null` */
  readonly move: string | null;
}

/** 판 기록의 판에서 지금 차례인 색의 수를 고른다. 워커와, 워커를 쓸 수 없을 때의 화면 스레드가 함께 쓴다. */
export function chooseHere(log: RouletteLog): string | null {
  const position = replayRoulette(log);
  const result = position ? chooseMove(position, AI_OPTIONS) : null;
  return result?.move ? moveToUci(result.move) : null;
}
