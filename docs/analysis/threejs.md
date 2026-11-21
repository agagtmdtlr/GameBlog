# three.js 적용 분석

자체 WebGL2 엔진을 three.js로 옮기면서 무엇을 three.js에 맡기고 무엇을 남겼는지 정리한 문서다.

- **규칙:** [rules/threejs.md](../rules/threejs.md)
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `cc0d160` (2026-11-21, 전체 문서 재검토)
- **버전:** `three` 0.187.0, `@types/three` 0.187.0 (개발용)
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline cc0d160..HEAD -- src/engine src/shaders src/main.ts package.json
```

"포팅 방침", "바뀐 파일", "대응표", "포팅 중 확인한 점", "결과", 2026-11-15 브라우저 확인은 포팅 당시의 기록이다. 물이 든 구, 발판, 자체 엔진 파일처럼 지금은 없는 것이 나온다. 현재 구조는 "렌더러 구조"를 본다.

## 포팅 방침

- 화면 결과와 플레이는 포팅 전과 같게 유지한다. 그래서 PBR과 물 셰이더는 내용을 그대로 두고 three.js의 `RawShaderMaterial`로 옮겼다.
- WebGL 호출을 직접 하던 부분(컨텍스트, 프로그램, 버퍼, 프레임버퍼, 상태 전환)은 모두 three.js에 맡겼다. `src/`에 `gl.*` 호출은 남아 있지 않다.
- three.js는 `engine/renderer.ts`, `engine/billboardRenderer.ts`, `engine/contentRenderers/`, `main.ts`에서만 가져온다. `World`, 물리, 콘텐츠는 three.js를 모른다.

## 바뀐 파일

| 파일 | 변경 |
|---|---|
| `engine/renderer.ts` | three.js로 다시 작성 |
| `engine/frame.ts` | 새 파일. `FrameData`, `DrawItem`, `Material` 등 렌더러 입력 타입을 three.js와 분리해 둔 곳 |
| `engine/gl.ts`, `engine/shader.ts` | 삭제. `WebGLRenderer`가 대신한다 |
| `engine/mesh.ts`, `engine/mesh.test.ts` | 삭제. three.js 기본 지오메트리를 쓴다 |
| `shaders/depth.vert`, `shaders/depth.frag` | 삭제. 그림자 패스는 `MeshBasicMaterial`로 그린다 |
| `shaders/mesh.vert` | 속성과 행렬 이름을 three.js 규약으로 변경 |
| `shaders/pbr.frag`, `shaders/water.frag` | `#version` 줄만 제거 |
| `game/cameraRig.ts` | `viewProjection()` 대신 `view`(위치, 대상, 시야각)를 제공 |
| `game/world.ts` | 타입 가져오는 경로만 `engine/frame`으로 변경 |
| `main.ts` | WebGL2 확인, 렌더러 생성, 컨텍스트 손실 처리 변경 |

`engine/math.ts`, `engine/input.ts`, `physics/`, `content/`, `ui/`는 바뀌지 않았다.

## 대응표

| 포팅 전 (자체 엔진) | 포팅 후 (three.js) |
|---|---|
| `canvas.getContext('webgl2')` | `new WebGLRenderer({ canvas, alpha: false, antialias: true })` |
| WebGL2 미지원 시 `null` 확인 | `three/addons/capabilities/WebGL.js`의 `isWebGL2Available()` |
| `ShaderProgram` (컴파일, 링크, uniform 위치 캐시) | `RawShaderMaterial` (`glslVersion: GLSL3`) |
| `uploadMesh`의 VAO와 버퍼 | `SphereGeometry(1, 96, 64)`, 표면 장면 객체(집·로켓 자리, [analysis/surfaceScene.md](surfaceScene.md))의 `BoxGeometry(1, 1, 1)`(2026-11-21), 로켓 모형의 `LatheGeometry`·`CapsuleGeometry`·`TorusGeometry`·`SphereGeometry`를 `mergeGeometries`로 합친 것과 창 유리 `CircleGeometry`(2026-11-21), 해 궤적의 `TorusGeometry`(2026-11-21, [analysis/sun.md](sun.md)), 위성의 `IcosahedronGeometry` + `mergeVertices`(2026-11-21, [analysis/moon.md](moon.md)), `GLTFLoader`로 불러온 캐릭터 다리 부품(2026-11-21, [analysis/character.md](character.md)). 포팅 직후에는 `BoxGeometry`도, 발판에는 `CylinderGeometry`도 썼으나 행성과 표면 작동 영역으로 바꾸면서 뺐다 |
| `DrawItem` 배열을 순서대로 `drawElements` | `Scene`에 넣은 `Mesh` 풀. 프레임마다 행렬과 uniform을 덮어쓴다 |
| `viewProj` 행렬을 uniform으로 전달 | `PerspectiveCamera`. 셰이더는 `projectionMatrix * viewMatrix`를 쓴다 |
| `computeLightViewProj` | `OrthographicCamera`를 광원 위치에 두고 원점을 보게 한다 |
| 깊이 텍스처와 프레임버퍼 | `WebGLRenderTarget` + `DepthTexture` (`compareFunction = LessEqualCompare`) |
| `depth` 프로그램 | `scene.overrideMaterial = MeshBasicMaterial({ colorWrite: false, polygonOffset… })` |
| `castShadow`가 아니면 건너뛰기 | 레이어 1에 그림자 메시만 넣고, 광원 카메라가 레이어 1만 본다 |
| `copyTexSubImage2D`로 장면 복사 | `FramebufferTexture` + `renderer.copyFramebufferToTexture()` |
| `gl.enable(BLEND)`, `depthFunc(LEQUAL)` | 물 재질의 `transparent: true`, `depthWrite: false` (깊이 함수 기본값이 `LessEqualDepth`) |
| 컨텍스트 손실 시 렌더러 폐기와 재생성 | `WebGLRenderer`가 내부에서 복구한다. 렌더러는 한 번만 만든다 |
| 셰이더 오류 시 예외 | `renderer.debug.onShaderError` 콜백으로 안내 화면을 띄운다 |

## 렌더러 구조

`Renderer`는 장면 하나와 카메라 두 개를 가지고, 콘텐츠 전용 그리기는 `engine/contentRenderers/`의 `ContentRenderer`들에 맡긴다 (포팅 직후에는 물이 든 구도 `Renderer` 안에 있었고, 물이 든 구와 달아오른 구는 2026-11-17에 지웠다). 인터페이스는 [analysis/content.md](content.md)의 "콘텐츠 렌더러"에 있다.

- `scene`: `DrawItem`마다 `Mesh` 하나. 메시 풀은 필요한 만큼 늘어나고, 남는 메시는 `visible = false`로 숨긴다.
- 콘텐츠 렌더러는 필요하면 자기 장면을 가진다. 지금은 등록된 렌더러가 없다.
- `camera`: `CameraRig.view`의 값으로 매 프레임 갱신하는 `PerspectiveCamera`. 행성 위에서는 위쪽이 계속 바뀌므로 `lookAt` 전에 `camera.up`도 갱신한다
- `billboardScene`: 별, 햇살, 해 눈을 한 번에 그리는 `BillboardBatch`의 메시 하나만 가진 장면. 그림자 패스에 넣지 않으려고 분리했다. 구조는 [analysis/billboard.md](billboard.md)에 있다 (2026-11-21, 그 전에는 별 `Sprite`만 가진 `skyScene`이었다)
- `lightCamera`: 그림자용 `OrthographicCamera`. 광원 방향은 해를 따라 매 프레임 바뀌고([analysis/sun.md](sun.md)), 방향이 +Y와 거의 나란하면 `lookAt`이 퇴화하지 않게 위쪽을 +Z로 바꾼다

프레임 순서는 포팅 전과 같다. `renderer.autoClear = false`로 두고 지우기를 직접 호출한다.

1. `setRenderTarget(shadowTarget)` → `clear()` → `overrideMaterial`을 걸고 `render(scene, lightCamera)`
2. `setRenderTarget(null)` → `setClearColor` → `clear()` → `render(scene, camera)` → `render(billboardScene, camera)`(빌보드, [analysis/billboard.md](billboard.md))
3. `frame.contents`에 값이 있는 콘텐츠 렌더러마다 `render()`. 뒤 장면이 필요한 렌더러는 `copySceneColor()`(`copyFramebufferToTexture`) → `render(자기 장면, camera)` 순서로 그린다

### 행렬

모델 행렬과 법선 행렬은 `World`가 계산한 값을 그대로 쓴다. 메시는 `matrixAutoUpdate = false`이고, `mesh.matrix.fromArray(item.model)` 뒤에 `matrixWorldNeedsUpdate = true`를 켠다. three.js의 `normalMatrix`는 뷰 공간 기준이라 쓰지 않고, 월드 공간 법선 행렬을 `uNormalMatrix`로 따로 넘긴다.

### uniform

- 조명, 카메라 위치, 광원 행렬처럼 프레임 단위인 값은 `{ value }` 객체 하나를 모든 재질이 함께 참조한다. 한 번 고치면 모든 재질에 반영된다.
- 색, 거칠기, 무늬 같은 값은 메시마다 재질을 따로 만들어 넣는다. 셰이더 소스가 같으므로 GPU 프로그램은 three.js가 하나로 공유한다.
- `uPattern`(int)과 `uShadowMap`(sampler2DShadow)은 three.js가 프로그램의 uniform 타입을 읽어 알맞은 함수로 올린다.

### 셰이더 규약

`RawShaderMaterial`에 `glslVersion: GLSL3`를 주면 three.js가 `#version 300 es`만 붙인다. 나머지는 직접 선언한다.

- 속성 이름은 `position`, `normal`이다 (지오메트리 속성 이름과 같아야 한다).
- `modelMatrix`, `viewMatrix`, `projectionMatrix`는 선언만 하면 three.js가 채운다.
- 프래그먼트 출력은 `out vec4 fragColor`를 직접 선언한다.
- 셰이더 파일에 `#version`을 쓰면 중복되어 컴파일이 실패한다.

### 색공간과 톤 매핑

three.js의 톤 매핑과 출력 색공간 변환은 내장 재질과 셰이더 청크에만 적용된다. `RawShaderMaterial`에는 적용되지 않으므로, 포팅 전처럼 셰이더 안에서 ACES와 sRGB 변환을 한다. `renderer.toneMapping`은 기본값(`NoToneMapping`)이다.

배경색은 sRGB 출력값이다. three.js는 지우기 색을 작업 색공간에서 출력 색공간으로 변환하므로, `Color.setRGB(r, g, b, SRGBColorSpace)`로 넣어 값이 그대로 나오게 한다.

## 포팅 중 확인한 점

- **장면 복사 형식:** 캔버스가 `alpha: false`라 RGBA 텍스처로는 복사할 수 없다. `FramebufferTexture.format = RGBFormat`만 주면 three.js가 크기 없는 `RGB` 내부 형식으로 `texStorage2D`를 호출해 `INVALID_ENUM`이 난다. `internalFormat = 'RGB8'`을 함께 지정해야 한다.
- **필터 기본값:** `DepthTexture`와 `FramebufferTexture`는 기본 필터가 `NearestFilter`다. 그림자의 하드웨어 PCF와 굴절 배경에는 `LinearFilter`를 지정한다.
- **그림자 타깃:** `WebGLRenderTarget`은 색 첨부를 항상 만든다. 깊이만 쓰는데도 2048×2048 RGBA8(약 16MB)이 추가로 잡힌다. `count: 0`은 0.187 기준 WebGPURenderer 전용이다.
- **셰이더 경고:** three.js가 프로그램 로그를 콘솔에 출력하면서, Windows(ANGLE)에서 `pbr.frag`의 PCF 반복문에 대한 `X3595` 경고가 보인다. 셰이더 내용은 포팅 전과 같고(전에는 로그를 출력하지 않았다) 동작에는 영향이 없다.
- **내장 그림자를 쓰지 않은 이유:** `renderer.shadowMap`은 내장 조명과 재질을 전제로 한다. 셰이더를 그대로 쓰기 위해 그림자 패스를 직접 구성했다.

## 결과

| 항목 | 포팅 전 | 포팅 후 |
|---|---|---|
| TypeScript (테스트 제외) | 1,746줄 | 1,620줄 |
| 셰이더 | 369줄 (5개) | 355줄 (3개) |
| 자동 테스트 | 53개 | 45개 (메시 테스트 8개 삭제) |
| 빌드 JS | 37.49KB (gzip 13.86KB) | 562.65KB (gzip 143.92KB). 기능이 늘어 `cc0d160` 기준 674.54KB (gzip 176.19KB) |

빌드 크기가 약 15배 늘었다. 0.187의 `WebGLRenderer`는 내장 재질과 셰이더 청크를 함께 포함하므로 이름으로 가져와도 크게 줄지 않는다.

## 브라우저 확인 (2026-11-15, 개발 서버)

| 항목 | 결과 |
|---|---|
| 시작 화면, 그림자, 격자, 구 줄무늬 | 포팅 전과 같은 모습 |
| 코랄 발판 | 구 색과 HUD 변경 |
| 블루 발판 | 물이 차오르는 중간, 완료, 이동 시 수면 기울기, 코랄로 복귀 정상 |
| Esc 일시 정지 | 일시 정지 화면 전환 |
| 컨텍스트 손실과 복구 (`WEBGL_lose_context`) | 복구 후 물이 든 구까지 정상 |
| `gl.getError()`, 콘솔 오류 | 없음 |

확인하지 않은 것: 실제 키보드·마우스 조작, 공개 URL, 프레임 시간 비교.

## 남은 일

- `engine/math.ts`의 `mat4Perspective`, `mat4LookAt`, `mat4Ortho`, `mat4TransformPoint`, `quatMultiply`, `quatNormalize`, `quatNlerp`, `quatFromUnitVectors`는 다른 런타임 코드에서 쓰지 않고 테스트만 남아 있다. `mat4Multiply`는 캐릭터 스키닝 행렬에 쓴다.
- 빌드 JS가 500KB를 넘어 Vite가 청크 크기 경고를 낸다.
- 조명과 재질을 three.js 내장(`MeshStandardMaterial`, `DirectionalLight`, `renderer.shadowMap`)으로 바꾸면 코드는 더 줄지만, 줄무늬·격자 무늬, 해석적 앰비언트 오클루전, 커스틱을 `onBeforeCompile`로 다시 넣어야 하고 화면이 달라진다.
