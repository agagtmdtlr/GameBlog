# 플레이어 캐릭터 규칙

플레이어 캐릭터의 모양, 모델, 걸음을 바꿀 때 지키는 규칙이다.

- **구조 분석:** [analysis/character.md](../analysis/character.md)
- **색인:** [docs/README.md](../README.md)

## 컨셉

- 캐릭터는 구체 몸과 두 다리다. 다리는 절차적으로 움직인다 (2026-11-21 사용자 컨셉).
- 무릎은 몸 바깥 위로 솟고, 정강이는 아래로 내려와 발이 몸 양옆 바깥에 놓인다. 색은 컨셉의 노랑(sRGB #FCC812)이다.
- 작동 영역과 콘텐츠는 캐릭터의 재질을 바꾸지 않는다.

## 모델

- 다리는 엉덩이에서 발끝까지 하나로 이어진 스킨 메시다. 관절에서 끊기거나 겹쳐 보이지 않아야 한다 (2026-11-21 사용자 요청).
- 다리는 Blender로 만든다. 원본은 `tools/blender/build_character.py`이며, 결과 `src/assets/character.glb`는 스크립트로 다시 만든다. glb만 손으로 고치지 않는다.
- 기본 자세와 치수는 스크립트와 `game/walker.ts`의 `LEG_REST`, `LEG`가 같아야 한다. 한쪽을 바꾸면 다른 쪽도 고친다.
- 움직임은 절차적 걸음을 유지한다. 키프레임 애니메이션도 허용되지만 (2026-11-21 사용자 허용) 지금은 쓰지 않는다.
- three.js 규칙([threejs.md](threejs.md))을 따른다. glTF는 `engine/renderer.ts`에서만 불러오고, `game/`은 뼈의 위치와 축만 계산한다.

## 완료 조건

- `npm test`와 `npm run build`가 통과한다.
- 브라우저에서 서 있는 자세와 걷는 모습을 보고, `window.__game.gl.getError()`가 0이며 콘솔 오류가 없다.
