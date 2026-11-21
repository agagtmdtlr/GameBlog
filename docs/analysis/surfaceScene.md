# 표면 장면 구조 분석

행성 표면에 놓는 객체를 코드 대신 장면 파일로 관리하는 구조다.

- **규칙:** 없음
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `cc0d160` (2026-11-21, 전체 문서 재검토)
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline cc0d160..HEAD -- src/scenes src/game/surfaceScene.ts src/game/world.ts
```

## 파일

경로는 `src/` 기준이다.

| 파일 | 내용 |
|---|---|
| `scenes/surface.json` | 장면 파일. 표면 객체 목록 (지금은 `house`, `rocket`) |
| `game/surfaceScene.ts` | 장면 파일 검사(`validateSurfaceScene`), 읽기(`loadSurfaceScene`), 표면 상자 계산(`surfaceBox`, `boxModel`), 읽은 결과 `SURFACE_OBJECTS` |
| `game/world.ts` | `SURFACE_OBJECTS`를 그리기 목록과 충돌 목록(`collides`가 true인 것)에 넣는다. `surfaceObjectDrawItems`가 `box`는 `box` 메시 하나, `rocket`은 `rocket`(객체 색)과 `rocketGlass`(창 유리 색) 메시 둘로 그린다 |
| `engine/rocketShape.ts` | 로켓 모형의 모양 값(`ROCKET_SHAPE`)과 자리 계산(`bodyProfile`, `bodySurface`, `rocketLegs`, `rocketWindow`, `rocketHatch`, `rocketRivets`). three.js를 쓰지 않는다 |
| `engine/renderer.ts` | `createRocketGeometry()`: 몸통 `LatheGeometry`, 다리 `CapsuleGeometry`, 창틀 `TorusGeometry`, 옆문·리벳 `SphereGeometry`를 `mergeGeometries`로 합친다. `createRocketGlassGeometry()`: 창 유리 `CircleGeometry` |
| `game/game.test.ts` | `집 자리`, `로켓 자리`, `표면 장면 파일` 블록. 객체는 id로 찾는다 |

장면 파일은 Vite의 JSON import로 번들에 들어간다(`tsconfig.json`의 `resolveJsonModule`). 런타임에 따로 내려받지 않는다.

## 객체 형식

```jsonc
{
  "id": "house",                                    // 장면 안에서 유일
  "shape": "box",                                   // "box" 또는 "rocket"
  "placement": { "latitude": 66, "longitude": 180 },// 또는 { "under": "moon" }
  "size": [3.2, 2.8, 3.2],                          // 폭, 높이, 깊이
  "sink": 0.1,                                      // 표면 아래로 묻는 깊이
  "color": [0.3, 0.36, 0.46],                       // 선형 RGB
  "roughness": 0.8,                                 // 0~1
  "collides": true                                  // 캐릭터가 통과할 수 없으면 true
}
```

- **자리:** 위도·경도는 도 단위다. 위도 90이 시작 지점(+Y), 경도 180이 시작할 때 바라보는 방향(-Z), 경도 90이 오른쪽(+X)이다. `{ "under": "moon" }`은 `MOON.direction` 바로 아래 표면이며 위성을 옮기면 따라간다.
- **방향:** 상자의 위쪽은 표면 바깥, 정면(+Z 면)은 시작 지점 쪽 표면 접선이다. 회전 값은 아직 없다.
- **모양:** `box`는 단위 정육면체를, `rocket`은 한 변 1인 상자 안(바닥 y = -0.5, 창이 +Z)에 만든 로켓 모형을 `size`만큼 늘린다. 충돌은 모양과 관계없이 `size` 상자로 한다. 로켓 모형의 비율은 폭:높이 = 2.6:3.0에 맞춰 잡았다. 지금 크기는 [6.5, 7.5, 6.5]이다(처음 [2.6, 3.0, 2.6]에서 2.5배로 키움, 2026-11-21 사용자 요청). 이만큼 크면 행성이 둥글어 다리 끝이 뜨므로 `sink`를 0.2로 두었다.
- **로켓 모형:** 위가 긴 달걀 단면을 돌린 몸통, 바깥으로 22도 기운 짧은 다리 넷(끝이 바닥에 닿는다), 정면의 둥근 창(창틀은 몸통과 같은 색, 유리는 `ROCKET_SHAPE.glassColor`), 오른쪽 옆의 납작한 옆문, 가로 두 줄·세로 여덟 줄의 리벳이다. 창과 옆문을 덮는 리벳은 뺀다. 창 유리는 그림자를 드리우지 않는다.
- **검사:** 읽을 때 형식을 검사해, 틀리면 `objects[1](rocket).size: ...`처럼 객체와 값을 적어 예외를 던진다. 모듈을 불러올 때 읽으므로 잘못된 파일은 테스트와 앱 시작에서 바로 드러난다.

## 객체 추가 순서

1. `scenes/surface.json`의 `objects`에 한 항목을 더한다. 코드는 고치지 않아도 그리기와 충돌이 따라온다.
2. 다른 객체, 시작 지점, 기차 선로(위도 46~54, [analysis/train.md](train.md))와 겹치지 않게 둔다. 표면 거리는 각도 1도에 약 0.31이다. 해는 시작할 때 위도 약 47, 경도 약 115 쪽에 있고 48초에 한 바퀴 돌아 낮과 밤이 바뀐다 ([analysis/sun.md](sun.md)).
3. 위치 조건이 중요한 객체면 `game.test.ts`에 id로 찾아 검사하는 블록을 더한다.

새 모양(`shape`)이나 새 자리 종류(`placement`)는 `surfaceScene.ts`의 타입, 검사, `loadSurfaceScene`과 `world.ts`의 그리기를 함께 고친다.

## 한계

- 모양은 상자와 로켓 모형뿐이고 회전을 지정할 수 없다.
- 로켓 모형도 충돌은 상자라서, 다리 사이나 둥근 몸통 위쪽 모서리 근처에서는 보이지 않는 벽에 먼저 닿는다.
- 장면 파일은 빌드에 포함되므로 바꾸면 다시 빌드해야 한다. 개발 서버에서는 HMR로 페이지가 다시 불린다.
