# 플레이어 캐릭터 규칙

플레이어 캐릭터의 모양, 모델, 걸음을 바꿀 때 지키는 규칙이다.

- **구조 분석:** [analysis/character.md](../analysis/character.md)
- **색인:** [docs/README.md](../README.md)

## 컨셉

- 캐릭터는 구체 몸과 두 다리다 (2026-11-21 사용자 컨셉).
- 다리는 몸 구의 옆이 아니라 위쪽에 붙는다 (2026-11-21 사용자 요청). 무릎은 몸 바깥 위로 과장되게 솟아 몸 꼭대기 높이에 이른다 (2026-11-21 사용자 요청). 그리고 정강이는 아래로 내려와 발이 몸 양옆 바깥에 놓인다. 색은 컨셉의 노랑(sRGB #FCC812)이다.

## 모델

- 다리는 엉덩이에서 발끝까지 하나로 이어진 스킨 메시다. 관절에서 끊기거나 겹쳐 보이지 않아야 한다 (2026-11-21 사용자 요청).
- 다리는 Blender로 만든다. 원본은 `tools/blender/build_character.py`이며, 결과 `src/content/common/character/character.glb`는 스크립트로 다시 만든다. glb만 손으로 고치지 않는다.
- 기본 자세와 치수는 스크립트와 `content/common/character/walker.ts`의 `LEG_REST`, `LEG`가 같아야 한다. 한쪽을 바꾸면 다른 쪽도 고친다.
- 모델과 설계 치수는 배율 1로 두고, 캐릭터 크기는 `CHARACTER_SCALE` 하나로 바꾼다 (2026-11-21 사용자 요청으로 1.5배). 새 거리 값을 넣을 때도 이 배율을 곱한다.

## 애니메이션

- 움직임은 키프레임 애니메이션으로 재생하고, 서기(idle)와 걷기(walk)를 구분한다 (2026-11-21 사용자 요청). 몸이 구를 따라 끌려가는 벌레 다리 같은 움직임이 아니라, 발을 내밀어 디디고 몸이 그 걸음에 맞춰 움직여야 한다.
- 키프레임은 `content/common/character/characterClips.ts`에 둔다. 클립은 몸의 오르내림·흔들림과 발 궤적을 정하고, 다리 관절은 IK가 풀어 발이 땅에 붙는다.
- 땅을 딛고 있는 발은 미끄러지지 않는다. `walker.test.ts`가 확인한다.
- three.js 규칙([threejs.md](threejs.md))을 따른다. glTF는 `content/common/character/characterGraphics.ts`에서만 불러오고, 나머지 캐릭터 코드(`walker.ts` 등)는 뼈의 위치와 축만 계산한다.

## 완료 조건

- `npm test`와 `npm run build`가 통과한다.
- 브라우저에서 서 있는 자세와 걷는 모습을 보고, `window.__game.gl.getError()`가 0이며 콘솔 오류가 없다.
