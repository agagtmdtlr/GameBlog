# 위성 분석

행성 주변 하늘에 떠 있는, 충돌구가 패인 바위 위성의 구조다.

- **규칙:** 없음
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `b3bc263` 다음의 위성 추가 (2026-11-21)

## 동작

- 위성은 회색 바위 구체다. 행성 중심에서 40 떨어진 고정된 자리(`MOON.direction`)에 있고, 기울어진 축(`MOON.spinAxis`)을 중심으로 90초에 한 바퀴 자전만 한다 (`game/moon.ts`).
- 시작 시점에서 왼쪽 위 하늘에 보인다. 해의 궤도면에서 멀어 해와 겹치지 않는다.
- 표면에 큰 충돌구 4개와 작은 충돌구 22개가 있다. 큰 충돌구는 가운데에 구덩이가 한 번 더 패여 있다. 바위 덩어리 14개가 가장자리를 울퉁불퉁하게 만든다.
- 모양은 고정 씨앗(`MOON_SHAPE.seed`)으로 만들어 늘 같다.
- `World.fixedStep`에서만 자전하므로 시작 화면과 일시 정지 중에는 멈춘다.
- 충돌이 없다. 플레이어가 닿을 수 없는 거리다.
- 위성 바로 아래 표면에 로켓 자리 정육면체가 있다 (`scenes/surface.json`의 `rocket`, 자리 `{ "under": "moon" }`). 위치를 `MOON.direction`에서 계산하므로 `MOON.direction`을 바꾸면 함께 옮겨진다.

## 파일

| 파일 | 내용 |
|---|---|
| `engine/moonShape.ts` | `MOON_SHAPE` 상수, `generateMoonFeatures`(충돌구·바위 덩어리), `craterProfile`(충돌구 단면), `moonRadiusAt`(방향별 반지름 배율), `displaceToMoon`(정점 밀기). three.js를 쓰지 않는다 |
| `game/moon.ts` | `MOON` 상수(자리, 거리, 반지름, 자전축, 자전 주기), `MOON_COLOR`, `Moon` 클래스(`step`, `spin(alpha)`, `model(alpha)`) |
| `game/world.ts` | `World.moon`을 `fixedStep`에서 진행하고, 캐릭터 다음에 `moon` 메시를 그리기 목록에 넣는다 |
| `engine/frame.ts` | `MeshKind`에 `moon` |
| `engine/renderer.ts` | `createMoonGeometry()`: `IcosahedronGeometry(1, 48)`에서 법선·UV를 지우고 `mergeVertices`로 정점을 합친 뒤 `displaceToMoon`으로 밀고 `computeVertexNormals` |

## 세부

- **충돌구 단면:** `t` = 중심에서의 각거리 / 각반지름. 안쪽은 `-depth·min(1, 1.25(1 − t²))`로 바닥이 평평한 그릇, 테두리는 `t = 1`에 가우스 모양으로 솟는다(깊이의 45%). `t ≥ 2`는 계산하지 않는다. 깊이는 각반지름의 0.32배다.
- **겹침:** 충돌구와 바위 덩어리의 높이를 모두 더한다. 반지름 배율은 대략 0.8~1.2 사이다.
- **정점 합치기:** `IcosahedronGeometry`는 면마다 정점이 따로라 그대로 법선을 계산하면 각진 면이 된다. `mergeVertices` 전에 `normal`, `uv`를 지워야 같은 위치의 정점이 합쳐진다.
- **재질:** 기본색 `MOON_COLOR` [0.3, 0.3, 0.31], 거칠기 0.95. 무늬는 없고 충돌구는 지오메트리의 음영으로만 보인다.
- **그림자:** `castShadow: false`. 그림자 맵(원점 기준 ±24)의 범위 밖이라 드리워도 소용없다. 받는 쪽은 셰이더가 범위 밖 좌표를 그림자 없음으로 처리한다.

## 테스트

- `engine/moonShape.test.ts`: 씨앗 재현성, 충돌구 단면(가운데 패임, 테두리 솟음, 바깥 평평), 큰 충돌구 중심이 패임, 정점 밀기 범위.
- `game/game.test.ts`의 "위성": 자리 고정과 자전, 행성·해 궤도와의 간격, 그림자 제외.

## 브라우저 확인 (2026-11-21, 개발 서버)

| 항목 | 결과 |
|---|---|
| 시작 시점 | 왼쪽 위 하늘에 충돌구와 울퉁불퉁한 가장자리가 보임 |
| `gl.getError()` | 0, 콘솔 오류 없음 |

확인하지 않은 것: 플레이 중 자전하는 모습(테스트로만 확인), 공개 URL.
