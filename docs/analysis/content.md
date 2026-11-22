# 콘텐츠와 셰이더 구조 분석

콘텐츠를 추가할 때 코드 전체를 다시 읽지 않도록 정리한 현재 구조다.

- **규칙:** [rules/content.md](../rules/content.md)
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `cc0d160` (2026-11-21, 전체 문서 재검토)
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline cc0d160..HEAD -- src/content src/game src/engine/renderer.ts src/engine/contentRenderers src/shaders src/main.ts
```

## 작업 유형별 수정 파일

경로는 `src/` 기준이다. 표의 파일만 읽어도 작업할 수 있다.

| 유형 | 언제 | 수정할 파일 |
|---|---|---|
| B. 기존 기능 조합 | `ContentContext`로 충분하다 | `content/<이름>.ts` 추가, `registry.ts` |
| C. 새 월드 상태 | 시간에 따라 변하는 상태나 새 동작이 필요하다 | B + `game/<이름>.ts`, `content/types.ts`, `game/world.ts`, `game/game.test.ts` |
| D. 툰 표면 변형 | 불투명 재질의 무늬나 색 변화 | C(필요 시) + `shaders/toon.frag`, `engine/frame.ts`의 `SurfacePattern` |
| E. 별도 셰이더 | 투명, 굴절 등 툰 셰이더로 안 되는 표현 | C + `shaders/<이름>.frag`, `engine/frame.ts`, `engine/contentRenderers/<이름>.ts`와 `registry.ts`, `game/world.ts`의 `buildContentFrames`, 필요하면 `toon.frag` |

지금은 등록된 콘텐츠가 없다. 예전의 행성 표면 색 영역(콘텐츠 `planetColor`와 `game/colorTransition.ts`)은 2026-11-21에 사용자 결정으로 지웠고, 참고 구현은 커밋 `1c3831b`에 있다. 그 전의 물이 든 구와 달아오른 구(유형 E)는 2026-11-17에 사용자 결정으로 지웠다. 유형 E의 참고 구현이 필요하면 커밋 `78247e5`의 `content/waterSphere.ts`, `game/waterFill.ts`, `shaders/water.frag`, `engine/contentRenderers/waterSphere.ts`와 `heatSphere` 쪽 파일을 보면 된다. 유형 B~D는 `engine/renderer.ts`와 `engine/contentRenderers/`를 고치지 않는다.

## 콘텐츠 인터페이스

```ts
// content/types.ts
interface GraphicsContent {
  id: string;
  label: string;          // HUD에 표시되는 이름
  activate(ctx): void;
  deactivate(ctx): void;
  update?(dt, ctx): void; // 활성 중 120Hz 고정 간격으로 호출
}
interface ContentEntry { content: GraphicsContent; zone: { latitude; longitude; color: Vec3 } }
```

`ContentContext`는 지금 비어 있다. 콘텐츠가 월드를 바꿔야 하면 아래 "월드 상태 추가 순서"대로 기능을 더한다.

행성 땅의 재질은 `World`의 `PLANET_COLOR`와 셰이더의 파스텔 물결(`SurfacePattern.Dreamy`, [analysis/terrain.md](terrain.md)), 플레이어 캐릭터(몸과 다리)의 재질은 `PLAYER_COLOR`로 고정이며 콘텐츠가 바꾸지 않는다. 캐릭터 구조는 [analysis/character.md](character.md)에 있다. `buildDrawList`는 행성 땅(`terrain` 메시)을 그리기 목록의 첫 항목으로, 지형물을 그 뒤에 둔다.

동작:

- 활성 콘텐츠는 하나다. 처음에는 켜진 콘텐츠가 없고, HUD도 숨겨져 있다. 다른 영역에 들어가면 이전 `deactivate`, 다음 `activate` 순서로 호출된다.
- `CONTENT_ENTRIES`에 추가하면 영역 표시, 판정, 빛남, HUD가 자동으로 따라온다. HUD 색은 `zone.color`에서 만들어진다.
- 일시 정지 중에는 `update`와 `fixedStep`이 돌지 않고 렌더링만 계속된다.

## 작동 영역

행성은 원점이 중심이고 반지름이 18이다(`game/planet.ts`의 `PLANET`). 땅은 그 위에 높낮이가 있다(`game/terrain.ts`의 `TERRAIN`). 영역 위치는 위도와 경도(도)로 적고, `surfaceDirection(위도, 경도)`가 행성 중심에서 영역 중심을 향하는 단위 벡터로 바꾼다.

- 위도 90이 시작 지점(+Y)이다. 경도 180이 시작할 때 바라보는 방향(-Z)이고, 경도 90이 오른쪽(+X)이다.
- 표면 거리는 각도 1도에 약 0.31이다.
- 해는 시작할 때 위도 약 47, 경도 약 115 쪽(`STUDIO_ENVIRONMENT.lightDirection`)에 있고, 48초에 한 바퀴 궤도를 돈다 ([analysis/sun.md](sun.md)). 그래서 낮과 밤이 바뀐다. "해가 드는 쪽" 검사는 시작할 때의 방향 기준이다.

사용 중인 위치는 없다.

`game.test.ts`가 `CONTENT_ENTRIES`의 위치 조건(간격, 시작 지점과의 거리, 해가 드는 쪽)을 검사한다. 영역 판정과 강조, 콘텐츠 전환의 월드 통합 테스트는 등록 목록 대신 테스트 안의 가짜 콘텐츠(`testEntries`, 위치 `(35, 60)`과 `(-5, 115)`)를 `World`에 넘겨 시험한다.

영역은 메시가 없다. 행성 표면에 칠한 원이다.

- **판정:** `SurfaceZone`(`game/surfaceZone.ts`)이 행성 중심에서 캐릭터 물리 몸체(충돌 구)의 중심을 향하는 방향과 영역 방향의 각도를 본다. 각도가 반지름(표면 1.5) 안이면 작동한다. 높이는 보지 않으므로 몸체가 떠 있어도 작동한다. 경계에서 `PLAYER_RADIUS`만큼 더 벗어나야 다시 작동할 수 있다.
- **상태:** `World`가 영역마다 `glow`(켜진 콘텐츠의 영역이면 1)와 `presence`(캐릭터가 영역 위에 있으면 1)를 지수적으로 따라가게 한다.
- **그리기:** 셰이더는 법선이 아니라 중심에서 본 방향(`normalize(vObjectPos)`)으로 칠하므로 언덕 위에서도 원이 찌그러지지 않는다. `World.buildSurfaceZones()`가 `SurfaceZoneFrame[]`을 만들고 `FrameData.surfaceZones`로 넘긴다. `Renderer`는 이를 툰 공용 uniform 배열(`uZoneDir`, `uZoneColor`, `uZoneParams`, `uZoneCount`)에 옮기고, 재질의 `showsZones`가 켜진 메시(행성)만 `toon.frag`의 `applySurfaceZones`로 칠한다. 안쪽은 영역 색을 80% 섞고, 경계선은 어둡게 칠한다. 켜진 영역은 안쪽과 경계가 빛나고, 캐릭터가 올라서면 경계선이 영역 색으로 밝아진다.
- **한계:** 영역은 `MAX_SURFACE_ZONES`(8)개까지 그린다. `frame.ts`와 `toon.frag`의 `MAX_ZONES`를 함께 바꿔야 한다. 평평하게 칠한 원이라 지평선 너머에서는 보이지 않는다.

## 월드 상태 추가 순서

1. `game/<이름>.ts`에 상태 클래스를 만들고 `update(dt, ...)`로 진행한다.
2. `content/types.ts`의 `ContentContext`에 메서드를 더한다.
3. `World` 생성자가 `ContentManager`에 넘기는 `ctx`(지금은 빈 객체 `{}`)에서 연결하고, `fixedStep`에서 갱신한다.
4. `game.test.ts`의 가짜 `ctx`(`콘텐츠 관리` 블록)에도 메서드를 더한다. 빠뜨리면 `tsc`가 실패한다.
5. 상태 클래스 단위 테스트와, 영역까지 굴러가는 월드 통합 테스트(`rollTo` 사용)를 더한다.
6. 방향이 있는 상태라면 위쪽이 `[0, 1, 0]`이라고 가정하지 않는다. 위쪽은 `normalize(물리 몸체 위치 - PLANET.center)`이며 캐릭터가 움직이면 계속 바뀐다.

렌더링에는 `World`의 값을 프레임마다 넘긴다. 위치는 `alpha`로 보간한 `interpolatedPlayerPosition`을 쓴다.

## 렌더러

three.js로 그린다. 구조와 three.js 규약은 [analysis/threejs.md](threejs.md)에 있다.

프레임 순서:

1. 그림자 패스: `items` 중 `castShadow`인 것을 깊이만 그린다.
2. 메인 패스: `items`를 툰 재질로 그린다. 불투명한 물체의 순서는 three.js가 정한다. 이어서 별·햇살·해 눈 빌보드를 한 번에 그린다 ([analysis/billboard.md](billboard.md)).
3. `frame.contents`에 값이 있는 콘텐츠 렌더러를 등록한 순서대로 그린다. 지금은 등록된 렌더러가 없고 `World.buildContentFrames`는 빈 배열을 반환한다.

### 콘텐츠 렌더러

콘텐츠 전용 그리기는 `engine/contentRenderers/`에 콘텐츠마다 파일로 나뉘어 있다. `Renderer`는 아래 공통 메서드만 호출하고, 콘텐츠는 필요한 것만 오버라이드한다. 기본 구현은 아무 일도 하지 않는다.

```ts
// engine/contentRenderers/contentRenderer.ts
abstract class ContentRenderer<T extends ContentFrame> {
  abstract readonly kind: T['kind'];   // 받을 ContentFrame.kind
  readonly toonUniforms: Uniforms = {}; // toon.frag에 더하는 uniform
  init(ctx): void {}                   // 한 번. 메시와 재질을 만든다
  prepare(data: T | null): void {}     // 매 프레임, 패스보다 먼저. 값이 없으면 null
  render(data: T, ctx): void {}        // 메인 패스 뒤, 값이 있을 때만
}
```

| 파일 | 내용 |
|---|---|
| `contentRenderer.ts` | 기반 클래스와 `RenderContext` |
| `registry.ts` | `createContentRenderers()`. `main.ts`가 `Renderer` 생성자에 넘긴다. 지금은 빈 목록 |

- **값 전달:** `World.buildContentFrames`가 이번 프레임에 보이는 콘텐츠의 값(`ContentFrame`)만 모아 `FrameData.contents`에 넣는다. `Renderer`는 `kind`가 같은 렌더러에 넘긴다. 같은 `kind`의 렌더러를 두 번 등록하면 생성자가 예외를 던진다.
- **켜진 콘텐츠와 그리는 콘텐츠는 다르다:** 효과가 사라지는 동안에는 활성 콘텐츠가 이미 다른 영역일 수 있다. 그래서 활성 id가 아니라 값의 유무로 그린다.
- **`RenderContext`:** `renderer`, `camera`, `geometries`, `shared`(프레임 단위 uniform), `createToonMesh()`, `applyItem()`, `copySceneColor()`(지금까지 그린 화면 복사)를 제공한다.
- **`toonUniforms`:** `Renderer`가 툰 재질을 만들기 전에 모든 렌더러의 값을 합친다. 그래서 필드 초기값으로 선언해야 하고, `init`에서 추가하면 반영되지 않는다. 값은 `prepare`에서 고치며, `data`가 `null`이면 효과를 끈다.

새 콘텐츠 렌더러 추가 순서:

1. `engine/frame.ts`에 `ContentFrame`을 확장한 타입을 만들고 `kind`를 문자열 리터럴로 정한다.
2. `engine/contentRenderers/<이름>.ts`에 `ContentRenderer<그 타입>`을 상속한 클래스를 만든다.
3. `engine/contentRenderers/registry.ts`에 한 줄을 추가한다. 목록 순서가 그리는 순서다.
4. `World.buildContentFrames`에서 값을 만들어 넣는다.

새 재질을 만들 때 알아 둘 점:

- **정점 셰이더:** `mesh.vert`를 재사용할 수 있다. three.js가 채우는 `modelMatrix`, `viewMatrix`, `projectionMatrix` 외에 `uNormalMatrix`, `uLightViewProj`를 uniform으로 넘겨야 한다. 출력은 `vWorldPos`, `vNormal`, `vObjectPos`, `vShadowCoord`다.
- **재질:** `RawShaderMaterial`에 `glslVersion: GLSL3`를 준다. 셰이더 파일에 `#version`은 쓰지 않는다.
- **겹쳐 그리기:** 같은 메시를 `mesh.vert`로 그리면 깊이가 같다. 재질의 깊이 함수 기본값이 `LessEqualDepth`이므로 `transparent: true`, `depthWrite: false`만 주면 된다.
- **색공간:** 프레임 버퍼에는 ACES와 sRGB 변환을 마친 값이 들어 있다. 복사한 장면(`uSceneColor`)은 `srgbToLinear`로 풀어서 쓰고, ACES는 새로 더하는 빛에만 적용한다.
- **uniform:** 프레임 단위 값은 `RenderContext.shared`의 객체를 함께 참조한다. 셰이더에 없는 uniform은 조용히 무시된다. 값이 안 먹으면 이름부터 확인한다.
- **시간:** 전역 시계는 없다. 시간이 필요한 셰이더는 상태 클래스가 진행한 시간을 프레임 값으로 받는다.
- **위쪽:** 셰이더에서도 위쪽을 +Y로 가정하지 않는다.
- **격자:** `SurfacePattern.Grid`는 구 메시 전용이다. 오브젝트 공간 방향을 정육면체 면에 투영해 격자를 그린다. 지금은 쓰는 곳이 없다.
- **몽환 무늬:** `SurfacePattern.Dreamy`(땅)와 `Gradient`(지형물)는 [analysis/terrain.md](terrain.md)에 있다.

## 현재 구조의 한계

- 콘텐츠 렌더러는 그림자 패스에 참여하지 못한다. 메인 패스 뒤에만 그린다.
- 장면 복사(`copySceneColor`)는 지금 쓰는 곳이 없다. 굴절처럼 뒤 장면을 읽는 콘텐츠를 위해 `RenderContext`에 남겨 두었다.

## 브라우저 확인 방법

서버는 `.claude/launch.json`의 `gameblog`다. 개발 서버에서만 `window.__game`(`world`, `camera`, `input`, `gl`, `getState`)을 쓸 수 있다.

1. "시작하기" 버튼을 클릭한다. 상태가 `playing`이어야 물리가 돈다.
2. 캐릭터의 물리 몸체를 영역으로 옮긴다. 다리(`Walker`)는 발이 멀어지면 회복 걸음으로 따라온다.

   ```js
   const g = window.__game;
   const [lat, lon] = [35, 60].map((d) => (d * Math.PI) / 180); // 영역의 위도, 경도
   const r = 18 + 1.32; // 행성 반지름 + 충돌 구 반지름(PLAYER_RADIUS)
   const p = [r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon)];
   g.world.player.position = p;
   g.world.player.previousPosition = p;
   g.world.player.velocity = [0, 0, 0];
   ```

3. 이동은 키 이벤트를 보내 시험한다. `Input`은 `window`에서 받으므로 캔버스에 보내도 버블링으로 전달된다.

   ```js
   document.getElementById('game').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
   ```

4. `g.gl.getError()`와 콘솔 오류, 스크린샷을 확인한다.
