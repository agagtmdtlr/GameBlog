# 월드 컨셉과 구조 규칙

행성 월드, 땅, 셰이더, 코드 구조를 바꿀 때 지키는 규칙이다.

- **관련 분석:** [analysis/threejs.md](../analysis/threejs.md)(렌더러와 셰이더), [analysis/terrain.md](../analysis/terrain.md)(땅)
- **색인:** [docs/README.md](../README.md)

## 컨셉

- 내용은 글이 아니라 그래픽과 플레이로만 전달한다. 글 게시물, 읽기 오버레이, 목록을 만들지 않는다.
- 화면의 글자는 시작·일시 정지 안내와 NPC 말풍선 정도로 제한한다.
- 렌더링은 three.js로 한다. 그 밖의 런타임 라이브러리는 추가하지 않는다. 사용 규칙은 [threejs.md](threejs.md)에 있다.
- 행성 표면에 칠한 원(작동 영역)으로 켜지는 그래픽스 콘텐츠 시스템, 콘텐츠 HUD, 콘텐츠 전용 렌더러 확장 구조(`engine/contentRenderers/`)는 등록된 콘텐츠가 없어 지웠다 (2026-11-22 사용자 결정). 참고 구현은 커밋 `ad4cee7`의 `src/content/`, `game/surfaceZone.ts`, `engine/contentRenderers/`에 있다 (당시 경로. 지금의 `src/content/`는 콘텐츠 계층이다).

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
- 위 가져오기 규칙은 `src/layers.test.ts`가 검사한다.

## 완료 조건

- `npm test`와 `npm run build`가 통과한다.
- 렌더링이 바뀌면 브라우저에서 바뀐 장면을 보고, WebGL과 콘솔 오류가 없는지 본다. 방법은 [analysis/threejs.md](../analysis/threejs.md)의 "브라우저 확인 방법"에 있다.
- 동작이나 구조가 바뀌면 같은 변경에서 해당 분석 문서와 [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md)를 고친다.
