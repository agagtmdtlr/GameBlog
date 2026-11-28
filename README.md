# GameBlog

three.js로 만든 3D 플레이 공간 형태의 블로그다. 글로 설명하는 대신, 방문자가 직접 움직이고 눌러 보며 체험하는 실시간 콘텐츠로 내용을 전달한다.

**공개 URL:** <https://agagtmdtlr.github.io/GameBlog/>

## 메인 화면

첫 화면은 만화책 한 쪽처럼 컷을 나눈 코믹 프레임 페이지다. 컷 하나하나가 콘텐츠의 입구이고, 컷에 보이는 미리 보기를 누르면 그 콘텐츠로 들어가 바로 플레이할 수 있다.

- **실시간 콘텐츠:** 캐릭터로 걸어 다니는 3D 씬과, 브라우저에서 바로 즐기는 미니 게임이 컷마다 들어 있다. 모두 실시간으로 렌더링되며 키보드·마우스·터치로 조작한다.
- **새 콘텐츠가 앞에:** 가장 최근에 더한 콘텐츠가 첫 컷에 오고, 콘텐츠가 늘어날수록 컷이 채워진다.
- **오가기:** 콘텐츠 안의 "메인으로" 버튼(씬은 시작·일시 정지 화면)을 누르면 메인 화면으로 돌아와 다른 콘텐츠를 고를 수 있다.
- **기록:** 미니 게임의 점수와 하다 만 판은 이 기기의 브라우저에 남는다.

조작은 콘텐츠마다 다르다. WebGL2를 지원하는 브라우저가 필요하다.

## 기술 구성

| 항목 | 내용 |
|---|---|
| 렌더링 | [three.js](https://threejs.org/) 0.187 (WebGL2). 조명과 재질은 직접 작성한 GLSL 셰이더를 `RawShaderMaterial`로 쓴다 |
| 언어와 도구 | TypeScript, Vite, Vitest |
| 모델과 그림 | 캐릭터 다리는 Blender 스크립트로, 우주인 스티커는 Python 스크립트로 만든다. 나머지 모양은 코드로 만든다 |
| 배포 | `main`에 푸시하면 GitHub Actions가 테스트와 빌드를 거쳐 GitHub Pages에 올린다 |

런타임 의존성은 `three` 하나다.

## 시작하기

Node.js 24(배포 워크플로와 같은 버전)에서 확인했다.

```bash
npm ci
```

```bash
npm run dev
```

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm test` | 단위 테스트 (Vitest) |
| `npm run build` | 타입 검사 후 `dist/`에 빌드 |
| `npm run preview` | 빌드 결과 미리 보기 |

주소에 아무것도 붙이지 않으면 메인 화면이 뜬다. `?scene=<id>`를 붙이면 그 3D 씬으로(씬 목록은 `src/content/index.ts`), `?game=<id>`를 붙이면 그 미니 게임으로(게임 목록은 `src/games/index.ts`) 바로 시작한다. 씬에서는 브라우저 콘솔의 `window.__game`으로 월드, 카메라, 입력, WebGL 컨텍스트를 살펴볼 수 있다.

메인 화면 컷에 콘텐츠를 넣는 방법은 [docs/analysis/home.md](docs/analysis/home.md)에 있다. `src/home/contents.json`에 한 줄을 더하고 미리 보기 그림을 `src/home/previews/`에 두면 된다.

## 폴더 구조

```
src/
├─ main.ts        진입점: 주소에 따라 메인 화면, 씬, 미니 게임 중 하나를 연다
├─ home/          메인 화면: 코믹 프레임 컷 배치, 컷 콘텐츠 목록(contents.json), 미리 보기 그림
├─ engine/        코어 엔진: 게임 루프, 씬 약속, three.js 렌더러와 툰·빌보드 셰이더, 입력, 수학, 물리, 화면 안내
├─ content/       엔진 위에서 도는 3D 씬
│  ├─ index.ts    씬 목록
│  ├─ common/     여러 씬이 쓰는 월드 오브젝트: 캐릭터, NPC, 카메라
│  └─ <씬>/       씬마다 월드, 오브젝트, 그래픽 등록, GLSL, 그림
├─ games/         엔진 없이 도는 미니 게임
│  ├─ index.ts    게임 목록
│  └─ <게임>/     게임마다 규칙, 화면, 그리기
└─ lib/           여러 콘텐츠가 함께 쓰는 코드: 플레이 기록 저장, 오림 글자 제목 등
tools/            Blender 캐릭터 스크립트, 스티커 생성 스크립트
docs/             구조 분석과 규칙 문서
```

메인 화면은 엔진·씬·게임 코드를 내려받지 않고, 콘텐츠를 누를 때 그 코드만 불러온다. 엔진은 콘텐츠를 모르고, 씬은 `Graphics`로 메시·그림·셰이더 층을 등록한다. three.js는 `engine/render/`와 콘텐츠의 `graphics/`에서만 쓰고, 월드와 오브젝트 상태는 GPU와 DOM에 의존하지 않아 브라우저 없이 테스트할 수 있다. 자세한 구조는 [docs/analysis/architecture.md](docs/analysis/architecture.md)에 있다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | 현재 구조, 기능, 테스트, 알려진 한계 |
| [docs/README.md](docs/README.md) | 기능별 규칙(`rules/`)과 구조 분석(`analysis/`) 색인 |
| [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) | 첫 버전의 계획과 결정 배경 |
| [CLAUDE.md](CLAUDE.md) | 작업 전 문서 확인 절차, 브랜치와 커밋 규칙 |

기능을 고치기 전에 `docs/README.md`에서 해당 기능의 규칙과 분석 문서를 먼저 찾는다.

## 작업 방식

여러 작업이 이 저장소를 함께 쓰므로 `main`에서 직접 작업하지 않는다. 자세한 절차는 [CLAUDE.md](CLAUDE.md)에 있다.

1. 최신 `main`에서 `feature/<주제>`, `fix/<주제>`, `docs/<주제>` 브랜치를 별도 worktree로 만든다.
2. 바꾼 파일만 경로로 골라 커밋한다.
3. `npm test`와 `npm run build`를 통과시킨 뒤 `main`에 `--no-ff`로 병합하고 푸시한다.
4. worktree와 작업 브랜치를 지운다.

## 에셋 다시 만들기

캐릭터 다리 모델(`src/content/common/character/character.glb`)은 Blender 스크립트가 원본이다. glb를 직접 고치지 않는다.

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python tools/blender/build_character.py
```

우주인 스티커(`src/content/planet/assets/astronaut-sticker.png`)는 원본 사진에서 Pillow와 NumPy로 만든다.

```bash
python -I tools/sticker/make_astronaut_sticker.py tools/sticker/astronaut-source.png src/content/planet/assets/astronaut-sticker.png preview.png
```
