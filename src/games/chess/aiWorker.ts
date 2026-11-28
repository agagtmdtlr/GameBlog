/// <reference lib="webworker" />
/**
 * 컴퓨터 상대를 화면과 다른 스레드에서 돌린다. 판 기록(`RouletteLog`)을 받아 고른 수를 UCI 글로 돌려준다.
 * 같은 형태 되풀이와 되돌리기 금지를 알도록 처음부터 둔 수를 다시 두어 판을 만든다.
 */
import { chooseHere, type AiReply, type AiRequest } from './aiOptions';

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const reply: AiReply = { id: event.data.id, move: chooseHere(event.data.log) };
  self.postMessage(reply);
};
