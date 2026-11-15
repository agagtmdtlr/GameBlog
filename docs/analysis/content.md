# 콘텐츠와 셰이더 구조 분석

콘텐츠를 추가할 때 코드 전체를 다시 읽지 않도록 정리한 현재 구조다.

- **규칙:** [rules/content.md](../rules/content.md)
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `7b5a2ab` 다음의 점프 제거와 행성 변경
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline 7b5a2ab..HEAD -- src/content src/game src/engine/renderer.ts src/shaders src/main.ts
```

## 작업 유형별 수정 파일

경로는 `src/` 기준이다. 표의 파일만 읽어도 작업할 수 있다.

| 유형 | 언제 | 수정할 파일 |
|---|---|---|
| A. 색 발판 | 구 색만 바꾼다 | `content/registry.ts` 한 줄 (`colorPlate`) |
| B. 기존 기능 조합 | `ContentContext`로 충분하다 | `content/<이름>.ts` 추가, `registry.ts` |
| C. 새 월드 상태 | 시간에 따라 변하는 상태나 새 동작이 필요하다 | B + `game/<이름>.ts`, `content/types.ts`, `game/world.ts`, `game/game.test.ts` |
| D. PBR 표면 변형 | 불투명 재질의 무늬나 색 변화 | C(필요 시) + `shaders/pbr.frag`, `engine/frame.ts`의 `SurfacePattern` |
| E. 별도 셰이더 | 투명, 굴절 등 PBR로 안 되는 표현 | C + `shaders/<이름>.frag`, `engine/frame.ts`, `engine/renderer.ts`, `main.ts`, 필요하면 `pbr.frag` |

유형 E의 실제 예는 물이 든 구다. `content/waterSphere.ts`, `game/waterFill.ts`, `shaders/water.frag`, `renderer.ts`의 `renderWaterSphere`를 보면 된다.

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

동작:

- 활성 콘텐츠는 하나다. 다른 발판을 밟으면 이전 `deactivate`, 다음 `activate` 순서로 호출된다.
- `CONTENT_ENTRIES`에 추가하면 발판, 판정, 빛남, HUD가 자동으로 따라온다. HUD 색은 `plate.color`에서 만들어진다.
- 일시 정지 중에는 `update`와 `fixedStep`이 돌지 않고 렌더링만 계속된다.

## 발판 위치

행성은 원점이 중심이고 반지름이 18이다(`game/planet.ts`의 `PLANET`). 발판 위치는 위도와 경도(도)로 적고, `surfaceDirection(위도, 경도)`가 행성 중심에서 발판을 향하는 단위 벡터로 바꾼다.

- 위도 90이 시작 지점(+Y)이다. 경도 180이 시작할 때 바라보는 방향(-Z)이고, 경도 90이 오른쪽(+X)이다.
- 표면 거리는 각도 1도에 약 0.31이다.
- 해는 경도 115, 위도 46 쪽에 있다. 그 반대쪽 절반은 밤이다.

사용 중인 위치(위도, 경도): `(70, 180)` 기본색, `(35, 215)` 코랄, `(30, 150)` 앰버, `(-5, 115)` 틸, `(35, 60)` 블루.

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
3. `frame.water`가 있으면 장면을 텍스처로 복사하고, `waterScene`의 불투명한 구와 물 셰이더 메시를 그린다.

새 재질을 만들 때 알아 둘 점:

- **정점 셰이더:** `mesh.vert`를 재사용할 수 있다. three.js가 채우는 `modelMatrix`, `viewMatrix`, `projectionMatrix` 외에 `uNormalMatrix`, `uLightViewProj`를 uniform으로 넘겨야 한다. 출력은 `vWorldPos`, `vNormal`, `vObjectPos`, `vShadowCoord`다.
- **재질:** `RawShaderMaterial`에 `glslVersion: GLSL3`를 준다. 셰이더 파일에 `#version`은 쓰지 않는다.
- **겹쳐 그리기:** 같은 메시를 `mesh.vert`로 그리면 깊이가 같다. 재질의 깊이 함수 기본값이 `LessEqualDepth`이므로 `transparent: true`, `depthWrite: false`만 주면 된다.
- **색공간:** 프레임 버퍼에는 ACES와 sRGB 변환을 마친 값이 들어 있다. 복사한 장면(`uSceneColor`)은 `srgbToLinear`로 풀어서 쓰고, ACES는 새로 더하는 빛에만 적용한다.
- **uniform:** 프레임 단위 값은 `Renderer.shared`의 객체를 함께 참조한다. 셰이더에 없는 uniform은 조용히 무시된다. 값이 안 먹으면 이름부터 확인한다.
- **시간:** 전역 시계는 없다. `uTime`은 `WaterFill.time`을 쓰고, 물이 없으면 0이다.
- **위쪽:** 셰이더에서도 위쪽을 +Y로 가정하지 않는다. `water.frag`는 수면 법선(`uSurface`)을 기준으로 좌표축을 만들고, 굴절된 배경은 행성(`uGround`)과의 교차점에서 찾는다.
- **격자:** `SurfacePattern.Grid`는 구 메시 전용이다. 오브젝트 공간 방향을 정육면체 면에 투영해 격자를 그린다.
- **그림자:** 물이 든 구는 `items`에서 빠져 그림자 맵에 그려지지 않는다. `pbr.frag`의 `waterBallLight`가 옅은 그림자와 커스틱을 대신 그린다.

## 현재 구조의 한계

`FrameData.water`와 `renderWaterSphere`는 물 전용이다. 구가 아닌 물체의 투명 효과도 지금은 경로가 없다. 구를 대체하는 두 번째 셰이더를 추가한다면 이 코드를 복사하기보다, 장면 복사와 겹쳐 그리기를 공통 경로로 빼내는 편이 낫다.

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
