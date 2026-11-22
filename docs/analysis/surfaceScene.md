# 표면 장면 구조 분석

행성 표면에 놓는 객체를 코드 대신 장면 파일로 관리하는 구조다.

- **규칙:** 없음
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `c18fcc8` (2026-11-22, 텔레비전 두 배 크기와 YouTube 영상 화면)
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline c18fcc8..HEAD -- src/scenes src/game/surfaceScene.ts src/game/world.ts src/engine/tvShape.ts src/engine/rocketShape.ts src/engine/videoScreenLayer.ts src/main.ts
```

## 파일

경로는 `src/` 기준이다.

| 파일 | 내용 |
|---|---|
| `scenes/surface.json` | 장면 파일. 표면 객체 목록 (지금은 `tv`, `rocket`) |
| `game/surfaceScene.ts` | 장면 파일 검사(`validateSurfaceScene`), 읽기(`loadSurfaceScene`), 표면 상자 계산(`surfaceBox`, `boxModel`), 읽은 결과 `SURFACE_OBJECTS`, 텔레비전 화면 자리(`tvVideoScreen`)와 거리별 소리 크기(`videoVolume`, `VIDEO_SOUND`) |
| `engine/videoScreenLayer.ts` | `VideoScreenLayer`: `CSS3DRenderer`로 YouTube iframe을 캔버스 뒤 3D 자리에 놓는다. `YouTubeScreen`: 음소거 자동 재생·반복 임베드(youtube-nocookie.com), postMessage로 `mute`·`unMute`·`setVolume` |
| `main.ts` | 영상이 있는 표면 객체마다 `renderer.addVideoScreen`을 부르고, 매 프레임 플레이 중이면 플레이어와 화면 중심의 거리로, 아니면 0으로 소리 크기를 정한다 |
| `game/world.ts` | `SURFACE_OBJECTS`를 그리기 목록과 충돌 목록(`collides`가 true인 것)에 넣는다. `surfaceObjectDrawItems`가 `box`는 `box` 메시 하나, `rocket`은 `rocket`(객체 색)과 `rocketGlass`(창 유리 색) 메시 둘, `tv`는 `tv`(객체 색, 나무)·`tvTrim`(은색 테·손잡이)·`tvDark`(조작판·스피커 천)·`tvScreen`(화면 유리) 메시 넷으로 그린다 |
| `engine/rocketShape.ts` | 로켓 모형의 모양 값(`ROCKET_SHAPE`)과 자리 계산(`bodyProfile`, `bodySurface`, `rocketLegs`, `rocketWindow`, `rocketHatch`, `rocketRivets`). three.js를 쓰지 않는다 |
| `engine/tvShape.ts` | 아날로그 텔레비전 모형의 모양 값(`TV_SHAPE`)과 부품 계산(`tvLegs`, `tvWoodBoxes`, `tvDarkBoxes`, `tvKnobs`, `tvScreenDepths`, `roundedRect`). three.js를 쓰지 않는다. 검사는 `tvShape.test.ts` |
| `engine/renderer.ts` | `createRocketGeometry()`: 몸통 `LatheGeometry`, 다리 `CapsuleGeometry`, 창틀 `TorusGeometry`, 옆문·리벳 `SphereGeometry`를 `mergeGeometries`로 합친다. `createRocketGlassGeometry()`: 창 유리 `CircleGeometry`. `createTvGeometry()` 등: 텔레비전 부품을 색마다 `mergeParts`로 합친다(상자 `BoxGeometry`, 다리 `CylinderGeometry`, 화면 테 `ExtrudeGeometry`, 화면 유리 `ShapeGeometry`) |
| `game/game.test.ts` | `텔레비전 자리`, `로켓 자리`, `표면 장면 파일` 블록. 객체는 id로 찾는다 |

장면 파일은 Vite의 JSON import로 번들에 들어간다(`tsconfig.json`의 `resolveJsonModule`). 런타임에 따로 내려받지 않는다.

## 객체 형식

```jsonc
{
  "id": "tv",                                       // 장면 안에서 유일
  "shape": "tv",                                    // "box", "rocket", "tv"
  "placement": { "latitude": 66, "longitude": 180 },// 또는 { "under": "moon" }
  "size": [6.6, 6.0, 5.0],                          // 폭, 높이, 깊이
  "sink": 0.25,                                     // 표면 아래로 묻는 깊이
  "color": [0.2, 0.075, 0.03],                      // 선형 RGB (텔레비전은 나무 색)
  "roughness": 0.6,                                 // 0~1
  "collides": true,                                 // 캐릭터가 통과할 수 없으면 true
  "youtube": "aqz-KE-bpKQ"                          // 선택. tv에만. 화면에서 반복 재생할 YouTube 영상 id
}
```

- **자리:** 위도·경도는 도 단위다. 위도 90이 시작 지점(+Y), 경도 180이 시작할 때 바라보는 방향(-Z), 경도 90이 오른쪽(+X)이다. `{ "under": "moon" }`은 `MOON.direction` 바로 아래 표면이며 위성을 옮기면 따라간다.
- **방향:** 상자의 위쪽은 표면 바깥, 정면(+Z 면)은 시작 지점 쪽 표면 접선이다. 회전 값은 아직 없다.
- **모양:** `box`는 단위 정육면체를, `tv`는 한 변 1인 상자 안(바닥 y = -0.5, 화면이 +Z)에 만든 텔레비전 모형을, `rocket`은 한 변 1인 상자 안(바닥 y = -0.5, 창이 +Z)에 만든 로켓 모형을 `size`만큼 늘린다. 충돌은 모양과 관계없이 `size` 상자로 한다. 로켓 모형의 비율은 폭:높이 = 2.6:3.0에 맞춰 잡았다. 지금 크기는 [6.5, 7.5, 6.5]이다(처음 [2.6, 3.0, 2.6]에서 2.5배로 키움, 2026-11-21 사용자 요청). 이만큼 크면 행성이 둥글어 다리 끝이 뜨므로 `sink`를 0.2로 두었다.
- **로켓 모형:** 위가 긴 달걀 단면을 돌린 몸통, 바깥으로 22도 기운 짧은 다리 넷(끝이 바닥에 닿는다), 정면의 둥근 창(창틀은 몸통과 같은 색, 유리는 `ROCKET_SHAPE.glassColor`), 오른쪽 옆의 납작한 옆문, 가로 두 줄·세로 여덟 줄의 리벳이다. 창과 옆문을 덮는 리벳은 뺀다. 창 유리는 그림자를 드리우지 않는다.
- **텔레비전 모형:** 예전 집 자리 상자를 대신한다 (2026-11-22 사용자 요청, 사용자가 보여 준 나무 상자 브라운관 텔레비전 사진을 단순화). 가늘어지는 다리 넷 위에 나무 몸통과 조금 넓은 뚜껑이 있고, 앞면 왼쪽에 둥근 모서리 화면(은색 테, 어두운 청회색 유리), 오른쪽 위에 은색 손잡이 둘 달린 검은 조작판, 그 아래 나무 가로 살 여덟 줄을 댄 검은 스피커가 있다. 나무 색은 객체 `color`, 나머지 색은 `TV_SHAPE`가 정한다. 조작판·스피커 천·화면은 얇아서 그림자를 드리우지 않는다. 화면은 빛나지 않는다(빛나는 항목 수를 `game.test.ts`의 "해"가 센다).
- **텔레비전 크기:** [3.3, 3.0, 2.5]에서 두 배인 [6.6, 6.0, 5.0]으로 키웠다 (2026-11-22 사용자 요청). 그러면서 겹치던 외계인 시작 자리와 첫째 NPC 시작 자리를 옮겼다.
- **영상 화면:** `youtube`에 영상 id(주소 `watch?v=` 뒤 11자)를 적으면 텔레비전 화면에서 그 영상이 음소거로 자동 재생되고 반복된다 (2026-11-22 사용자 요청). 지금 영상은 Blender 재단의 공개 단편 "Big Buck Bunny"다. 플레이 중에 가까이 가면 소리가 커지고(거리 10 안에서 최대, 32 밖에서 무음), 일시 정지·시작 화면에서는 음소거한다. 브라우저가 소리 재생을 막으면 음소거로 계속 재생된다. 그리는 방법은 [analysis/threejs.md](threejs.md)의 "캔버스 구멍과 HTML 영상"에 있다.
- **검사:** 읽을 때 형식을 검사해, 틀리면 `objects[1](rocket).size: ...`처럼 객체와 값을 적어 예외를 던진다. 모듈을 불러올 때 읽으므로 잘못된 파일은 테스트와 앱 시작에서 바로 드러난다.

## 객체 추가 순서

1. `scenes/surface.json`의 `objects`에 한 항목을 더한다. 코드는 고치지 않아도 그리기와 충돌이 따라온다.
2. 다른 객체, 시작 지점, 기차 선로(위도 46~54, [analysis/train.md](train.md))와 겹치지 않게 둔다. 표면 거리는 각도 1도에 약 0.31이다. 해는 시작할 때 위도 약 47, 경도 약 115 쪽에 있고 48초에 한 바퀴 돌아 낮과 밤이 바뀐다 ([analysis/sun.md](sun.md)).
3. 위치 조건이 중요한 객체면 `game.test.ts`에 id로 찾아 검사하는 블록을 더한다.

새 모양(`shape`)이나 새 자리 종류(`placement`)는 `surfaceScene.ts`의 타입, 검사, `loadSurfaceScene`과 `world.ts`의 그리기를 함께 고친다.

## 한계

- 모양은 상자, 로켓 모형, 텔레비전 모형뿐이고 회전을 지정할 수 없다.
- 로켓·텔레비전 모형도 충돌은 상자라서, 텔레비전 다리 사이나 다리 사이나 둥근 몸통 위쪽 모서리 근처에서는 보이지 않는 벽에 먼저 닿는다.
- 장면 파일은 빌드에 포함되므로 바꾸면 다시 빌드해야 한다. 개발 서버에서는 HMR로 페이지가 다시 불린다.
