import { describe, expect, it } from 'vitest';
import { chooseMove, evaluate } from './ai';
import { CHESS_RECORDS, emptyChessStats, type ChessPlay } from './records';
import { BLACK, isPromotionChoice, moveToUci, parseSquare, Position, replay, replayRoulette, START_FEN } from './rules';

/** 깊이 `depth`까지 둘 수 있는 수의 끝 개수 (규칙 검사용 표준 값과 맞춘다) */
function perft(position: Position, depth: number): number {
  if (depth === 0) return 1;
  let count = 0;
  for (const move of position.legalMoves()) {
    position.make(move, false);
    count += perft(position, depth - 1);
    position.unmake();
  }
  return count;
}

const fixedRandom = () => 0;

describe('체스 규칙', () => {
  it('처음 판의 수 개수가 표준 값과 같다', () => {
    const position = new Position();
    expect(perft(position, 1)).toBe(20);
    expect(perft(position, 2)).toBe(400);
    expect(perft(position, 3)).toBe(8902);
    expect(position.fen()).toBe(START_FEN);
  });

  it('캐슬링·앙파상·승진이 섞인 판(Kiwipete)의 수 개수가 표준 값과 같다', () => {
    const position = new Position('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(position, 1)).toBe(48);
    expect(perft(position, 2)).toBe(2039);
  });

  it('앙파상과 승진 체크가 얽힌 판의 수 개수가 표준 값과 같다', () => {
    expect(perft(new Position('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 3)).toBe(2812);
    expect(perft(new Position('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), 2)).toBe(264);
  });

  it('수를 두고 무르면 처음 판으로 돌아온다', () => {
    const position = new Position('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const before = position.fen();
    for (const move of position.legalMoves()) {
      position.make(move);
      position.unmake();
      expect(position.fen()).toBe(before);
    }
  });

  it('바보의 체크메이트를 알아본다', () => {
    const position = replay(['f2f3', 'e7e5', 'g2g4', 'd8h4'])!;
    expect(position.status()).toBe('checkmate');
    expect(position.inCheck()).toBe(true);
  });

  it('스테일메이트와 기물 부족 무승부를 알아본다', () => {
    expect(new Position('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status()).toBe('stalemate');
    expect(new Position('8/8/4k3/8/8/2B5/4K3/8 w - - 0 1').status()).toBe('material');
    expect(new Position('8/8/4k3/8/8/2N5/4K3/8 w - - 0 1').status()).toBe('material');
    expect(new Position('8/8/4k3/8/8/2N5/4K1N1/8 w - - 0 1').status()).toBe('playing');
  });

  it('같은 형태가 세 번 나오면 무승부다', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    expect(replay(shuffle)!.status()).toBe('playing');
    expect(replay([...shuffle, ...shuffle])!.status()).toBe('repetition');
  });

  it('50수 동안 폰을 움직이지도 잡지도 않으면 무승부다', () => {
    expect(new Position('8/8/4k3/8/8/2R5/4K3/8 w - - 100 80').status()).toBe('fifty');
  });

  it('캐슬링하면 룩이 함께 움직이고 권리가 사라진다', () => {
    const position = new Position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const effect = position.make(position.findMove('e1g1')!);
    expect(effect.rook).toEqual({ from: parseSquare('h1'), to: parseSquare('f1') });
    expect(position.fen()).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
    // 공격받는 칸을 지나는 캐슬링은 안 된다.
    const attacked = new Position('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1');
    expect(attacked.findMove('e1g1')).toBeNull();
    expect(attacked.findMove('e1c1')).not.toBeNull();
  });

  it('앙파상으로 잡은 폰의 칸을 알려 준다', () => {
    const position = replay(['e2e4', 'a7a6', 'e4e5', 'd7d5'])!;
    const effect = position.make(position.findMove('e5d6')!);
    expect(effect.capturedAt).toBe(parseSquare('d5'));
    expect(position.board[parseSquare('d5')]).toBe(0);
  });

  it('승진은 네 기물 가운데 고른다', () => {
    const position = new Position('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const moves = position.legalMoves();
    expect(isPromotionChoice(moves, parseSquare('a7'), parseSquare('a8'))).toBe(true);
    expect(moves.filter((move) => move.promotion).map(moveToUci).sort()).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r']);
    expect(replay(['a2a4'])).not.toBeNull();
    expect(replay(['a2a5'])).toBeNull();
  });
});

describe('룰렛 체스 규칙', () => {
  it('기물은 방금 떠나온 칸으로 돌아갈 수 없다 (다른 수를 둔 뒤에도)', () => {
    const once = replayRoulette({ moves: ['g1f3'], movers: 'w', next: 'w' })!;
    expect(once.findAllowed('f3g1')).toBeNull();
    expect(once.findAllowed('f3e5')).not.toBeNull();
    const later = replayRoulette({ moves: ['g1f3', 'e7e5', 'e2e4'], movers: 'wbw', next: 'w' })!;
    expect(later.findAllowed('f3g1')).toBeNull();
    const moved = replayRoulette({ moves: ['g1f3', 'f3d4'], movers: 'ww', next: 'w' })!;
    expect(moved.findAllowed('d4f3')).toBeNull();
    expect(moved.findAllowed('d4b5')).not.toBeNull();
  });

  it('자기 킹을 공격받는 칸에 두는 수도 둘 수 있고, 그러면 상대가 킹을 잡을 수 있다', () => {
    const position = new Position('4k3/8/8/8/8/3q4/8/4K3 w - - 0 1');
    expect(position.legalMoves().map(moveToUci)).not.toContain('e1e2');
    position.make(position.findAllowed('e1e2')!);
    position.turn = BLACK;
    const capture = position.kingCapture();
    expect(capture).not.toBeNull();
    position.make(capture!);
    expect(position.rouletteStatus()).toBe('captured');
  });

  it('룰렛이 체크당한 편을 골랐는데 피할 수 없으면 체크메이트, 공격한 편을 고르면 킹을 잡을 수 있다', () => {
    const fools = { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], movers: 'wbwb' };
    expect(replayRoulette({ ...fools, next: 'w' })!.rouletteStatus()).toBe('checkmate');
    const again = replayRoulette({ ...fools, next: 'b' })!;
    expect(again.rouletteStatus()).toBe('playing');
    expect(moveToUci(again.kingCapture()!)).toBe('h4e1');
  });

  it('같은 편이 잇달아 두면 앙파상 칸은 자기 폰이 쓸 수 없다', () => {
    const position = replayRoulette({ moves: ['e2e4'], movers: 'w', next: 'w' })!;
    expect(position.findAllowed('d2e3')).toBeNull();
    expect(position.findAllowed('f2e3')).toBeNull();
  });

  it('판 기록이 틀리면 다시 두지 않는다', () => {
    expect(replayRoulette({ moves: ['e2e4'], movers: 'wb', next: 'w' })).toBeNull();
    expect(replayRoulette({ moves: ['e7e5'], movers: 'w', next: 'w' })).toBeNull();
    expect(replayRoulette({ moves: ['e7e5'], movers: 'b', next: 'w' })).not.toBeNull();
  });
});

describe('컴퓨터 상대 (룰렛 기댓값 탐색)', () => {
  it('상대 킹을 잡을 수 있으면 잡는다', () => {
    const position = new Position('4k3/8/8/8/8/8/8/4RK2 w - - 0 1');
    const result = chooseMove(position, { maxDepth: 2, timeMs: 5000, random: fixedRandom });
    expect(result.move && moveToUci(result.move)).toBe('e1e8');
  });

  it('다음에 누가 두든 이기는 수보다 지금 킹을 잡는 수를 둔다 (무작위로 고를 때도)', () => {
    const position = replayRoulette({ moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], movers: 'wbwb', next: 'b' })!;
    for (const random of [() => 0, () => 0.5, () => 0.99]) {
      const result = chooseMove(position, { maxDepth: 3, timeMs: 5000, spread: 15, random });
      expect(moveToUci(result.move!)).toBe('h4e1');
    }
  });

  it('공짜로 잡을 수 있는 퀸을 잡는다', () => {
    const position = new Position('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
    const result = chooseMove(position, { maxDepth: 2, timeMs: 5000, random: fixedRandom });
    expect(result.move && moveToUci(result.move)).toBe('e4d5');
  });

  it('피할 수 있으면 상대가 킹을 잡을 수 있는 자리에 킹을 두지 않는다', () => {
    const position = new Position('4k3/8/8/8/8/3q4/8/4K3 w - - 0 1');
    const result = chooseMove(position, { maxDepth: 2, timeMs: 5000, random: fixedRandom });
    const uci = result.move ? moveToUci(result.move) : '';
    position.make(result.move!);
    position.turn = BLACK;
    expect(position.kingCapture(), uci).toBeNull();
  });

  it('탐색한 뒤 판이 처음 모습으로 돌아온다 (시간이 다 돼 멈춰도)', () => {
    const position = new Position();
    chooseMove(position, { maxDepth: 2, timeMs: 5000, spread: 15, random: fixedRandom });
    expect(position.fen()).toBe(START_FEN);
    let tick = 0;
    const result = chooseMove(position, { maxDepth: 4, timeMs: 1, now: () => tick++ });
    expect(result.depth).toBe(1);
    expect(position.fen()).toBe(START_FEN);
    expect([...position.cameFrom].every((square) => square === -1)).toBe(true);
  });

  it('점수는 차례인 편 기준이다', () => {
    expect(evaluate(new Position())).toBe(0);
    const upQueen = new Position('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    expect(evaluate(upQueen)).toBeGreaterThan(800);
    upQueen.turn = -1;
    expect(evaluate(upQueen)).toBeLessThan(-800);
  });
});

describe('체스 기록', () => {
  const play = (result: ChessPlay['result'], moves: string[], movers: string): ChessPlay => ({
    result,
    reason: result === 'win' ? 'captured' : result === 'loss' ? 'checkmate' : result === 'draw' ? 'stalemate' : 'playing',
    moves,
    movers,
    fen: START_FEN,
  });
  const times = { startedAt: 0, endedAt: 1 };

  it('판을 쌓아 승·패·무와 가장 빠른 승리(내 수)를 센다', () => {
    let stats = emptyChessStats();
    stats = CHESS_RECORDS.accumulate(stats, play('win', ['e2e4', 'd1h5', 'h5e8'], 'www'), times);
    stats = CHESS_RECORDS.accumulate(stats, play('loss', ['f2f3', 'e7e5', 'g2g4', 'd8h4'], 'wbwb'), times);
    stats = CHESS_RECORDS.accumulate(stats, play('win', ['e2e4', 'e7e5', 'd7d5', 'd1h5'], 'wbbw'), times);
    stats = CHESS_RECORDS.accumulate(stats, play('draw', ['e2e4', 'e7e5'], 'wb'), times);
    expect(stats).toEqual({ plays: 4, wins: 2, losses: 1, draws: 1, fastestWin: 2, totalMoves: 3 + 2 + 2 + 1 });
  });

  it('저장된 값을 검사하고 형식 1을 옮긴다', () => {
    const migrate = CHESS_RECORDS.migrate!;
    expect(migrate('play', 2, play('win', ['e2e4'], 'w'))).toBeDefined();
    expect(migrate('play', 2, { ...play('win', ['e2e4'], 'w'), result: 'huh' })).toBeUndefined();
    expect(migrate('play', 2, play('win', ['e2e4'], 'wb'))).toBeUndefined();
    expect(migrate('play', 2, play('win', ['e2e9'], 'w'))).toBeUndefined();
    // 형식 1 판 기록은 번갈아 둔 것으로 옮긴다.
    const old = { result: 'win', reason: 'checkmate', moves: ['e2e4', 'e7e5', 'd1h5'], takebacks: 2, fen: START_FEN };
    expect(migrate('play', 1, old)).toEqual({ result: 'win', reason: 'checkmate', moves: old.moves, movers: 'wbw', fen: START_FEN });
    expect(migrate('stats', 1, { plays: 3, wins: 1, takebacks: 4 })).toEqual({ ...emptyChessStats(), plays: 3, wins: 1 });
    expect(migrate('progress', 1, { moves: ['e2e4'], takebacks: 0, startedAt: 5 })).toBeUndefined();
    // 형식 2 하다 만 판: 다시 둘 수 있고 끝나지 않은 판만
    expect(migrate('progress', 2, { moves: ['e2e4', 'g1f3'], movers: 'ww', next: 'b', startedAt: 5 })).toBeDefined();
    expect(migrate('progress', 2, { moves: ['e2e4'], movers: 'b', next: 'w', startedAt: 5 })).toBeUndefined();
    expect(migrate('progress', 2, { moves: [], movers: '', next: 'w', startedAt: 5 })).toBeUndefined();
    expect(
      migrate('progress', 2, { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], movers: 'wbwb', next: 'w', startedAt: 5 }),
    ).toBeUndefined();
    expect(migrate('stats', 1, { plays: -1 })).toBeUndefined();
    expect(migrate('stats', 3, emptyChessStats())).toBeUndefined();
  });
});
