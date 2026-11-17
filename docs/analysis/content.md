# 콘텐츠와 셰이더 구조 분석

콘텐츠를 추가할 때 코드 전체를 다시 읽지 않도록 정리한 현재 구조다.

- **규칙:** [rules/content.md](../rules/content.md)
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `47a98e7` 다음의 발열 구 색 조정
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline 47a98e7..HEAD -- src/content src/game src/engine/renderer.ts src/engine/contentRenderers src/shaders src/main.ts
```

## 작업 유형별 수정 파일

경로는 `src/` 기준이다. 표의 파일만 읽어도 작업할 수 있다.

| 유형 | 언제 | 수정할 파일 |
|---|---|---|
| A. 색 발판 | 구 색만 바꾼다 | `content/registry.ts` 한 줄 (`colorPlate`) |
| B. 기존 기능 조합 | `ContentContext`로 충분하다 | `content/<이름>.ts` 추가, `registry.ts` |
| C. 새 월드 상태 | 시간에 따라 변하는 상태나 새 동작이 필요하다 | B + `game/<이름>.ts`, `content/types.ts`, `game/world.ts`, `game/game.test.ts` |
| D. PBR 표면 변형 | 불투명 재질의 무늬나 색 변화 | C(필요 시) + `shaders/pbr.frag`, `engine/frame.ts`의 `SurfacePattern` |
| E. 별도 셰이더 | 투명, 굴절 등 PBR로 안 되는 표현 | C + `shaders/<이름>.frag`, `engine/frame.ts`, `engine/contentRenderers/<이름>.ts`와 `registry.ts`, `game/world.ts`의 `buildContentFrames`, 필요하면 `pbr.frag` |

유형 E의 실제 예는 물이 든 구와 달아오른 구다. 물은 `content/waterSphere.ts`, `game/waterFill.ts`, `shaders/water.frag`, `engine/contentRenderers/waterSphere.ts`를, 열과 연기는 `content/heatSphere.ts`, `game/sphereHeat.ts`, `shaders/heat.frag`·`billboard.vert`·`puff.frag`, `engine/contentRenderers/heatSphere.ts`를 보면 된다. 유형 A~D는 `engine/renderer.ts`와 `engine/contentRenderers/`를 고치지 않는다.

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
interface ContentEntry { content: GraphicsContent; plate: { latitude; longitude; color: Vec3 } }
```

`ctx.sphere`가 제공하는 기능:

- `setColor(color)`: 0.3초 동안 색 전환
- `setWaterFilled(filled)`: 물을 약 1.1초 동안 채우거나 비움
- `setHeated(heated)`: 구를 0.7초 동안 달구거나 1.6초 동안 식힘. 달아오르는 동안 연기를 뿜는다

동작:

- 활성 콘텐츠는 하나다. 다른 발판을 밟으면 이전 `deactivate`, 다음 `activate` 순서로 호출된다.
- `CONTENT_ENTRIES`에 추가하면 발판, 판정, 빛남, HUD가 자동으로 따라온다. HUD 색은 `plate.color`에서 만들어진다.
- 일시 정지 중에는 `update`와 `fixedStep`이 돌지 않고 렌더링만 계속된다.

## 발판 위치

행성은 원점이 중심이고 반지름이 18이다(`game/planet.ts`의 `PLANET`). 발판 위치는 위도와 경도(도)로 적고, `surfaceDirection(위도, 경도)`가 행성 중심에서 발판을 향하는 단위 벡터로 바꾼다.

- 위도 90이 시작 지점(+Y)이다. 경도 180이 시작할 때 바라보는 방향(-Z)이고, 경도 90이 오른쪽(+X)이다.
- 표면 거리는 각도 1도에 약 0.31이다.
- 해는 경도 115, 위도 46 쪽에 있다. 그 반대쪽 절반은 밤이다.

사용 중인 위치(위도, 경도): `(70, 180)` 기본색, `(35, 215)` 코랄(달아오른 구), `(30, 150)` 앰버, `(-5, 115)` 틸, `(35, 60)` 블루.

`game.test.ts`가 위치 조건(간격, 시작 지점과의 거리, 해가 드는 쪽)을 검사하고, `color-default`, `color-coral`, `water-blue` id를 직접 참조한다.

발판은 `World`가 원기둥을 `quatFromUnitVectors([0, 1, 0], 방향)`으로 돌려 표면에 놓는다. 판정(`PressurePlate`)은 발판 면의 중심과 법선을 받아, 구가 축에서 반경 안에 있고 발판 면 가까이 있는지를 본다.

## 월드 상태 추가 순서

1. `game/<이름>.ts`에 상태 클래스를 만들고 `update(dt, ...)`로 진행한다.
2. `content/types.ts`의 `ContentContext`에 메서드를 더한다.
3. `World` 생성자의 `ctx` 객체에서 연결하고, `fixedStep`에서 갱신한다.
4. `game.test.ts`의 가짜 `ctx`(`콘텐츠 관리` 블록)에도 메서드를 더한다. 빠뜨리면 `tsc`가 실패한다.
5. 상태 클래스 단위 테스트와, 발판까지 굴러가는 월드 통합 테스트(`rollTo` 사용)를 더한다.
6. 방향이 있는 상태라면 위쪽이 `[0, 1, 0]`이라고 가정하지 않는다. 위쪽은 `normalize(구 위치 - PLANET.center)`이며 구가 움직이면 계속 바뀐다. `WaterFill.update`가 `up`을 받는 방식을 참고한다.

렌더링에는 `World`의 값을 프레임마다 넘긴다. 위치는 `alpha`로 보간한 `interpolatedPlayerPosition`을 쓴다.

## 렌더러

three.js로 그린다. 구조와 three.js 규약은 [analysis/threejs.md](threejs.md)에 있다.

프레임 순서:

1. 그림자 패스: `items` 중 `castShadow`인 것을 깊이만 그린다.
2. 메인 패스: `items`를 PBR 재질로 그린다. 불투명한 물체의 순서는 three.js가 정한다.
3. `frame.contents`에 값이 있는 콘텐츠 렌더러를 등록한 순서대로 그린다. 물이 든 구는 장면을 텍스처로 복사하고, 자기 장면의 불투명한 구와 물 셰이더 메시를 그린다.

### 콘텐츠 렌더러

콘텐츠 전용 그리기는 `engine/contentRenderers/`에 콘텐츠마다 파일로 나뉘어 있다. `Renderer`는 아래 공통 메서드만 호출하고, 콘텐츠는 필요한 것만 오버라이드한다. 기본 구현은 아무 일도 하지 않는다.

```ts
// engine/contentRenderers/contentRenderer.ts
abstract class ContentRenderer<T extends ContentFrame> {
  abstract readonly kind: T['kind'];   // 받을 ContentFrame.kind
  readonly pbrUniforms: Uniforms = {}; // pbr.frag에 더하는 uniform
  init(ctx): void {}                   // 한 번. 메시와 재질을 만든다
  prepare(data: T | null): void {}     // 매 프레임, 패스보다 먼저. 값이 없으면 null
  render(data: T, ctx): void {}        // 메인 패스 뒤, 값이 있을 때만
}
```

| 파일 | 내용 |
|---|---|
| `contentRenderer.ts` | 기반 클래스와 `RenderContext` |
| `waterSphere.ts` | `WaterSphereRenderer` (`kind: 'water-sphere'`) |
| `heatSphere.ts` | `HeatSphereRenderer` (`kind: 'heat-sphere'`). 물이 든 구 뒤에 그려 연기가 복사된 장면에 섞이지 않는다 |
| `registry.ts` | `createContentRenderers()`. `main.ts`가 `Renderer` 생성자에 넘긴다 |

- **값 전달:** `World.buildContentFrames`가 이번 프레임에 보이는 콘텐츠의 값(`ContentFrame`)만 모아 `FrameData.contents`에 넣는다. `Renderer`는 `kind`가 같은 렌더러에 넘긴다. 같은 `kind`의 렌더러를 두 번 등록하면 생성자가 예외를 던진다.
- **켜진 콘텐츠와 그리는 콘텐츠는 다르다:** 물이 빠지는 동안에는 활성 콘텐츠가 이미 다른 발판이다. 그래서 활성 id가 아니라 값의 유무로 그린다.
- **`RenderContext`:** `renderer`, `camera`, `geometries`, `shared`(프레임 단위 uniform), `createPbrMesh()`, `applyItem()`, `copySceneColor()`(지금까지 그린 화면 복사)를 제공한다.
- **`pbrUniforms`:** `Renderer`가 PBR 재질을 만들기 전에 모든 렌더러의 값을 합친다. 그래서 필드 초기값으로 선언해야 하고, `init`에서 추가하면 반영되지 않는다. 값은 `prepare`에서 고치며, `data`가 `null`이면 효과를 끈다.
- **구 색 발판**은 그리기 목록의 재질 값만 바꾸므로 콘텐츠 렌더러가 없다.

### 달아오른 구

- **상태:** `SphereHeat`(`game/sphereHeat.ts`)가 열(`amount`)과 연기 입자를 진행한다. 입자는 구 표면에서 위쪽으로 치우쳐 나오고, 입자마다 행성 바깥 방향으로 떠오르며 커지고 옅어진다. 최대 `SMOKE_CAPACITY`(96)개이며, 테스트가 같은 결과를 얻도록 난수를 직접 만든다.
- **구 자체의 빛:** `World`가 구 재질의 `emissive`에 `HEAT_EMISSIVE * amount`를 넣는다. PBR 그리기 목록이라 그림자 패스와 물 전환에도 그대로 따라간다.
- **겹쳐 그리기:** `HeatSphereRenderer`가 같은 구에 `heat.frag` 껍질(더하기 블렌딩, 불씨 무늬와 테두리 빛)을 겹치고, 빛 번짐 1개와 연기를 `billboard.vert` + `puff.frag` 인스턴스 사각형으로 그린다. 빛 번짐은 더하기 블렌딩에 깊이 검사를 끄고, 연기는 일반 블렌딩에 깊이 검사를 켠다.
- **값 전달:** `HeatSphere.smoke`는 입자마다 `SMOKE_STRIDE`(7)개 값(x, y, z, 크기, 불투명도, 씨앗, 열기)이 든 `Float32Array`이고 앞의 `smokeCount`개만 유효하다. 렌더러는 이를 `InstancedInterleavedBuffer`에 그대로 복사한다.
- **그리는 조건:** 열이 0이어도 연기가 남아 있으면 값이 있다. 식은 뒤 연기가 다 사라져야 `buildHeatSphere`가 `null`을 반환한다.
- **색 조정:** 껍질과 빛 번짐은 sRGB 프레임 버퍼에 더해지므로 초록 성분이 조금만 있어도 빨강이 포화되며 노랗게 보인다. 색은 빨강 위주로 두고 세기를 낮게 유지한다.

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
- **시간:** 전역 시계는 없다. `pbr.frag`의 `uTime`은 `WaterSphereRenderer.pbrUniforms`가 소유하며 `WaterFill.time`을 쓰고, 물이 없으면 0이다. `heat.frag`의 `uTime`은 `SphereHeat.time`이다.
- **인스턴스 사각형:** `billboard.vert`는 `position`(-1~1 사각형)과 인스턴스 속성 `aCenter`, `aParams`를 받고 `viewMatrix`에서 카메라의 오른쪽과 위쪽을 꺼낸다. 정점 셰이더가 위치를 정하므로 메시의 `frustumCulled`를 꺼야 한다.
- **위쪽:** 셰이더에서도 위쪽을 +Y로 가정하지 않는다. `water.frag`는 수면 법선(`uSurface`)을 기준으로 좌표축을 만들고, 굴절된 배경은 행성(`uGround`)과의 교차점에서 찾는다.
- **격자:** `SurfacePattern.Grid`는 구 메시 전용이다. 오브젝트 공간 방향을 정육면체 면에 투영해 격자를 그린다.
- **그림자:** 물이 든 구는 `items`에서 빠져 그림자 맵에 그려지지 않는다. `pbr.frag`의 `waterBallLight`가 옅은 그림자와 커스틱을 대신 그린다.

## 현재 구조의 한계

- 장면 복사(`copySceneColor`)는 공통 경로지만, 불투명한 구 위에 겹쳐 그리는 절차는 `WaterSphereRenderer` 안에 있다. 구를 대체하는 두 번째 셰이더가 생기면 그 부분을 중간 클래스로 올리는 편이 낫다.
- 구를 그리기 목록에서 빼는 조건(`water.amount === 0`)은 `World.buildDrawList`에 물 전용으로 남아 있다.
- 콘텐츠 렌더러는 그림자 패스에 참여하지 못한다. 메인 패스 뒤에만 그린다. 연기는 그림자를 드리우지 않는다.
- 달아오른 채 블루 발판으로 가면 식는 동안(최대 1.6초) 열 껍질이 물이 든 구 위에 겹쳐 그려진다.
- 연기는 투명 물체를 정렬하지 않고 입자 순서대로 그린다. 입자가 옅어 겹침 순서는 눈에 띄지 않는다.

## 브라우저 확인 방법

서버는 `.claude/launch.json`의 `gameblog`다. 개발 서버에서만 `window.__game`(`world`, `camera`, `input`, `gl`, `getState`)을 쓸 수 있다.

1. "시작하기" 버튼을 클릭한다. 상태가 `playing`이어야 물리가 돈다.
2. 구를 발판으로 옮긴다.

   ```js
   const g = window.__game;
   const [lat, lon] = [35, 60].map((d) => (d * Math.PI) / 180); // 발판의 위도, 경도
   const r = 18.65; // 행성 반지름 + 구 반지름
   const p = [r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon)];
   g.world.player.position = p;
   g.world.player.previousPosition = p;
   g.world.player.velocity = [0, 0, 0];
   ```

3. 이동은 캔버스에 키 이벤트를 보내 시험한다.

   ```js
   document.getElementById('game').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
   ```

4. `g.gl.getError()`와 콘솔 오류, 스크린샷을 확인한다.
