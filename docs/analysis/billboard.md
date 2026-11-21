# 빌보드 일괄 렌더링 분석

카메라를 보는 사각 빌보드(별, 햇살, 해 눈)를 한 목록으로 모아 한 번의 인스턴스 그리기로 그리는 렌더링 계층이다.

- **규칙:** 없음 ([rules/threejs.md](../rules/threejs.md)의 three.js 가져오기 범위는 지킨다)
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `cc0d160` (2026-11-21, 전체 문서 재검토)

## 바꾼 이유

도입 전에는 빌보드가 세 가지 방식으로 따로 그려졌다.

| 요소 | 도입 전 | 그리기 호출 |
|---|---|---|
| 별 48개 | 별마다 `Sprite` + `SpriteMaterial`(기울기가 재질 값이라 별마다 재질), `skyScene` | 48 |
| 햇살 | 삼각형 메시(`sunRays`)를 `World`가 계산한 빌보드 행렬로 툰 셰이더로 그림 | 1 |
| 해 눈 | 원판 메시(`disk`) 4개를 툰 셰이더로 그림 | 4 |

지금은 모두 `FrameData.billboards`에 담기고, `BillboardBatch`가 그리기 호출 하나로 그린다. 새 빌보드를 더할 때는 아틀라스에 그림을 하나 등록하고 `World.buildBillboards`에 한 줄을 추가하면 된다.

## 파일

| 파일 | 내용 |
|---|---|
| `engine/billboard.ts` | `Billboard`(위치, 크기, 화면 안 회전, 그림, 색, 톤 매핑 여부), 그림 목록 `BILLBOARD_IMAGES`, 아틀라스 배치(`packAtlas`), 텍스처 좌표(`atlasUv`), 그리기 순서(`backToFrontOrder`). three.js를 쓰지 않는다 |
| `engine/billboardAtlas.ts` | 그림을 한 캔버스에 그린다(`drawBillboardAtlas`). 브라우저에서만 호출한다 |
| `engine/billboardRenderer.ts` | `BillboardBatch`. 아틀라스 텍스처, 사각형 하나의 `InstancedBufferGeometry`, 인스턴스 속성, `RawShaderMaterial` |
| `shaders/billboard.vert`, `shaders/billboard.frag` | 빌보드를 카메라 쪽으로 세우고, 아틀라스를 읽어 색을 곱하고, 필요하면 ACES 톤 매핑을 건다 |
| `engine/frame.ts` | `FrameData.billboards` |
| `game/world.ts` | `buildBillboards(alpha, view)`. 별(한 번만 만든 목록), 햇살, 눈 흰자·검은자 |
| `engine/renderer.ts` | `billboardScene`에 배치 메시 하나를 넣고 메인 장면 뒤에 그린다 |
| `engine/billboard.test.ts` | 아틀라스 칸 크기·겹침·여백, 텍스처 좌표, 햇살 칸, 그리기 순서 |

## 세부

- **아틀라스:** 그림은 `sunRays`(512px), `starFace` 프레임 4개(256px), `disk`(128px)다. 큰 칸부터 가로 1024px 안에서 줄을 채운다. 지금 배치는 928×784px다. 칸 둘레에 4px를 비워 밉맵에서 이웃 칸이 번지지 않게 하고, 텍스처 좌표는 반 픽셀 안쪽으로 잡는다. `colorSpace = SRGBColorSpace`라 셰이더는 선형 색을 읽는다.
- **흰 그림과 색:** `disk`와 `sunRays`는 흰색으로 그려 두고 빌보드의 `color`가 색을 정한다. 별 얼굴은 색이 있는 그림이라 `color`가 [1, 1, 1]이다.
- **톤 매핑:** `toneMapped`를 켠 빌보드는 `toon.frag`와 같은 ACES를 거친다. 햇살과 해 눈은 툰 발광색(`SUN_EMISSIVE`, `SUN_EYE_WHITE_EMISSIVE`)을 그대로 넣어 해 구체와 같은 색으로 보인다. 별은 끄므로 도입 전 `SpriteMaterial`(톤 매핑 없음)과 같은 색이다. 끝에 sRGB로 바꾼다.
- **세우는 축:** 셰이더가 빌보드마다 `z = 카메라 위치 - 빌보드 위치`, `x = cross(카메라 위쪽, z)`, `y = cross(z, x)`로 세운다. `game/sunFace.ts`의 `sunBillboardBasis`와 같은 식이라, `World`가 그 축으로 놓은 눈 위치가 해 얼굴 위 제자리에 온다. 둘 중 하나를 바꾸면 다른 쪽도 바꾼다.
- **크기와 회전:** 사각형 정점에 `size`를 곱한 뒤 화면 안에서 `rotation`만큼 돌린다. 가로가 음수면 좌우가 뒤집히므로 재질은 양면(`DoubleSide`)이다.
- **순서와 깊이:** 매 프레임 카메라에서 먼 것부터 인스턴스 속성을 채운다(빌보드 50여 개). 재질은 `transparent`이고 깊이를 쓴다. 알파 0.01 미만은 버려서 칸의 투명한 부분이 깊이를 쓰지 않는다. 불투명한 메인 장면 뒤에 그리므로 행성·위성·해 구체가 깊이 검사로 그 뒤의 빌보드를 가린다.
- **그림자:** `billboardScene`은 그림자 패스에 들어가지 않는다. 도입 전에도 별·햇살·눈은 그림자를 드리우지 않았다.
- **용량:** 인스턴스 속성은 64개로 시작해 모자라면 두 배로 다시 만든다. 화면 밖 제외는 끈다(정점 위치를 셰이더가 정한다).
- **도입 전과 다른 점:** 햇살은 삼각형 메시에서 아틀라스 그림이 되었다. 아주 가까이서 보면 가장자리가 512px 그림의 해상도로 보인다. 해 눈의 검은자는 툰 조명 대신 거의 검은 색에 톤 매핑만 건다. 별은 화면 평면 정렬(`Sprite`)에서 카메라 위치를 향하는 정렬로 바뀌었고, 화면 가장자리에서만 아주 조금 다르다.

## 테스트

`engine/billboard.test.ts`(위 표), `game/game.test.ts`의 "해": 햇살 빌보드가 해 가운데에 있고 가장 긴 햇살까지 덮음, 눈 4개가 해 구면 앞에 있고 검은자가 흰자보다 카메라 쪽, 별 개수와 톤 매핑 꺼짐.

## 브라우저 확인 (2026-11-21, 개발 서버)

| 항목 | 결과 |
|---|---|
| 시작 화면 | 별 얼굴이 보이고, 위성이 그 뒤의 별을 가림 |
| 해 가까이 | 햇살 색이 해 구체와 같음. 흰자 위에 검은자. 해 뒤의 별을 해 구체와 햇살이 가림 |
| 플레이 시점 | 캐릭터, 집 자리·로켓 자리, 별 정상 |
| `gl.getError()`, 콘솔 오류 | 0, 없음 |

확인하지 않은 것: 실제 키보드·마우스 플레이 중 체감, 프레임 시간 비교, 공개 URL.
