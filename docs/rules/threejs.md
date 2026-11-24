# three.js 사용 규칙

렌더러나 셰이더를 고칠 때 지키는 규칙이다.

- **적용 분석:** [analysis/threejs.md](../analysis/threejs.md)
- **색인:** [docs/README.md](../README.md)

## 범위

- 렌더링은 three.js로 한다 (2026-11-15 사용자 결정).
- three.js는 `engine/render/`, `engine/app.ts`, 콘텐츠의 `graphics/` 폴더와 `*Graphics.ts` 파일에서만 가져온다 (2026-11-24, 엔진·콘텐츠 계층 분리). 그 밖의 `engine/`(`frame.ts`, `math.ts`, `physics/` 등)과 콘텐츠의 상태·모양 코드는 three.js에 의존하지 않는다. `src/layers.test.ts`가 검사한다.
- 셰이더는 엔진 셰이더(`engine/render/shaders/`: 툰, 빌보드)와 씬 셰이더(`content/<씬>/shaders/`)로 나눈다. 씬 셰이더는 그 씬의 `graphics/`에서 `RenderLayer`로 등록한다.
- WebGL 함수를 직접 호출하지 않는다. `renderer.context`는 개발용 오류 확인에만 쓴다.

## 셰이더

- 셰이더 파일에 `#version`을 쓰지 않는다.
- 정점 속성 이름은 `position`, `normal`을 쓴다.
- 톤 매핑과 sRGB 변환은 셰이더 안에서 한다. `renderer.toneMapping`을 켜지 않는다.

## 완료 조건

- `npm test`와 `npm run build`가 통과한다.
- 브라우저에서 `window.__game.gl.getError()`가 0이고 콘솔 오류가 없다.
- three.js 버전을 올리면 [analysis/threejs.md](../analysis/threejs.md)의 "포팅 중 확인한 점"을 다시 확인한다.
