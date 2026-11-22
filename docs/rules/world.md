# 월드 컨셉과 구조 규칙

행성 월드, 땅, 셰이더, 코드 구조를 바꿀 때 지키는 규칙이다.

- **관련 분석:** [analysis/threejs.md](../analysis/threejs.md)(렌더러와 셰이더), [analysis/terrain.md](../analysis/terrain.md)(땅)
- **색인:** [docs/README.md](../README.md)

## 컨셉

- 내용은 글이 아니라 그래픽과 플레이로만 전달한다. 글 게시물, 읽기 오버레이, 목록을 만들지 않는다.
- 화면의 글자는 시작·일시 정지 안내와 NPC 말풍선 정도로 제한한다.
- 렌더링은 three.js로 한다. 그 밖의 런타임 라이브러리는 추가하지 않는다. 사용 규칙은 [threejs.md](threejs.md)에 있다.
- 행성 표면에 칠한 원(작동 영역)으로 켜지는 그래픽스 콘텐츠 시스템, 콘텐츠 HUD, 콘텐츠 전용 렌더러 확장 구조(`engine/contentRenderers/`)는 등록된 콘텐츠가 없어 지웠다 (2026-11-22 사용자 결정). 참고 구현은 커밋 `ad4cee7`의 `src/content/`, `game/surfaceZone.ts`, `engine/contentRenderers/`에 있다.

## 행성 표면

- 행성 표면은 파스텔 색이 물결치는 몽환적인 땅이고, 완만한 언덕과 둥근 파스텔 지형물로 굴곡을 준다 (2026-11-22 사용자 결정, 흰색 무채색 고정을 대체). 구조는 [analysis/terrain.md](../analysis/terrain.md)에 있다.
- 선로, 표면 객체, 시작 지점 아래 땅은 평평하게(높이 0) 둔다. 테스트가 검사한다.
- 색은 선형 RGB로 다룬다.

## 구조

- `engine/`에 게임 규칙을 넣지 않는다.
- `World`와 `game/`의 상태 클래스는 GPU와 DOM에 의존하지 않는다.
- `Renderer`에 게임 상태를 두지 않는다. 값은 `FrameData`(`engine/frame.ts`)로 받는다.

## 완료 조건

- `npm test`와 `npm run build`가 통과한다.
- 렌더링이 바뀌면 브라우저에서 바뀐 장면을 보고, WebGL과 콘솔 오류가 없는지 본다. 방법은 [analysis/threejs.md](../analysis/threejs.md)의 "브라우저 확인 방법"에 있다.
- 동작이나 구조가 바뀌면 같은 변경에서 해당 분석 문서와 [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md)를 고친다.
