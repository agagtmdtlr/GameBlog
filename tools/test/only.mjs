// 고른 테스트 프로젝트만 돌린다: npm run test:only <이름> [이름...]
// 고른 프로젝트와 계층 규칙(layers)을 돌린다. 모르는 이름이면 목록을 보여 주고 실패한다.
import { spawnSync } from 'node:child_process';
import { projectNames } from './projects.mjs';

const known = projectNames();
const names = process.argv.slice(2);
const unknown = names.filter((name) => !known.includes(name));
if (names.length === 0 || unknown.length > 0) {
  if (unknown.length > 0) console.error(`모르는 테스트 프로젝트: ${unknown.join(', ')}`);
  console.error(`사용법: npm run test:only <이름> [이름...]\n이름: ${known.join(', ')}`);
  process.exit(1);
}
const args = ['run', ...[...names, 'layers'].flatMap((name) => ['--project', name])];
const result = spawnSync('vitest', args, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
