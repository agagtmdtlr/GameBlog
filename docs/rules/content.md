# 콘텐츠와 셰이더 규칙

행성 표면의 작동 영역으로 켜지는 콘텐츠와 셰이더를 추가하거나 바꿀 때 지키는 규칙이다.

- **구조 분석:** [analysis/content.md](../analysis/content.md)
- **색인:** [docs/README.md](../README.md)

## 컨셉

- 내용은 글이 아니라 그래픽과 플레이로만 전달한다. 글 게시물, 읽기 오버레이, 목록을 만들지 않는다.
- 화면의 글자는 HUD의 짧은 콘텐츠 이름 정도로 제한한다.
- 렌더링은 three.js로 한다. 그 밖의 런타임 라이브러리는 추가하지 않는다. 사용 규칙은 [threejs.md](threejs.md)에 있다.

## 콘텐츠

- 콘텐츠는 `ContentContext`를 통해서만 월드를 바꾼다.
- 작동 영역은 콘텐츠의 내용을 몰라야 한다.
- 작동 영역은 버튼 모델 없이 행성 표면에 칠한 원으로만 보여 준다. 구가 원 안으로 들어오면 작동한다 (2026-11-17 사용자 결정).
- `id`는 전체에서 유일해야 한다.
- `activate`가 켠 효과는 `deactivate`에서 끈다. 행성 색은 예외로, 다음 콘텐츠가 덮어쓴다.
- 색은 선형 RGB로 다룬다.
- 영역 위치는 위도와 경도(도)로 정한다. 다른 영역, 시작 지점(위도 90)과의 표면 거리를 3.4보다 크게 둔다.
- 영역 수는 `MAX_SURFACE_ZONES`(8) 이하로 둔다. 테스트가 검사한다.
- 영역은 해가 드는 쪽에 둔다 (영역 방향과 광원 방향의 내적 > 0.25). 테스트가 검사한다.

## 구조

- `engine/`에 게임 규칙을 넣지 않는다.
- `World`와 `game/`의 상태 클래스는 GPU와 DOM에 의존하지 않는다.
- `Renderer`에 게임 상태를 두지 않는다. 값은 `FrameData`(`engine/frame.ts`)로 받는다.
- `Renderer`(`engine/renderer.ts`)에 특정 콘텐츠의 그리기를 넣지 않는다. 콘텐츠 전용 그리기는 `engine/contentRenderers/`에 콘텐츠마다 파일을 나누고, `ContentRenderer`를 상속해 메서드를 오버라이드한다 (2026-11-15 사용자 결정).
- `Renderer`는 `ContentRenderer`의 공통 메서드(`init`, `prepare`, `render`)만 호출한다. 콘텐츠 종류에 따라 분기하지 않는다.

## 완료 조건

- `npm test`와 `npm run build`가 통과한다.
- 렌더링이 바뀌면 브라우저에서 전환 중간, 완료, 다른 영역으로 복귀한 상태를 확인하고, WebGL과 콘솔 오류가 없는지 본다.
- 동작이나 구조가 바뀌면 같은 변경에서 [analysis/content.md](../analysis/content.md)와 [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md)를 고친다.
