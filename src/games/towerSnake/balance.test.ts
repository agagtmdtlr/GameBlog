import { describe, expect, it } from 'vitest';
import { EXPERT, NEWCOMER, playGame, type BotResult, type BotSkill } from './bot';

/**
 * 수치 맞추기 (단계 7): 봇이 여러 판을 놀고 버틴 시간을 보인다. 오래 걸려서 `TOWER_SNAKE_BALANCE=1`일 때만 돈다.
 * 결과는 표준 출력에 나오므로 `--reporter=verbose`로 본다.
 *   PowerShell: $env:TOWER_SNAKE_BALANCE=1; npx vitest run --project towerSnake balance --reporter=verbose
 * `TOWER_SNAKE_SEEDS`(판 수, 기본 12), `TOWER_SNAKE_NEWCOMER_ONLY`(익숙한 봇 빼기)로 바꿀 수 있다.
 * 목표 (계획서 8): 처음 하는 사람(NEWCOMER)이 가운데 값으로 2~4분 버틴다.
 */
const env = import.meta.env;
const enabled = Boolean(env.TOWER_SNAKE_BALANCE);
const SEEDS = Number(env.TOWER_SNAKE_SEEDS ?? 12);

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const CAUSES = ['enemy', 'wall', 'self'] as const;

const summary = (name: string, results: BotResult[]) => {
  const seconds = results.map((r) => r.seconds);
  const losses = CAUSES.map((k) => results.reduce((n, r) => n + r.losses[k], 0)).join('·');
  return (
    `${name}: 가운데 ${median(seconds).toFixed(0)}초, 가장 짧게 ${Math.min(...seconds).toFixed(0)}초, 가장 길게 ${Math.max(...seconds).toFixed(0)}초, ` +
    `처치 가운데 ${median(results.map((r) => r.kills))}, 길이 가운데 ${median(results.map((r) => r.longest))}, ` +
    `끝까지 산 판 ${results.filter((r) => r.alive).length}/${results.length}, 잃은 까닭 적·울타리·제 몸 ${losses} | ` +
    seconds.map((s) => s.toFixed(0)).join(' ')
  );
};

const run = (skill: BotSkill) => Array.from({ length: SEEDS }, (_, i) => playGame(i + 1, skill));

describe.skipIf(!enabled)('타워 뱀 수치 맞추기 (봇)', () => {
  it('처음 하는 사람과 익숙한 사람이 버틴 시간', () => {
    const lines = [summary('처음', run(NEWCOMER))];
    if (!env.TOWER_SNAKE_NEWCOMER_ONLY) lines.push(summary('익숙', run(EXPERT)));
    console.log(lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  }, 900_000);
});
