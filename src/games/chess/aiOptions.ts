import { chooseMove, type SearchOptions } from './ai';
import { moveToUci, replayRoulette, type RouletteLog } from './rules';

/**
 * 컴퓨터 세기: 룰렛까지 3단계를 0.8초 안에 보고(깊이 1은 늘 끝까지),
 * 최선과 15센티폰 안의 수에서 골라 판마다 다르게 둔다.
 */
export const AI_OPTIONS: SearchOptions = { maxDepth: 3, timeMs: 800, spread: 15 };

export interface AiRequest {
  readonly id: number;
  readonly log: RouletteLog;
}

export interface AiReply {
  readonly id: number;
  /** 고른 수 (UCI). 둘 수가 없으면 `null` */
  readonly move: string | null;
}

/** 판 기록에서 다음 차례인 편의 수를 고른다. 워커와, 워커를 쓸 수 없을 때의 화면 스레드가 함께 쓴다. */
export function chooseHere(log: RouletteLog): string | null {
  const position = replayRoulette(log);
  const result = position ? chooseMove(position, AI_OPTIONS) : null;
  return result?.move ? moveToUci(result.move) : null;
}
