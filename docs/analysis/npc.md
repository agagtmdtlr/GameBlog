# NPC 구조 분석

행성 위를 혼자 돌아다니는 NPC들의 구조다. 다리와 걸음은 플레이어 캐릭터와 같고, 마리마다 색과 몸 모양(구, 정육면체, 피라미드)이 다르다.

- **규칙:** 없음. 모양과 걸음은 [rules/character.md](../rules/character.md)를 따른다
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** 커밋 `649f5c7` 위의 `feature/wandering-npc` (2026-11-21, 처음 추가), `feature/more-npcs`에서 5마리로 늘림, `feature/npc-shapes`에서 몸 모양 추가, `feature/npc-greeting`에서 인사 말풍선 추가
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline 649f5c7..HEAD -- src/content/common/character/npc.ts src/content/planet/npc.test.ts src/content/common/character/bodyShape.ts src/content/planet/bodyShape.test.ts src/content/planet/world.ts src/content/common/character/speechBubble.ts
```

## 흐름

| 단계 | 파일 | 하는 일 |
|---|---|---|
| 행동 | `content/common/character/npc.ts`의 `Wanderer` | 쉬기와 걷기를 되풀이한다. 쉬는 시간이 끝나면 지금 위치에서 아무 방향으로 표면 거리 6~13.5(4~9 × `CHARACTER_SCALE`) 떨어진 목표를 고른다 |
| 물리 | `content/common/character/player.ts`의 `Player` | 플레이어와 같은 몸체. 입력 대신 목표 쪽 접선 방향 × `WANDER_EFFORT`(0.32)를 받아 최고 속도가 약 3.4다(플레이어 약 10.6). 텔레비전·로켓 자리 상자와 충돌한다 |
| 걸음 | `content/common/character/walker.ts`의 `Walker` | 플레이어와 같은 클래스. 물리 결과로 서기·걷기 클립과 발을 정한다. 엉덩이 관절 자리(`WalkerHip`)만 몸 모양에 맞춰 생성자로 받는다 |
| 몸 모양 | `content/common/character/bodyShape.ts`의 `BODY_FORMS` | 모양마다 메시, 크기 [오른쪽, 위, 앞], 몸 중심에서 메시 중심까지 올림(`lift`), 엉덩이 자리를 정한다 (아래 표) |
| 밀어내기 | `content/common/character/npc.ts`의 `separateBodies` | 두 캐릭터 몸체가 겹치면 반씩 밀어내고 다가가는 속도를 없앤다. 튕기지 않는다. 월드는 플레이어와 모든 NPC의 모든 쌍에 한 번씩 부른다 |
| 월드 | `content/planet/world.ts` | 목록 `NPCS`(시작 위치, 색, 몸 모양)로 `World.npcs`를 만든다. `fixedStep`에서 플레이어 이동 → NPC마다 `notice`(인사 판정)와 `move` → 모든 쌍 `separateBodies` → 플레이어 `walker.step` → NPC마다 `animate` 순서다. 그리기 목록에서 플레이어 몸·다리 다음에 NPC마다 몸·다리를 제 색으로 넣는다. 모난 몸은 `Walker.hipAxes`(엉덩이 기울기를 넣은 오른쪽·위 축)로 진행 방향을 보고 엉덩이와 함께 기운다. 기저는 [오른쪽, 위, 뒤]로 오른손 기저라 면의 감김이 뒤집히지 않는다 |
| 메시 | `content/common/character/characterGraphics.ts`의 `createPyramidGeometry` | 상자처럼 한 변 1인 사각뿔(밑면 y = -0.5, 꼭짓점 y = 0.5). 면마다 정점을 따로 두어 모서리가 각지다. 정육면체는 기존 `box` 메시를 쓴다 |

- 문어 외계인([analysis/alien.md](alien.md))도 `Wanderer`로 돌아다니고, `World.bodies`에 들어가 밀어내기 대상이 된다. `fixedStep`에서 NPC 다음에 `move`, `animate`를 부른다.

## 값

| 항목 | 값 |
|---|---|
| 목록 `NPCS` | 5마리. 위도·경도, 색(sRGB), 모양: (70, 128) 하늘색 #4FB0F0 정육면체, (45, 70) 분홍 #F0709C 피라미드, (10, 290) 초록 #6CCB5F 구, (-25, 10) 보라 #A57CE8 정육면체, (-60, 200) 주황 #F08A3C 피라미드. 첫째만 시작할 때 보이는 텔레비전 오른쪽 옆이고(텔레비전을 두 배로 키우면서 (74, 145)에서 옮김, 2026-11-22) 나머지는 행성 둘레에 흩어 있다. 로켓 자리는 위도 30, 경도 207.5 |
| 거칠기 | 플레이어와 같은 `PLAYER_ROUGHNESS` |
| 쉬는 시간 | 1.2~3.5초. 도착하거나 한 목표를 12초 넘게 걸으면 쉰다 |
| 도착 | 목표까지 표면 거리 0.9 이내 |
| 막힘 | 걷기 시작 0.8초 뒤부터 수평 속도가 0.6보다 느린 상태가 0.8초 이어지면 0.6~1.2초 쉬고 다른 목표를 고른다 (벽, 플레이어에 막힘) |

## 몸 모양 (`BODY_FORMS`, 배율 1 기준이며 `CHARACTER_SCALE`을 곱한다)

몸 모양은 2026-11-21 사용자 요청으로 구, 정육면체, 삼각형 꼴(사각뿔 피라미드, 앞과 옆에서 삼각형으로 보인다)을 섞었다. 플레이어는 구 그대로다.

| 모양 | 메시 | 크기 | 엉덩이 (옆, 위) | 비고 |
|---|---|---|---|---|
| 구 | `sphere` | 반지름 0.5 | 0.35, 0.33 | 플레이어와 같다 (`SPHERE_HIP`) |
| 정육면체 | `box` | 한 변 0.84 | 0.35, 0.33 | 엉덩이 자리가 구와 같아도 상자 안이다 |
| 피라미드 | `pyramid` | 밑변 1.24, 높이 1.25, 올림 0.125 | 0.33, 0 | 밑면이 몸 중심 아래 0.5(구의 바닥)에 놓이고 꼭짓점이 위다. 위로 갈수록 좁아 몸 중심 높이(폭 ±0.372)에 다리를 붙인다 |

- 엉덩이 자리가 구와 다르면 IK가 푸는 서 있는 자세가 다리 메시의 기본 자세와 조금 달라 스키닝 변형이 약간 커진다. 피라미드에서 눈에 띄는 문제는 없었다.
- 몸 모양은 물리에 영향이 없다. 충돌은 모양과 상관없이 반지름 1.32의 구다.

- 난수는 `World` 생성자의 세 번째 인자(`Random`)로 바꿀 수 있다. 기본은 `Math.random`이고, 테스트는 `seededRandom(시드)`로 같은 길을 재현한다.
## 인사 말풍선 (2026-11-22 사용자 요청)

플레이어가 다가가면 NPC가 멈춰 서서 머리 위에 인사말 말풍선을 띄운다.

| 단계 | 파일 | 하는 일 |
|---|---|---|
| 판정 | `content/common/character/npc.ts`의 `Wanderer.notice` | 플레이어 몸 중심과의 직선 거리가 `GREET_DISTANCE`(4.5 = 3 × `CHARACTER_SCALE`) 안이면 인사를 시작하고, 인사하는 중에는 `GREET_LEAVE_DISTANCE`(6)보다 멀어져야 그친다. 몸이 맞닿는 거리는 2.64다 |
| 멈춤 | `Wanderer.decide` | 인사하는 동안 입력 없이 서 있다(지면 감쇠로 1~2초에 걸쳐 멈춤). 목표는 그대로 두고, 그친 뒤 다시 걷는다. 멈춘 시간은 막힘·시간 초과로 세지 않는다 |
| 나타남 | `greetAmount` | 인사하면 0.3초에 걸쳐 1로, 그치면 0.2초에 걸쳐 0으로 일정하게 움직인다. 이전 값을 들고 있어 `greetAmountAt(alpha)`가 보간한다 |
| 빌보드 | `content/planet/world.ts`의 `greetingBillboards` | `greetAmount`가 0보다 크면 `speechBubble` 빌보드 하나를 `buildBillboards`에 넣는다. 크기는 한 변 2.55(1.7 × 배율) × 튀어나오는 곡선 `popOut`(조금 넘쳤다 돌아옴). 꼬리 끝을 몸 중심 위 1.425(0.95 × 배율, 무릎과 피라미드 꼭짓점보다 위)에 고정하고 그 위로 키운다. 인사말은 NPC 순서대로 `GREETINGS`를 돌려 쓴다 |
| 그림 | `content/common/character/speechBubble.ts` | `GREETINGS`(안녕!, 반가워!, 하이~, 어서 와!, 안녕하세요!)와 `drawSpeechBubble`. 256px 칸 가운데 줄(위 20%~아래 70%)에 흰 둥근 사각형, 진한 테두리(#1F2330), 아래로 내민 꼬리(끝 90%, `SPEECH_BUBBLE_TAIL`), 굵은 글자를 그린다. 글자는 풍선 안 폭의 80%에 맞춰 줄인다. 글꼴은 `style.css`와 같은 목록이라 기기마다 다를 수 있다 |

- 말풍선은 빌보드라 카메라를 보고, 톤 매핑을 끄고 흰색 그대로 보인다. 화면의 위쪽은 카메라 위쪽이라 행성 반대편에서는 풍선과 머리 사이가 조금 비스듬할 수 있다.
- 인사말을 바꾸거나 더하려면 `GREETINGS`만 고친다. 아틀라스 프레임 수가 따라 바뀐다.

- 해의 눈과 앰비언트 오클루전(`occluder`)은 플레이어만 따른다.

## NPC 추가·변경

- 수, 색, 시작 위치, 몸 모양: `world.ts`의 `NPCS`에 `npcAt(위도, 경도, 선형 RGB, 'sphere' | 'cube' | 'pyramid')` 줄을 더하거나 뺀다. `npc.test.ts`가 시작 위치가 장애물·플레이어·서로와 겹치지 않는지(서로 간격은 충돌 구 반지름의 4배 넘게), 색이 모두 다른지 확인한다.
- 인사 거리, 말풍선 크기·높이: `npc.ts`의 `GREET_DISTANCE`, `GREET_LEAVE_DISTANCE`, `world.ts`의 `GREETING_SIZE`, `GREETING_TIP_HEIGHT`.
- 새 몸 모양: `bodyShape.ts`의 `BodyShape`와 `BODY_FORMS`에 더하고, 새 메시가 필요하면 `characterGraphics.ts`의 `defineCharacterMeshes`에서 `graphics.defineMesh`로 등록한다. `bodyShape.test.ts`의 `inside`에 그 모양의 안쪽 판정을 더하면 엉덩이가 몸 안에 있는지 확인된다.
- 걷는 빠르기, 거리, 쉬는 시간: `npc.ts` 맨 위 상수. 거리 값은 `CHARACTER_SCALE`을 곱한다.
- 비용: 다리 스키닝은 CPU라 마리마다 매 프레임 정점 674개 × 2를 더 계산하고, 그리기 항목이 3개씩 는다. 밀어내기는 모든 쌍이라 수의 제곱으로 는다. 수십 마리 넘게 늘리려면 둘 다 다시 봐야 한다.

## 테스트

`content/planet/npc.test.ts`: 시작 위치가 장애물·플레이어·서로와 겹치지 않고 색이 다른지, 40초 동안 목표를 여러 번 고르며 표면을 벗어나거나 상자를 뚫지 않고 산책 속도로 걷는지, 도착하면 숨쉬기 자세로 돌아가는지, 같은 시드면 같은 길인지 확인한다. 밀어내기가 겹침과 다가가는 속도를 없애는지, 월드에서 플레이어가 NPC를 통과하지 못하는지, 1분 동안 NPC끼리 서로 통과하지 않는지, 그리기 목록에 NPC마다 제 색과 제 모양 메시의 몸 하나와 다리 둘이 더해지는지도 확인한다.

`content/planet/npc.test.ts`의 "NPC 인사": 멀면 인사하지 않고 가까우면 말풍선이 다 나타나며 멈춰 서는지, 두 거리 사이에서 인사를 이어가고 멀어지면 0.2초 안에 거두는지, 월드에서 가까이 간 NPC 하나에만 제 인사말 말풍선이 몸 위에 뜨는지 확인한다.

`content/planet/bodyShape.test.ts`: 모양마다 엉덩이 관절이 몸 안에 있는지, 몸 바닥이 땅에 닿지 않는지, NPC들이 세 모양을 모두 쓰는지, 모난 몸이 몸 중심에서 진행 방향을 보고 오른손 기저로 놓이는지, 피라미드 엉덩이 자리로 다리를 풀면 엉덩이가 몸 중심 높이에 붙는지 확인한다.

## 브라우저 확인 (2026-11-21, 개발 서버)

| 항목 | 결과 |
|---|---|
| 시작 화면 | 집 자리 옆에 하늘색 NPC가 보임 |
| 시작 후 8초 | NPC가 플레이어와 같은 다리로 걷고 멈춰 숨쉼. `gl.getError()` 0, 콘솔 오류 없음 |

| 5마리 (2026-11-21) | `npcs` 5, 다리 항목 12, 시작 6초 뒤 모두 움직이거나 쉬는 중. `gl.getError()` 0, 콘솔 오류 없음. 화면에서는 시작 위치 근처만 보여 다섯 색을 한 화면에 보지는 않음 |

| 몸 모양 (2026-11-21) | NPC를 디버그로 플레이어 앞에 옮겨 봄. 정육면체(하늘색, 보라)와 피라미드(분홍)가 진행 방향을 보고 다리가 몸에서 나옴. `gl.getError()` 0, 콘솔 오류 없음 |

| 인사 말풍선 (2026-11-22) | NPC 둘을 디버그로 플레이어 앞 약 3.7에 옮김. 둘 다 인사하며 머리 위에 '안녕!', '반가워!' 말풍선이 뜸. 나머지 셋은 인사하지 않음. `gl.getError()` 0, 콘솔 오류 없음 |

확인하지 않은 것: 프로덕션 빌드 화면(빌드만 확인), 실제 조작으로 NPC에 부딪히기·다가가기(테스트와 디버그 이동으로만 확인), 모바일, 맥·리눅스 글꼴.
