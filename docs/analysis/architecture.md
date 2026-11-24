# 엔진·콘텐츠 계층 분석

코드를 코어 엔진 계층과 콘텐츠 계층으로 나눈 구조, 둘이 만나는 약속, 새 씬을 더하는 절차를 정리한 문서다.

- **규칙:** [rules/world.md](../rules/world.md)의 "구조", [rules/threejs.md](../rules/threejs.md)의 "범위"
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** `feature/engine-content-layers` (2026-11-24, 커밋 `02fadc5` 위에서 계층을 나눔)
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline 02fadc5..HEAD -- src/engine/scene.ts src/engine/app.ts src/engine/render/graphics.ts src/engine/render/renderer.ts src/content/index.ts src/layers.test.ts
```

엔진을 쓰지 않는 2D 미니 게임(`src/games/`, `?game=<id>`)은 이 두 계층 밖에 있다. [coloring.md](coloring.md)의 "미니 게임 계층"을 본다.

## 왜 나눴나

여러 씬(지금의 행성 말고 다른 월드)을 더하려고 나눴다 (2026-11-24 사용자 요청). 그 전에는 `engine/renderer.ts`가 로켓·텔레비전·외계인 같은 행성 지오메트리를 직접 만들고, `engine/billboard.ts`가 별·햇살·말풍선 그림 목록을, `FrameData`가 비눗방울을 알고 있어서 씬을 하나 더하려면 엔진을 고쳐야 했다.

## 계층

```
main.ts ── content/index.ts (SCENES) ── content/<씬>/index.ts (SceneDefinition)
   │                                           │
   └── engine/app.ts ── engine/render/renderer.ts (Graphics 구현)
```

| 계층 | 폴더 | 담는 것 | 모르는 것 |
|---|---|---|---|
| 코어 엔진 | `src/engine/` | 게임 루프와 시작·일시 정지(`app.ts`), 엔진·콘텐츠 약속(`scene.ts`), 렌더러와 툰·빌보드 셰이더(`render/`), 입력(`input.ts`), 수학·난수(`math.ts`, `random.ts`), 충돌과 고정 시간 간격(`physics/`), CPU 스키닝(`skinning.ts`), 메시 데이터 타입(`meshData.ts`), 화면 안내(`ui/overlay.ts`) | 어떤 씬이 있는지, 어떤 메시·그림·셰이더가 있는지 |
| 공용 콘텐츠 | `src/content/common/` | 여러 씬이 쓰는 월드 오브젝트: 캐릭터 몸체·걸음·애니메이션·NPC·말풍선(`character/`), 구 표면 3인칭 카메라(`cameraRig.ts`), 캐릭터 메시 등록(`character/characterGraphics.ts`) | 특정 씬 |
| 씬 | `src/content/<씬>/` | 월드 조립과 게임 규칙(`world.ts`), 월드 오브젝트 상태(`objects/`), 모양 데이터(`shapes/`), three.js 지오메트리·셰이더 층·빌보드 그림 등록(`graphics/`), GLSL(`shaders/`), 장면 파일(`scenes/`), 그림(`assets/`), 씬 정의(`index.ts`) | 다른 씬 |

`src/layers.test.ts`가 가져오기 방향(엔진 → 콘텐츠 금지, 씬 ↔ 씬 금지, 공용 → 씬 금지)과 three.js를 가져오는 곳을 검사한다.

## 엔진과 콘텐츠의 약속

### 씬 (`engine/scene.ts`)

- `SceneDefinition { id, create(graphics, onError) }`: 콘텐츠가 씬마다 하나 내놓는다. `create`에서 `Graphics`로 그래픽을 등록하고 `SceneInstance`를 돌려준다.
- `SceneInstance`: 게임 상태는 모두 씬이 가진다. 엔진이 프레임마다 부르는 순서는 다음과 같다.
  1. 플레이 중이면 `applyControls(controls)`: `Controls`는 키보드와 조이스틱을 합친 `forward`, `strafe`와 시점 회전 `lookX`, `lookY`다.
  2. 플레이 중이면 `FixedStepper`가 `fixedStep(dt)`를 120Hz로 부른다.
  3. `update(frameSeconds, alpha, playing)`: 일시 정지 중에도 부른다. 카메라 따라가기, 영상 소리 같은 프레임 단위 일.
  4. `frame(alpha)`가 돌려준 `FrameData`를 렌더러가 그린다.
- `debug`: 개발 서버에서 `window.__game`에 더해진다. 행성 씬은 `world`, `camera`를 넣는다. 엔진은 `scene`(씬 id), `app`, `input`, `gl`, `getState`를 넣는다.

### 그래픽 등록 (`engine/render/graphics.ts`의 `Graphics`)

| 함수 | 하는 일 |
|---|---|
| `defineMesh(kind, geometry)` | 이름으로 그릴 메시를 등록한다. `DrawItem.mesh`가 이 이름을 쓴다. `geometry`는 three.js `BufferGeometry`나 `GeometryData` |
| `defineSkinnedMesh(kind, geometry, skin)` | CPU 스키닝 메시를 등록한다. `DrawItem.skin`의 뼈 행렬로 그린다 (다리, 촉수) |
| `defineShader(kind, spec)` | 콘텐츠 셰이더(`ShaderSpec`)를 이름으로 등록한다. `DrawItem.material`이 `{ shader: kind, uniforms }`이면 이 셰이더로 그린다. `toon`은 바꿀 수 없다 |
| `setBillboardImages(images)` | 빌보드 아틀라스의 그림 목록(`BillboardImageDef`: 칸 크기, 프레임 수, 그리기 함수)을 바꾼다 |
| `loadBillboardImage(image, url)` | `draw`가 없는 그림을 파일에서 불러와 칸에 그린다 |
| `setSkybox(faces)` | 먼 배경 큐브맵의 여섯 면 캔버스. `null`이면 배경색만 |
| `addLayer(layer)` | 씬 셰이더로 그리는 `RenderLayer`(three.js 객체와 프레임마다의 `update`)를 빌보드 다음에 그린다 |
| `addVideoScreen(videoId, screenMesh, model, place)` | 등록한 메시 자리의 캔버스를 뚫고 뒤에 YouTube 영상을 놓는다 |

엔진 기본 메시는 `sphere`, `box`, `cylinder`뿐이다 (`frame.ts`의 `ENGINE_MESHES`). 등록되지 않은 이름을 그리면 콘솔에 한 번 알리고 빈 지오메트리로 그린다. 지오메트리 도우미(`arrayGeometry`, `triangleGeometry`, `latheGeometry`, `displacedSphereGeometry`, `mergeParts`)는 `engine/render/geometry.ts`에 있다.

`App.load(definition)`은 지금 씬의 `dispose`를 부르고 `Renderer.resetContent()`로 등록된 메시·스킨·셰이더·그림·배경·층·영상 화면을 모두 지운 뒤 새 씬을 만든다. 상태는 시작 화면으로 돌아간다.

### 정점 속성과 셰이더 (`engine/vertex.ts`, `engine/shader.ts`)

정점 속성과 셰이더는 엔진에 고정하지 않는다. 지오메트리는 이름 붙은 속성의 묶음이고, 셰이더는 자기가 읽는 속성의 모양을 밝힌다. 렌더러는 둘을 이름과 성분 수로만 맞춰 본다.

- `GeometryData { attributes, index? }`: 속성 이름마다 `VertexAttribute { array, itemSize(1~4), normalized? }`. 이름과 개수에 제한이 없다 (`position`, `normal`, `uv`, `color`, `aWeight` 같은). `position`이 없어도 된다 (정점 셰이더가 위치를 계산하는 경우). 등록할 때 `vertexCount`가 속성마다 정점 수가 같은지, 색인이 범위 안인지 검사한다.
- `VertexLayout`: 셰이더가 요구하는 속성 이름과 성분 수. 툰 셰이더는 `STANDARD_LAYOUT`(`position:3`, `normal:3`)이다.
- `ShaderSpec { vertexShader, fragmentShader, layout, uniforms?, blending?, depthWrite?, side? }`: GLSL 3.00 ES 원문. `modelMatrix`, `viewMatrix`, `projectionMatrix`와 `FRAME_UNIFORMS`(법선 행렬, 그림자, 카메라, 조명, 오클루전, 하프톤 칸)는 셰이더에 선언만 하면 엔진이 채운다. `uniforms`는 그리기 항목마다 따로 갖는 값과 기본값이다.
- `UniformValue`: 숫자·참거짓, 길이 2·3·4 배열(벡터), 길이 9·16 배열(열 우선 행렬). 텍스처 uniform은 아직 없다.
- `DrawItem.material`은 툰 재질 `Material`이나 `ShaderMaterial { shader, uniforms? }`이다 (`isShaderMaterial`로 가린다). 툰 재질은 `toonUniforms`로 툰 셰이더의 uniform이 된다.

렌더러(`engine/render/renderer.ts`)는 셰이더마다 메시 풀을 따로 두고, 그리기 항목을 재질의 셰이더 풀로 보낸다. 메시의 속성이 셰이더의 `layout`과 맞지 않거나, 그림자를 드리우는 항목에 `position`(3)이 없거나, 등록되지 않은 셰이더를 쓰면 그 항목은 그리지 않고 콘솔에 한 번만 알린다. 같은 지오메트리·셰이더 짝의 검사 결과는 기억해 둔다.

한계:

- 그림자 패스는 정점 셰이더를 쓰지 않고 `position`만 읽는다. 정점 셰이더가 정점을 움직이면 그림자는 움직이지 않는다.
- CPU 스키닝은 `position`, `normal`만 뼈로 옮기고, 나머지 속성(`uv` 같은)은 원본 배열을 그대로 쓴다.

### 엔진에 남긴 것

- 툰 셰이더(`engine/render/shaders/toon.frag`, `engine/render/toonShader.ts`)는 모든 씬이 함께 쓰는 기본 셰이더다. 재질 입력은 `Material`(`frame.ts`)이다. 콘텐츠가 툰 셰이더를 바탕으로 제 셰이더를 만들 때는 `MESH_VERTEX_SHADER`, `TOON_FRAGMENT_SHADER` 원문을 가져다 고친다.
- 툰 셰이더의 땅 무늬 `SurfacePattern.Dreamy`, `Gradient`는 행성 씬 전용이지만 툰 셰이더 안에 있어서 엔진에 남겼다. 씬마다 무늬를 바꾸려면 툰 셰이더에 조각을 끼우는 방법(`onBeforeCompile` 같은)이 필요하다.
- 조명 모델(`Environment`: 해·달빛·하늘·땅 앰비언트, 그림자 반경)과 캐릭터 오클루전(`occluder`)도 엔진의 약속이다.

## 행성 씬 (`content/planet/`)

| 파일 | 내용 |
|---|---|
| `index.ts` | `planetScene`. 캐릭터·행성 메시, 먼 우주 배경, 빌보드 그림, 비눗방울 층, 텔레비전 영상을 등록하고 `World`와 `CameraRig`를 돌린다 |
| `world.ts`, `planet.ts` | 월드 조립과 게임 규칙, 행성 크기 |
| `objects/` | 해, 위성, 우주인, 인공위성, 비눗방울 띠, 기차·연기, 외계인, 땅·지형물, 표면 장면 |
| `shapes/` | three.js 없이 계산하는 모양: 외계인, 위성, 로켓, 텔레비전, 접시 안테나, 신호 물결, 지형물 단면, 선로, 별, 햇살, 먼 우주 |
| `graphics/meshes.ts` | 행성 메시 등록 (`definePlanetMeshes`) |
| `graphics/billboardImages.ts` | 빌보드 그림 목록 (`PLANET_BILLBOARD_IMAGES`) |
| `graphics/bubbleLayer.ts` | 비눗방울 `RenderLayer` |
| `shaders/` | `bubble.vert`, `bubble.frag` |
| `scenes/surface.json`, `assets/` | 표면 객체 장면 파일, 우주인 스티커 그림 |

## 새 씬 추가 절차

1. `src/content/<씬>/index.ts`에 `SceneDefinition`을 만든다. `id`는 주소의 `?scene=` 값이 된다. 주소에 `?scene=`이 없으면 씬 대신 메인 페이지가 뜬다 ([home.md](home.md)).
2. `create`에서 필요한 그래픽을 등록한다. 캐릭터를 쓰면 `defineCharacterMeshes(graphics)`를 부른다. 엔진 기본 메시만 쓰면 등록할 것이 없다.
3. 게임 상태는 GPU 없이 테스트할 수 있게 `world.ts`와 `objects/`에 두고, `frame()`에서 `FrameData`로 바꾼다.
4. 새 셰이더는 `content/<씬>/shaders/`에 둔다. 메시에 입히는 셰이더는 `graphics.defineShader`로 등록하고 `DrawItem.material`에 `{ shader, uniforms }`를 넣는다. 셰이더가 새 정점 속성을 읽으면 그 속성을 가진 `GeometryData`를 `defineMesh`로 등록한다. 메시 단위로 나눌 수 없는 그리기(한 번에 많은 객체, 따로 정렬하는 투명 객체)는 `graphics/`의 `RenderLayer`로 그린다.
5. `src/content/index.ts`의 `SCENES`에 더한다. 첫째는 `?scene=`의 id를 찾지 못했을 때 쓰는 씬이다.
6. 메인 페이지에서 들어가게 하려면 `src/home/contents.json`의 빈 컷에 `"open": { "scene": "<id>" }`와 미리 보기를 넣는다.
7. 다른 씬과 함께 쓸 것이 생기면 `content/common/`으로 옮긴다.

## 브라우저 확인 (2026-11-24, 개발 서버)

| 항목 | 결과 |
|---|---|
| 시작 화면, 플레이, 이동 | 나누기 전과 같은 장면 (먼 우주, 위성, 우주인 스티커, 텔레비전 영상, 외계인, NPC, 비눗방울, 다리, 별, 궤적 고리) |
| `__game.app.load(findScene('planet'))` 두 번 | 새 `World`로 다시 그려지고, 영상 iframe은 하나만 남는다 |
| `gl.getError()`, 콘솔 오류 | 없음 |

확인하지 않은 것: 행성이 아닌 두 번째 씬(아직 없다), 실제 키보드·마우스 조작.

## 정점 속성 추상화 브라우저 확인 (2026-11-24, 개발 서버)

| 항목 | 결과 |
|---|---|
| 행성 씬 | 바꾸기 전과 같은 장면 |
| 개발 콘솔에서 `defineShader('vcolor', { layout: { position: 3, aColor: 4 } })`와 Uint8 정규화 `aColor`를 가진 `GeometryData` 삼각형 | 꼭짓점 색이 섞인 삼각형이 그려지고 `vcolor` 풀이 따로 생긴다 |
| 같은 삼각형을 툰 재질로 그리기 | 그리지 않고 `normal(3) 없음`을 한 번만 알린다 |
| `gl.getError()` | 0 |
