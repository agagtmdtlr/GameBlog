# 플레이 기록 저장 분석

미니 게임의 플레이 기록을 이 기기의 브라우저에 오래 남기는 공용 기능(`src/lib/save/`)의 구조와 새 게임에 붙이는 방법을 정리한 문서다.

- **규칙:** [rules/world.md](../rules/world.md)의 "플레이 기록"
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** `feature/play-records` (2026-11-25, 커밋 `cd13d4c` 위에서 추가)
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline cd13d4c..HEAD -- src/lib/save src/games/*/records.ts
```

## 결정 (2026-11-25 사용자)

- 다시 와도 기록이 남고, 판마다 기록이 쌓여야 한다. 단순 수치와 복합 데이터(판 모양, 칠한 색 같은)를 함께 남긴다.
- Firebase 같은 서버 연동은 키 노출 같은 위험 때문에 보류했다. 기록은 이 기기의 브라우저(IndexedDB)에만 둔다. 그래서 브라우저 데이터를 지우면 기록도 사라지고, 다른 기기와 이어지지 않는다.
- 보류할 때까지 검토한 서버 방식: 익명 로그인 + Firestore(본인 경로만 쓰기, 판 기록은 추가만) + App Check + 도메인으로 제한한 API 키, 설정값은 GitHub Actions 변수로 빌드에 넣기. 다시 하게 되면 `RecordBook.record`가 쌓는 판 기록을 그대로 올리는 방식으로 붙일 수 있다.

## 구조

```
게임(index.ts) ── openRecordBook(spec) ── RecordBook ── SaveBackend
                                                         ├─ IndexedDB 'gameblog' (오래 남음)
                                                         └─ 메모리 (IndexedDB를 쓸 수 없을 때, 이번 방문만)
```

| 파일 | 내용 |
|---|---|
| `backend.ts` | `SaveBackend`: IndexedDB 구현(`openIndexedDbBackend`)과 메모리 구현(`createMemoryBackend`) |
| `recordBook.ts` | `RecordSpec`(게임마다의 기록 모양), `RecordBook`(기록장), `openRecordBook`, 함께 쓰는 저장소(`sharedBackend`) |
| `check.ts` | 꺼낸 값 검사 도우미 (`isRecord`, `isFiniteNumber`, `isIntegerArray`) |
| `save.test.ts` | 두 저장소 모두에서 쌓기·누적·최근 순서·게임별 분리·하다 만 판·복사·거래 실패·버전, IndexedDB 다시 열기와 동시 쓰기 |

테스트는 개발용 의존성 `fake-indexeddb`로 IndexedDB를 흉내 낸다. 런타임 라이브러리는 더하지 않았다.

### IndexedDB `gameblog` (버전 1)

| 저장소 | 열쇠 | 값 |
|---|---|---|
| `stats` | 게임 id | `{ version, data }`: 누적 수치 |
| `progress` | 게임 id | `{ version, data }`: 하다 만 판 하나 |
| `plays` | 자동 번호 `id` (색인 `game`) | `{ id, game, version, startedAt, endedAt, data }`: 끝난 판 하나 |

- 판 기록 더하기와 누적 수치 고치기는 한 거래에서 한다(`addPlay`). 누적 계산이 실패하면 판 기록도 남지 않는다. 같은 저장소를 쓰는 거래는 만든 순서대로 처리돼서, 기다리지 않고 연달아 저장해도 순서가 지켜진다.
- 판 기록은 번호가 늘어나기만 해서, 색인을 뒤에서부터 읽으면 최근 판부터 나온다.
- 구조를 바꾸면 `DB_VERSION`을 올리고 `onupgradeneeded`에 옛 구조에서 옮기는 단계를 더한다.
- 처음 열 때 `navigator.storage.persist()`로 저장 공간이 모자라도 지우지 말아 달라고 부탁한다 (브라우저가 거절할 수 있다).
- 개발자 도구 → Application → IndexedDB → `gameblog`에서 값을 볼 수 있다.

### 형식 버전과 검사

- 값마다 게임의 `RecordSpec.version`을 붙인다. 모양을 바꾸면 버전을 올리고 `migrate(kind, version, data)`에 옛 모양을 옮기는 방법을 더한다.
- `migrate`는 버전이 같아도 불린다. 꺼낸 값의 모양을 검사해 쓸 수 없으면 `undefined`를 돌려준다. 그러면 누적 수치는 빈 값, 판 기록은 건너뜀, 하다 만 판은 없음이 된다.
- `migrate`가 없으면 같은 버전의 값만 쓴다.

## 게임에 붙이기

1. `src/games/<게임>/records.ts`에 누적 수치(`Stats`)·판 기록(`Play`)·하다 만 판(`Progress`) 모양과 `RecordSpec`(`game`, `version`, `emptyStats`, `accumulate`, `migrate`)을 만든다. DOM 없이 두고 테스트한다.
2. `index.ts`에서 `openRecordBook<Stats, Play, Progress>(spec)`를 열고, 끝난 판은 `record(play, { startedAt, endedAt })`, 하다 만 판은 `saveProgress`·`progress`·`clearProgress`로 다룬다.
3. 저장이 실패해도 놀이는 계속한다 (`catch`에서 `console.warn`만 한다).

## 지금 쓰는 게임

| 게임 | 누적 수치 | 판 기록 | 하다 만 판 |
|---|---|---|---|
| 2048 (`game2048/records.ts`) | 판 수, 끝까지 한 판 수, 이긴 판 수, 최고 점수, 최고 타일, 점수 합, 민 횟수 합 | 점수, 최고 타일, 민 횟수, 이김, 끝난 방식(`over`·`restart`), 끝난 판 | 판, 점수, 이김, 민 횟수, 시작 시각 |
| 뱀 (`snake/records.ts`) | 판 수, 판을 채운 수, 가장 많이 먹은 수, 가장 긴 길이, 먹은 수 합, 나아간 칸 합, 논 시간 합(초) | 먹은 수, 길이, 나아간 칸, 논 시간, 끝난 방식(`wall`·`self`·`full`·`restart`) | 없음 (실시간 놀이) |
| 타워 뱀 (`towerSnake/records.ts`) | 판 수, 가장 오래 버틴 시간, 가장 많은 처치, 가장 긴 길이, 처치 합, 논 시간 합(초), 먹은 상자 수 합(종류별) | 버틴 시간, 처치 수, 가장 긴 길이, 먹은 상자 수(종류별), 끝난 방식(`down`·`restart`), 끝난 몸의 타워 목록 | 없음 (실시간 놀이) |
| 룰렛 체스 (`chess/records.ts`, 형식 3) | 판 수, 이김·짐·비김, 가장 적은 내 수로 이긴 판, 내 수 합 | 결과(`win`·`loss`·`draw`·`restart`), 끝난 까닭(`checkmate` 등), 둔 수(UCI), 수마다 둔 사람(나·컴퓨터), 끝 판(FEN) | 둔 수, 수마다 둔 사람, 다음 사람, 시작 시각 |
| 색칠 놀이 (`coloring/records.ts`) | 판 수, 클리어 수, 누른 횟수 합, 가장 빠른 클리어(초), 논 시간 합(초) | 클리어 여부, 누른 횟수, 논 시간, 색 묶음, 조각마다의 색 번호 | 색 묶음, 조각마다의 색 번호, 누른 횟수, 논 시간, 시작 시각 |

자세한 때와 방식은 [game2048.md](game2048.md)의 "기록", [coloring.md](coloring.md)의 "기록", [snake.md](snake.md)의 "기록", [towerSnake.md](towerSnake.md)의 "기록", [chess.md](chess.md)의 "기록"에 있다. 쌓인 기록을 화면에 보여 주는 곳은 아직 없다 (2048·뱀의 왕관 점수와 타워 뱀의 왕관 시간만 누적 수치의 최고 값을 쓴다).

## 브라우저 확인 (2026-11-25, 개발 서버)

| 항목 | 결과 |
|---|---|
| 2048: `localStorage`에 옛 최고 점수 5000을 두고 열기 | 누적 수치 `best`가 5000이 되고 옛 열쇠가 지워짐, 왕관 점수 5000 |
| 2048: 네 번 밀고 새로 고침 | 같은 판·점수로 이어짐 |
| 2048: 처음부터 버튼 | `restart` 판 기록이 쌓이고 누적 수치가 고쳐짐 |
| 2048: 더 밀 수 없는 판 | `over` 판 기록, 하다 만 판이 지워짐 |
| 색칠: 10조각 칠하고 새로 고침 | 같은 색으로 이어지고 진행 막대 14% |
| 색칠: 모두 칠하기 | 클리어 판 기록(71조각의 색), 가장 빠른 클리어, 하다 만 판이 지워짐 |
| 콘솔 오류 | 없음 |

확인하지 않은 것: IndexedDB를 막은 브라우저(메모리 저장소로 바뀌는 것은 단위 테스트로만 확인), 저장 공간이 가득 찬 경우, 여러 탭에서 같은 게임을 함께 하는 경우(하다 만 판은 마지막에 저장한 탭의 것이 남는다).
