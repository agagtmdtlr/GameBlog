/// <reference lib="webworker" />
/**
 * 컴퓨터 상대를 화면과 다른 스레드에서 돌린다. `{ fen, moves }`를 받아 고른 수를 UCI 글로 돌려준다.
 * 같은 형태 되풀이를 알도록 처음부터 둔 수(`moves`)를 다시 두어 판을 만든다.
 */
import { chooseMove } from './ai';
import { moveToUci, replay } from './rules';
import { AI_OPTIONS, type AiReply, type AiRequest } from './aiOptions';

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, moves } = event.data;
  const position = replay(moves);
  const result = position ? chooseMove(position, AI_OPTIONS) : null;
  const reply: AiReply = { id, move: result?.move ? moveToUci(result.move) : null };
  self.postMessage(reply);
};
