# GameBlog

작은 행성 위를 걸어 다니며 보는 3D 그래픽스 포트폴리오다. 사이트 전체가 하나의 플레이 공간이며, 내용은 글이 아니라 그래픽과 플레이 상호작용으로만 전달한다.

**공개 URL:** <https://agagtmdtlr.github.io/GameBlog/>

## 둘러볼 것

첫 화면은 코믹 프레임 메인 페이지다. 컷마다 콘텐츠 미리 보기가 있고, 누르면 그 콘텐츠(행성 씬, 미니 게임)로 간다. 씬의 시작·일시 정지 화면에서 "메인으로"를 누르면 돌아온다.

방문자는 구체 몸에 두 다리가 달린 노란 캐릭터가 되어 반지름 18의 작은 행성을 걷는다.

- **땅:** 파스텔 색이 물결치는 언덕과 둥근 지형물(언덕, 기둥, 공, 막대사탕)
- **표면:** YouTube 영상이 나오는 나무 상자 아날로그 텔레비전, 위성을 향해 선 달걀 모양 로켓, 시작 지점을 도는 선로와 기차
- **이웃:** 혼자 돌아다니는 NPC 5마리, 둥실 떠다니는 문어 외계인
- **하늘:** 캐릭터를 쳐다보는 눈이 달린 해, 충돌구가 패인 위성과 그 곁의 우주인 스티커, 태양 전지판을 펼친 인공위성, 행성을 감싼 비눗방울 띠, 얼굴이 있는 별들, 알록달록한 먼 우주
- **낮과 밤:** 해가 48초에 한 바퀴 행성을 돌아 그림자와 낮밤이 계속 바뀐다
- **그림:** 툰 셰이딩과 코믹스 하프톤 점

## 조작

| 입력 | 동작 |
|---|---|
| W A S D, 방향키 | 걷기 |
| 마우스 | 시점 회전 (포인터 잠금이 안 되면 왼쪽 버튼 드래그) |
| Esc | 일시 정지 |
| 터치, 화면 왼쪽 절반 | 가상 조이스틱으로 걷기 |
| 터치, 화면 오른쪽 절반 | 드래그로 시점 회전 |

WebGL2를 지원하는 브라우저가 필요하다.

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

개발 서버에서는 브라우저 콘솔에서 `window.__game`으로 월드, 카메라, 입력, WebGL 컨텍스트를 살펴볼 수 있다. 주소에 `?scene=<id>`를 붙이면 그 씬으로 시작하고, 붙이지 않으면 코믹 프레임 메인 페이지가 뜬다 (씬은 지금 `planet` 하나). 메인 페이지 컷에 콘텐츠를 넣는 방법은 [docs/analysis/home.md](docs/analysis/home.md)에 있다.

## 폴더 구조

```
src/
├─ main.ts        진입점: 엔진을 만들고 씬 하나를 올린다
├─ engine/        코어 엔진: 게임 루프, 씬 약속, three.js 렌더러와 툰·빌보드 셰이더, 입력, 수학, 물리, 화면 안내
└─ content/       콘텐츠
   ├─ index.ts    씬 목록
   ├─ common/     여러 씬이 쓰는 월드 오브젝트: 캐릭터, NPC, 카메라
   └─ planet/     행성 씬: 월드, 오브젝트, 모양, 그래픽 등록, GLSL, 장면 파일, 그림
tools/            Blender 캐릭터 스크립트, 스티커 생성 스크립트
docs/             구조 분석과 규칙 문서
```

엔진은 콘텐츠를 모르고, 씬은 `Graphics`로 메시·그림·셰이더 층을 등록한다. three.js는 `engine/render/`와 콘텐츠의 `graphics/`에서만 쓰고, 월드와 오브젝트 상태는 GPU와 DOM에 의존하지 않아 브라우저 없이 테스트할 수 있다. 자세한 구조는 [docs/analysis/architecture.md](docs/analysis/architecture.md)에 있다.

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
