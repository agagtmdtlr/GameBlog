# 입력과 조작 분석

키보드·마우스·터치 입력과 시작·일시 정지 상태의 구조다.

- **규칙:** 없음
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `cc0d160` (2026-11-21, 전체 문서 재검토)

## 구조

| 파일 | 역할 |
|---|---|
| [`src/engine/input.ts`](../../src/engine/input.ts) | 키보드, 마우스, 터치 입력을 모은다. 게임 규칙은 모른다 |
| [`src/main.ts`](../../src/main.ts) | 입력을 이동 방향과 시점 회전으로 바꾸고, 시작·일시 정지 상태를 관리한다 |
| [`src/ui/overlay.ts`](../../src/ui/overlay.ts) | 시작·일시 정지 화면, HUD, 일시 정지 버튼, 조이스틱 표시 |
| [`index.html`](../../index.html), [`src/style.css`](../../src/style.css) | 조작 안내, 버튼과 조이스틱 요소, 터치 관련 CSS |

## 입력별 동작

| 입력 | 처리 |
|---|---|
| WASD, 방향키 | `Input.isDown`. 앞뒤와 좌우가 각각 -1~1. 방향키는 페이지 스크롤을 막으려고 기본 동작을 취소한다 |
| 마우스 | 포인터 잠금 중이거나 왼쪽 버튼을 누른 채 움직이면 `lookX/Y`에 쌓는다 |
| 터치, 화면 왼쪽 절반 | 누른 자리가 원점인 가상 조이스틱. 반지름 `JOYSTICK_RADIUS`(56px), 데드존 12%. `moveAxis`가 길이 1 이하의 아날로그 값을 준다 |
| 터치, 화면 오른쪽 절반 | 드래그 이동량에 `TOUCH_LOOK_SCALE`(2)를 곱해 `lookX/Y`에 쌓는다 |
| Esc, 포인터 잠금 해제, 탭 전환 | 일시 정지 |
| 일시 정지 버튼 | 일시 정지. `(pointer: coarse)`일 때만 보인다 |

- 터치는 캔버스의 Touch Events(`touchstart`·`touchmove`·`touchend`·`touchcancel`, `passive: false`)로 받는다. `touchstart`와 `touchmove`에서 `preventDefault`해 스크롤, 확대, 호환용 마우스 이벤트를 막는다. 터치 대상은 처음 누른 요소로 고정되므로 포인터 캡처가 필요 없다.
- 처음에는 Pointer Events와 `setPointerCapture`를 썼지만, 실제 휴대폰 세로 화면에서 조이스틱이 나타나기만 하고 움직이지 않아 2026-11-17에 바꿨다. 원인은 기기에서 확인하지 못했다.
- 조이스틱과 시점 드래그는 각각 손가락 하나씩 `Touch.identifier`로 추적하므로 동시에 쓸 수 있다.
- `main.ts`의 `readMoveDirection`은 키 입력과 `moveAxis`를 더한 뒤 길이가 1을 넘으면 정규화한다. 플레이어는 길이 1 이하의 방향을 그대로 가속에 쓴다.
- 포인터 잠금은 주 입력이 정밀한 포인터(`(pointer: fine)`)일 때만 요청한다. 휴대폰에서 잠금이 걸리면 터치 좌표가 고정되어 조이스틱이 움직이지 않을 수 있기 때문이다.
- `Input.clear()`는 키, 시점 누적, 터치 추적을 모두 지운다. 일시 정지와 창 포커스 해제 때 불린다.
- 조이스틱은 `main.ts`가 매 프레임 `overlay.setJoystick(input.joystick)`으로 그린다. CSS의 원 크기는 `JOYSTICK_RADIUS`와 맞춰 둔다.

## 화면과 CSS

- 조작 안내는 `.controls-pointer`와 `.controls-touch` 두 묶음이 있고, `(pointer: coarse)` 미디어 쿼리로 하나만 보인다.
- 캔버스는 `touch-action: none`이라 드래그가 스크롤·확대로 처리되지 않는다. `body`는 `overscroll-behavior: none`이다.
- HUD와 일시 정지 버튼은 `env(safe-area-inset-*)`만큼 안쪽에 둔다. 뷰포트 메타에 `viewport-fit=cover`가 있다.

## 확인 방법

단위 테스트가 없다. 개발 서버에서 모바일 뷰포트로 열고, 캔버스에 `new Touch(...)`로 만든 `TouchEvent`를 보내 `window.__game.input.moveAxis`, 구 위치, `camera.forward` 변화를 본다. 브라우저 창이 가려져 있으면 프레임이 돌지 않아 구가 움직이지 않고, 창이 다시 보일 때 일시 정지된다.

## 확인하지 않은 것

- 실제 휴대폰에서의 조작감과 성능. Touch Events로 바꾼 뒤의 동작도 기기에서는 아직 확인하지 않았다. 렌더러 설정(그림자 2048px, devicePixelRatio 최대 2)은 모바일용으로 따로 낮추지 않았다
- iOS Safari의 주소창, 노치 영역, 가로 화면
