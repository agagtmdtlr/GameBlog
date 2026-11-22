# 우주인 스티커 분석

바위 위성(달) 곁에 떠 있는, 잡지에서 오린 스티커 꼴의 우주인 그림의 구조다.

- **규칙:** 없음
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `912a036` 위의 `feature/astronaut-sticker` 작업 (2026-11-22)

## 동작

- 사용자가 준 우주인 사진(의자에 기대어 떠 있는 우주복 차림)을 3D로 만들지 않고 그대로 쓴다. 잡지에서 오려 붙인 스티커처럼 보이게 다듬은 그림을 카메라를 보는 빌보드로 붙인다 (2026-11-22 사용자 요청).
- 위성 중심에서 `ASTRONAUT.offset`(시작 지점 쪽 앞, 오른쪽)만큼 떨어져 있다. 시작 화면에서 위성 오른쪽 가장자리에 겹쳐 그 앞에 떠 보인다.
- 한 변 7인 정사각 빌보드다. 7초 주기로 행성 바깥쪽으로 ±0.45 둥실거리고, 기본 -0.18라디안 기운 채 11초 주기로 ±0.1라디안 기우뚱한다.
- 조명과 톤 매핑을 받지 않아 사진 색 그대로다(별 얼굴과 같다). 밤에도 밝다.
- 빌보드라 늘 카메라를 정면으로 보고, 깊이 검사로 위성 뒤에 있을 때는 위성에 가린다. 위성 중심에서 스티커 대각선 절반과 둥실거림을 더해도 위성 반지름보다 멀어 위성 속에 묻히지 않는다.
- `World.fixedStep`에서만 시간이 흐르므로 시작 화면과 일시 정지 중에는 멈춘다. 충돌은 없다.

## 스티커 그림

`src/assets/astronaut-sticker.png`(512×512, 투명 배경)는 `tools/sticker/make_astronaut_sticker.py`가 원본 `tools/sticker/astronaut-source.png`(466×580)에서 만든다. 같은 입력이면 같은 파일이 나온다 (고정 씨앗).

1. 균일한 배경색(245, 245, 247)을 가장자리부터 채워 우주인만 남긴다. 닫힌 틈은 남는다.
2. 둘레를 약 11px 넓히고, 외곽선을 따서 곧은 선분으로 줄인 뒤 조금 흔들어 가위로 오린 종이 테두리를 만든다.
3. 사진을 조금 따뜻하고 흐리게 바꾸고 인쇄 입자를 더한다. 종이는 미색에 결과 옅은 접힘 음영이 있다.
4. 오른쪽 아래로 옅은 그림자를 드리워 붙인 느낌을 낸다.

그림을 바꾸려면 스크립트를 고쳐 다시 만들거나, 같은 이름의 투명 PNG로 바꾼다. 칸에 넣을 때 가로세로 비를 지켜 가운데에 맞춘다.

## 파일

| 파일 | 내용 |
|---|---|
| `game/astronaut.ts` | `ASTRONAUT` 상수(자리, 크기, 둥실거림, 기울기), `FloatingAstronaut`(`step`, `billboard(alpha)`) |
| `game/world.ts` | `World.astronaut`를 `fixedStep`에서 진행하고, `buildBillboards`에 스티커 빌보드를 넣는다 |
| `engine/billboard.ts` | 그림 `astronaut`(512px 칸)와 파일에서 불러오는 그림 목록 `FILE_BILLBOARD_IMAGES` |
| `engine/billboardAtlas.ts` | `astronaut` 칸은 처음에 비워 두고, `drawImageIntoCell`이 불러온 그림을 칸에 그린다 |
| `engine/billboardRenderer.ts` | `BillboardBatch.loadImage`: 그림을 불러와 아틀라스 캔버스에 그리고 텍스처를 다시 올린다 |
| `engine/renderer.ts` | `loadBillboardImage`가 `BillboardBatch.loadImage`를 부른다 |
| `main.ts` | `assets/astronaut-sticker.png?url`을 `loadBillboardImage('astronaut', …)`로 불러온다. 실패하면 콘솔에만 남기고 플레이는 계속한다 |
| `tools/sticker/` | 원본 사진과 스티커를 만드는 스크립트 |

## 테스트

`game/game.test.ts`의 "우주인 스티커": 빌보드가 하나이고 위성에 묻히지 않는 거리에 있음, 톤 매핑 꺼짐과 흰 색, 시간이 흐르면 둥실거리고 기울기가 바뀜.

## 브라우저 확인 (2026-11-22, 개발 서버)

| 항목 | 결과 |
|---|---|
| 시작 화면 | 위성 오른쪽 가장자리에 흰 종이 테두리의 우주인 스티커가 겹쳐 보임. 가위로 오린 듯한 각진 테두리와 붙인 그림자가 보임 |
| 그림 불러오기 | 시작 직후 칸이 채워져 보임 |
| `gl.getError()` | 0, 콘솔 오류 없음 |

확인하지 않은 것: 실제 플레이 중 여러 각도에서 본 모습, 공개 URL.
