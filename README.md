# GameBlog

GameBlog는 three.js로 만든 3D 놀이 공간 블로그입니다. 글을 읽는 대신, 화면 속 콘텐츠를 직접 움직이고 눌러 보면서 즐기는 곳입니다.

**바로 가기:** <https://agagtmdtlr.github.io/GameBlog/>

## 메인 화면

사이트에 들어오면 만화책 한 페이지처럼 칸이 나뉜 메인 화면이 보입니다. 칸마다 콘텐츠가 하나씩 들어 있고, 마음에 드는 칸을 누르면 바로 그 콘텐츠를 플레이할 수 있습니다.

- **바로 플레이하는 콘텐츠:** 캐릭터를 움직여 돌아다니는 3D 공간도 있고, 가볍게 즐기는 미니 게임도 있습니다. 모두 브라우저에서 실시간으로 그려지며 키보드, 마우스, 터치로 조작합니다.
- **새 콘텐츠는 맨 앞에:** 가장 최근에 추가한 콘텐츠가 첫 칸에 놓입니다. 콘텐츠가 늘어나면 빈 칸이 하나씩 채워집니다.
- **메인으로 돌아가기:** 콘텐츠 안의 "메인으로" 버튼을 누르면 메인 화면으로 돌아옵니다. 3D 공간에서는 시작 화면이나 일시 정지 화면에 이 버튼이 있습니다.
- **기록 저장:** 미니 게임의 점수와 진행 중이던 판은 지금 쓰는 브라우저에 저장됩니다.

조작 방법은 콘텐츠마다 다릅니다. WebGL2를 지원하는 브라우저에서 열어 주세요.

## 기술 구성

| 항목 | 내용 |
|---|---|
| 렌더링 | [three.js](https://threejs.org/) 0.187 (WebGL2). 조명과 재질은 직접 작성한 GLSL 셰이더를 `RawShaderMaterial`로 적용합니다 |
| 언어와 도구 | TypeScript, Vite, Vitest |
| 배포 | `main`에 푸시하면 GitHub Actions가 테스트와 빌드를 거쳐 GitHub Pages에 올립니다 |

런타임 의존성은 `three` 하나뿐입니다.

## 시작하기

Node.js 24(배포 워크플로와 같은 버전)에서 확인했습니다.

```bash
npm ci
```

```bash
npm run dev
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm test` | 단위 테스트 전부 (Vitest) |
| `npm run test:only <이름>` | 게임·콘텐츠 하나의 테스트만 (아래 "테스트" 참고) |
| `npm run build` | 타입 검사 후 `dist/`에 빌드 |
| `npm run preview` | 빌드 결과 미리 보기 |

주소에 아무것도 붙이지 않으면 메인 화면이 열립니다. 특정 콘텐츠를 바로 열고 싶다면 주소 뒤에 다음을 붙이세요.

- `?scene=<id>`: 3D 공간 (목록은 `src/content/index.ts`)
- `?game=<id>`: 미니 게임 (목록은 `src/games/index.ts`)

3D 공간에서는 브라우저 콘솔에 `window.__game`을 입력해 월드, 카메라, 입력, WebGL 컨텍스트를 살펴볼 수 있습니다.

메인 화면에 콘텐츠를 추가하려면 `src/home/contents.json`에 항목을 하나 추가하고, 미리 보기 그림을 `src/home/previews/`에 넣으면 됩니다. 자세한 방법은 [docs/analysis/home.md](docs/analysis/home.md)를 참고하세요.

### 테스트

게임과 콘텐츠는 서로 독립적으로 만들어지므로, 테스트도 폴더별로 나뉘어 있습니다. 고친 곳의 테스트만 돌리면 됩니다.

```bash
npm run test:only chess
```

| 이름 | 돌리는 테스트 |
|---|---|
| 게임 폴더 이름 (`chess`, `snake` 등) | `src/games/<이름>/`의 테스트 |
| 콘텐츠 폴더 이름 (`planet`, `meadow`) | `src/content/<이름>/`의 테스트 |
| `shared` | 여러 곳이 함께 쓰는 코드: `engine/`, `lib/`, `home/`, `content/common/` |

- 어떤 이름을 골라도 구조 규칙 테스트(`src/layers.test.ts`, 게임끼리 서로 가져다 쓰지 않는지 등)가 함께 돕니다.
- 이름은 여러 개를 줄 수 있습니다 (`npm run test:only snake game2048`). 이름 없이 실행하거나 없는 이름을 주면 쓸 수 있는 목록을 보여 줍니다.
- 게임 폴더를 새로 만들면 같은 이름의 테스트 묶음이 저절로 생깁니다.
- 여러 곳에 걸친 변경이나 테스트 설정을 바꿨을 때는 `npm test`로 전부 돌립니다. 배포 워크플로도 전부 돌립니다.

## 폴더 구조

```
src/
├─ main.ts        진입점: 주소에 따라 메인 화면, 3D 공간, 미니 게임 중 하나를 엽니다
├─ home/          메인 화면: 칸 배치, 칸에 넣을 콘텐츠 목록(contents.json), 미리 보기 그림
├─ engine/        코어 엔진: 게임 루프, 씬 정의, three.js 렌더러와 툰·빌보드 셰이더, 입력, 수학, 물리, 화면 안내
├─ content/       엔진 위에서 돌아가는 3D 공간(씬)
│  ├─ index.ts    씬 목록
│  ├─ common/     여러 씬이 함께 쓰는 캐릭터, NPC, 카메라
│  └─ <씬>/       씬별 월드, 오브젝트, 그래픽 등록, GLSL, 그림
├─ games/         엔진 없이 돌아가는 미니 게임
│  ├─ index.ts    게임 목록
│  └─ <게임>/     게임별 규칙, 화면, 그리기
└─ lib/           여러 콘텐츠가 함께 쓰는 코드: 플레이 기록 저장, 오려 붙인 글자 제목 등
docs/             구조 분석과 규칙 문서
```

메인 화면은 처음에 엔진이나 게임 코드를 받지 않고, 콘텐츠를 누를 때 필요한 코드만 불러옵니다. 엔진은 콘텐츠를 알지 못하며, 각 씬이 `Graphics`로 메시, 그림, 셰이더 층을 등록합니다. three.js는 `engine/render/`와 콘텐츠의 `graphics/`에서만 쓰고, 월드와 오브젝트 상태는 GPU나 DOM에 기대지 않으므로 브라우저 없이도 테스트할 수 있습니다. 자세한 구조는 [docs/analysis/architecture.md](docs/analysis/architecture.md)에 정리되어 있습니다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | 현재 구조, 기능, 테스트, 알려진 한계 |
| [docs/README.md](docs/README.md) | 기능별 규칙(`rules/`)과 구조 분석(`analysis/`) 색인 |
| [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) | 첫 버전의 계획과 결정 배경 |
| [CLAUDE.md](CLAUDE.md) | 작업 전 문서 확인 절차, 브랜치와 커밋 규칙 |

기능을 고치기 전에 `docs/README.md`에서 그 기능의 규칙과 분석 문서를 먼저 확인해 주세요.

## 작업 방식

여러 작업이 이 저장소를 함께 쓰기 때문에 `main`에서 직접 작업하지 않습니다. 자세한 절차는 [CLAUDE.md](CLAUDE.md)에 있습니다.

1. 최신 `main`에서 `feature/<주제>`, `fix/<주제>`, `docs/<주제>` 브랜치를 별도 worktree로 만듭니다.
2. 바꾼 파일만 골라서 커밋합니다.
3. 고친 곳의 테스트(`npm run test:only <이름>`, 여러 곳이면 `npm test`)와 `npm run build`를 통과시킨 뒤 `main`에 `--no-ff`로 병합하고 푸시합니다.
4. worktree와 작업 브랜치를 지웁니다.
