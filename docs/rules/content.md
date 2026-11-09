# 콘텐츠와 셰이더 규칙

발판(버튼)으로 켜지는 콘텐츠와 셰이더를 추가하거나 바꿀 때 지키는 규칙이다.

- **구조 분석:** [analysis/content.md](../analysis/content.md)
- **색인:** [docs/README.md](../README.md)

## 컨셉

- 내용은 글이 아니라 그래픽과 플레이로만 전달한다. 글 게시물, 읽기 오버레이, 목록을 만들지 않는다.
- 화면의 글자는 HUD의 짧은 콘텐츠 이름 정도로 제한한다.
- 런타임 라이브러리를 추가하지 않는다. 렌더링은 자체 WebGL2 엔진으로 한다.

## 콘텐츠

- 콘텐츠는 `ContentContext`를 통해서만 월드를 바꾼다.
- 발판은 콘텐츠의 내용을 몰라야 한다.
- `id`는 전체에서 유일해야 한다.
- `activate`가 켠 효과는 `deactivate`에서 끈다. 구 색은 예외로, 다음 콘텐츠가 덮어쓴다.
- 색은 선형 RGB로 다룬다.
- 발판은 `|x|`, `|z|` < 13에 두고, 다른 발판과 중심 거리를 3.4보다 크게 둔다.

## 구조

- `engine/`에 게임 규칙을 넣지 않는다.
- `World`와 `game/`의 상태 클래스는 GPU와 DOM에 의존하지 않는다.
- `Renderer`에 게임 상태를 두지 않는다. 값은 `FrameData`로 받고, GPU 리소스는 생성자에서 만든다.

## 완료 조건

- `npm test`와 `npm run build`가 통과한다.
- 렌더링이 바뀌면 브라우저에서 전환 중간, 완료, 다른 발판으로 복귀한 상태를 확인하고, WebGL과 콘솔 오류가 없는지 본다.
- 동작이나 구조가 바뀌면 같은 변경에서 [analysis/content.md](../analysis/content.md)와 [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md)를 고친다.
