# 월드 컨셉과 구조 규칙

행성 월드, 땅, 셰이더, 코드 구조를 바꿀 때 지키는 규칙이다.

- **관련 분석:** [analysis/threejs.md](../analysis/threejs.md)(렌더러와 셰이더), [analysis/terrain.md](../analysis/terrain.md)(땅)
- **색인:** [docs/README.md](../README.md)

## 컨셉

- 내용은 글이 아니라 그래픽과 플레이로만 전달한다. 글 게시물, 읽기 오버레이, 목록을 만들지 않는다.
- 화면의 글자는 시작·일시 정지 안내와 NPC 말풍선 정도로 제한한다.
- 첫 화면은 코믹 프레임 메인 페이지다. 컷마다 콘텐츠 미리 보기(그림·영상·YouTube 썸네일)를 보여 주고, 누르면 그 콘텐츠(이 사이트의 씬·미니 게임, YouTube, 외부 주소)로 간다. 컷은 따로 나눠 관리하고 콘텐츠를 넣고 뺄 수 있다 (2026-11-24 사용자 결정). 컷에 제목 글을 쓰지 않고 그림으로만 보여 준다. 코믹 프레임 위에는 오림 글자로 만든 영어 제목을 둔다 (2026-11-24 사용자 요청, [analysis/ransomText.md](../analysis/ransomText.md)). 구조는 [analysis/home.md](../analysis/home.md)에 있다.
- 색칠 놀이: 3D 장면을 자유 시점으로 돌아다니며 물체를 누르면 판마다 무작위로 뽑은 색이 채워지고, 모든 물체를 칠하면 클리어다. 색은 고르지 않는다 (2026-11-24 사용자 요청). 칠하는 단위는 메시 인스턴스 하나다. 장면은 도로를 달리는 차, 가로등, 인도를 걷는 사람, 노을 하늘, 해 질 녘 해가 있는 도시다 (2026-11-25 사용자 요청, 2D 선 그림을 대체). 구조는 [analysis/coloring.md](../analysis/coloring.md)에 있다.
- 2048: 4 × 4 판을 밀어 같은 숫자 타일을 합친다. 화면의 글은 타일·점수 숫자와 이기거나 끝났을 때의 오림 글자뿐이다 (2026-11-25 사용자 요청). 구조는 [analysis/game2048.md](../analysis/game2048.md)에 있다.
- 렌더링은 three.js로 한다. 그 밖의 런타임 라이브러리는 추가하지 않는다. 사용 규칙은 [threejs.md](threejs.md)에 있다.
- 행성 표면에 칠한 원(작동 영역)으로 켜지는 그래픽스 콘텐츠 시스템, 콘텐츠 HUD, 콘텐츠 전용 렌더러 확장 구조(`engine/contentRenderers/`)는 등록된 콘텐츠가 없어 지웠다 (2026-11-22 사용자 결정). 참고 구현은 커밋 `ad4cee7`의 `src/content/`, `game/surfaceZone.ts`, `engine/contentRenderers/`에 있다 (당시 경로. 지금의 `src/content/`는 콘텐츠 계층이다).

## 플레이 기록

- 다시 와도 기록이 남고 판마다 쌓인다. 단순 수치와 복합 데이터를 함께 남긴다 (2026-11-25 사용자 요청).
- 기록은 이 기기의 브라우저(IndexedDB)에만 둔다. Firebase 같은 서버 연동은 보류했다 (2026-11-25 사용자 결정). 서버, 키, 외부 저장소를 더하지 않는다.
- 미니 게임은 공용 기록장(`lib/save/`)으로 저장한다. 구조와 붙이는 방법은 [analysis/saveRecords.md](../analysis/saveRecords.md)에 있다.

## 행성 표면

- 행성 표면은 파스텔 색이 물결치는 몽환적인 땅이고, 완만한 언덕과 둥근 파스텔 지형물로 굴곡을 준다 (2026-11-22 사용자 결정, 흰색 무채색 고정을 대체). 구조는 [analysis/terrain.md](../analysis/terrain.md)에 있다.
- 선로, 표면 객체, 시작 지점 아래 땅은 평평하게(높이 0) 둔다. 테스트가 검사한다.
- 색은 선형 RGB로 다룬다.

## 구조

코드는 코어 엔진 계층(`src/engine/`)과 콘텐츠 계층(`src/content/`)으로 나눈다 (2026-11-24 사용자 결정, 여러 씬을 더하기 위해). 구조와 새 씬 추가 절차는 [analysis/architecture.md](../analysis/architecture.md)에 있다.

- `engine/`은 `content/`를 가져오지 않는다. 특정 씬의 메시, 그림, 셰이더, 정점 속성, 수치를 엔진에 넣지 않고, 콘텐츠가 `Graphics`(`engine/render/graphics.ts`)로 등록한다.
- `engine/`에 게임 규칙을 넣지 않는다. 엔진과 콘텐츠는 `engine/scene.ts`의 `SceneDefinition`·`SceneInstance`로만 만난다.
- 씬은 `content/<씬>/`에 둔다. 씬끼리는 서로 가져오지 않고, 여러 씬이 함께 쓰는 월드 오브젝트(캐릭터, 카메라)는 `content/common/`에 둔다. `content/common/`은 씬을 가져오지 않는다.
- 씬 안에서 three.js와 GLSL은 `graphics/`(와 `shaders/`)에만 둔다. `World`와 상태(`objects/`)·모양(`shapes/`) 코드는 GPU와 DOM에 의존하지 않는다.
- `Renderer`에 게임 상태를 두지 않는다. 값은 `FrameData`(`engine/frame.ts`)로 받는다.
- 메인 페이지(`src/home/`)는 `engine/`과 `content/`를 가져오지 않고 씬을 id로만 가리킨다. 씬은 주소 `?scene=<id>`로 연다.
- 행성 캐릭터 엔진의 틀(캐릭터 이동, 시작·일시 정지 화면)에 맞지 않는 놀이는 엔진을 거치지 않는 미니 게임(`src/games/<게임>/`)으로 둔다. 주소 `?game=<id>`로 열고, `main.ts`만 게임을 가져온다. 게임은 `engine/`, `content/`, `home/`, 다른 게임을 가져오지 않고, three.js는 게임의 `graphics/`에서만 쓴다 ([analysis/coloring.md](../analysis/coloring.md)).
- 여러 곳이 함께 쓰는 기능은 `src/lib/<기능>/`에 둔다. `lib/`은 `engine/`, `content/`, `home/`을 가져오지 않고, 누구나 `lib/`을 가져올 수 있다. 오림 글자(`lib/ransomText/`)는 영어만 지원한다 (2026-11-24 사용자 결정).
- 위 가져오기 규칙은 `src/layers.test.ts`가 검사한다.

## 완료 조건

- `npm test`와 `npm run build`가 통과한다.
- 렌더링이 바뀌면 브라우저에서 바뀐 장면을 보고, WebGL과 콘솔 오류가 없는지 본다. 방법은 [analysis/threejs.md](../analysis/threejs.md)의 "브라우저 확인 방법"에 있다.
- 동작이나 구조가 바뀌면 같은 변경에서 해당 분석 문서와 [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md)를 고친다.
