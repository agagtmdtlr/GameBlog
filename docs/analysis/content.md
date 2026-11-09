# 콘텐츠와 셰이더 구조 분석

콘텐츠를 추가할 때 코드 전체를 다시 읽지 않도록 정리한 현재 구조다.

- **규칙:** [rules/content.md](../rules/content.md)
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `1d863db`
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline 1d863db..HEAD -- src/content src/game src/engine/renderer.ts src/shaders src/main.ts
```

## 작업 유형별 수정 파일

경로는 `src/` 기준이다. 표의 파일만 읽어도 작업할 수 있다.

| 유형 | 언제 | 수정할 파일 |
|---|---|---|
| A. 색 발판 | 구 색만 바꾼다 | `content/registry.ts` 한 줄 (`colorPlate`) |
| B. 기존 기능 조합 | `ContentContext`로 충분하다 | `content/<이름>.ts` 추가, `registry.ts` |
| C. 새 월드 상태 | 시간에 따라 변하는 상태나 새 동작이 필요하다 | B + `game/<이름>.ts`, `content/types.ts`, `game/world.ts`, `game/game.test.ts` |
| D. PBR 표면 변형 | 불투명 재질의 무늬나 색 변화 | C(필요 시) + `shaders/pbr.frag`, `engine/renderer.ts`의 `SurfacePattern` |
| E. 별도 셰이더 | 투명, 굴절 등 PBR로 안 되는 표현 | C + `shaders/<이름>.frag`, `engine/renderer.ts`, `main.ts`, 필요하면 `pbr.frag` |

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
interface ContentEntry { content: GraphicsContent; plate: { x; z; color: Vec3 } }
```

`ctx.sphere`가 제공하는 기능:

- `setColor(color)`: 0.3초 동안 색 전환
- `setWaterFilled(filled)`: 물을 약 1.1초 동안 채우거나 비움

동작:

- 활성 콘텐츠는 하나다. 다른 발판을 밟으면 이전 `deactivate`, 다음 `activate` 순서로 호출된다.
- `CONTENT_ENTRIES`에 추가하면 발판, 판정, 빛남, HUD가 자동으로 따라온다. HUD 색은 `plate.color`에서 만들어진다.
- 일시 정지 중에는 `update`와 `fixedStep`이 돌지 않고 렌더링만 계속된다.

## 발판 위치

사용 중인 위치: `(0,2)` 기본색, `(-9,-5)` 코랄, `(-3,-7)` 앰버, `(3,-7)` 틸, `(9,-5)` 블루. 시작 지점은 `(0,9)`이다.

`game.test.ts`가 위치 조건을 검사하고, `color-default`, `color-coral`, `water-blue` id를 직접 참조한다.

## 월드 상태 추가 순서

1. `game/<이름>.ts`에 상태 클래스를 만들고 `update(dt, ...)`로 진행한다.
2. `content/types.ts`의 `ContentContext`에 메서드를 더한다.
3. `World` 생성자의 `ctx` 객체에서 연결하고, `fixedStep`에서 갱신한다.
4. `game.test.ts`의 가짜 `ctx`(`콘텐츠 관리` 블록)에도 메서드를 더한다. 빠뜨리면 `tsc`가 실패한다.
5. 상태 클래스 단위 테스트와, 발판까지 굴러가는 월드 통합 테스트(`rollTo` 사용)를 더한다.

렌더링에는 `World`의 값을 프레임마다 넘긴다. 위치는 `alpha`로 보간한 `interpolatedPlayerPosition`을 쓴다.

## 렌더러

프레임 순서:

1. 그림자 패스: `items` 중 `castShadow`인 것을 `depth` 프로그램으로 그린다.
2. 메인 패스: `items`를 배열 순서대로 PBR로 그린다. 정렬은 없다.
3. `frame.water`가 있으면 장면을 텍스처로 복사하고, 불투명한 구를 그린 뒤, 물 셰이더를 블렌딩해 겹쳐 그린다.

새 프로그램을 만들 때 알아 둘 점:

- **정점 셰이더:** `mesh.vert`를 재사용할 수 있다. 필수 uniform은 `uModel`, `uNormalMatrix`, `uViewProj`, `uLightViewProj`이고, 출력은 `vWorldPos`, `vNormal`, `vObjectPos`, `vShadowCoord`다.
- **겹쳐 그리기:** 같은 메시를 `mesh.vert`로 그리면 깊이가 같으므로 `depthFunc(LEQUAL)`을 쓴다. 그린 뒤 `LESS`로 되돌리고 블렌딩을 끈다.
- **색공간:** 프레임 버퍼에는 ACES와 sRGB 변환을 마친 값이 들어 있다. 복사한 장면(`uSceneColor`)은 `srgbToLinear`로 풀어서 쓰고, ACES는 새로 더하는 빛에만 적용한다.
- **텍스처 유닛:** 0은 PBR의 그림자 맵, 1은 복사한 장면이다. 다른 유닛을 쓴 뒤 `TEXTURE0`으로 되돌린다.
- **캔버스:** `alpha: false`이므로 복사 텍스처 형식은 RGB8이다. 면 컬링과 깊이 테스트는 항상 켜져 있다.
- **uniform:** 위치를 캐시하며, 최적화로 제거된 uniform은 조용히 무시된다. 값이 안 먹으면 이름부터 확인한다.
- **시간:** 전역 시계는 없다. `uTime`은 `WaterFill.time`을 쓰고, 물이 없으면 0이다.
- **그림자:** 물이 든 구는 `items`에서 빠져 그림자 맵에 그려지지 않는다. `pbr.frag`의 `waterBallLight`가 옅은 그림자와 커스틱을 대신 그린다.

## 현재 구조의 한계

`FrameData.water`와 `renderWaterSphere`는 물 전용이다. 구가 아닌 물체의 투명 효과도 지금은 경로가 없다. 구를 대체하는 두 번째 셰이더를 추가한다면 이 코드를 복사하기보다, 장면 복사와 겹쳐 그리기를 공통 경로로 빼내는 편이 낫다.

## 브라우저 확인 방법

서버는 `.claude/launch.json`의 `gameblog`다. 개발 서버에서만 `window.__game`(`world`, `camera`, `input`, `gl`, `getState`)을 쓸 수 있다.

1. "시작하기" 버튼을 클릭한다. 상태가 `playing`이어야 물리가 돈다.
2. 구를 발판으로 옮긴다.

   ```js
   const g = window.__game;
   const p = [9, 0.65, -5]; // 발판의 x, 구 반지름, 발판의 z
   g.world.player.position = p;
   g.world.player.previousPosition = p;
   g.world.player.velocity = [0, 0, 0];
   ```

3. 이동은 캔버스에 키 이벤트를 보내 시험한다.

   ```js
   document.getElementById('game').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
   ```

4. `g.gl.getError()`와 콘솔 오류, 스크린샷을 확인한다.
