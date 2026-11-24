# 오림 글자 (ransomText) 분석

종이를 찢어 오린 글자를 이어 붙인 꼴의 제목 기능이다. 메인 페이지 제목에 처음 쓰고, 콘텐츠 안(빌보드 그림, 텍스처)이나 다른 화면에서도 쓰도록 공용 기능으로 만들었다 (2026-11-24 사용자 요청).

- **규칙:** [rules/world.md](../rules/world.md)의 "구조"(`lib/`), "메인 페이지"
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** `feature/ransom-title` (2026-11-24, 커밋 `23059fe` 위에서 추가)
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline 23059fe..HEAD -- src/lib/ransomText
```

## 정한 것

- **영어만 지원한다** (2026-11-24 사용자 결정, 리소스와 최적화 때문). 글자 묶음은 `A-Z a-z 0-9`, 공백, `. , ! ? & ' - :`, 줄바꿈이다. 그 밖의 글자는 빼고 그린다 (`normalizeRansomText`).
- 글꼴 파일을 내려받지 않는다. 시스템 글꼴 열 가지 묶음(`RANSOM_FONTS`: Arial Black, Georgia, Georgia 기울임, Times, Impact, Courier, Trebuchet, Palatino 기울임, Rockwell, Verdana)을 쓰고, 없는 글꼴은 같은 계열(serif, sans-serif, monospace)의 기본 글꼴로 바뀐다. 그래서 운영체제마다 글꼴이 조금 다르게 보일 수 있다.
- 그림 파일 없이 캔버스로 그린다. 같은 글과 같은 `seed`는 늘 같은 모양이다 (기본 `seed`는 글 자체).

## 파일

| 파일 | 내용 |
|---|---|
| `src/lib/ransomText/ransomLayout.ts` | 조각 배치 (`layoutRansomText`). DOM·캔버스 없음. 글꼴, 종이·잉크 색, 크기, 기울기, 찢긴 테두리 다각형을 정한다 |
| `src/lib/ransomText/drawRansomText.ts` | 캔버스 그리기 (`drawRansomLayout`), 캔버스 `measureText` 재기 (`canvasMeasure`), DOM 캔버스 만들기 (`createRansomCanvas`) |
| `src/lib/ransomText/index.ts` | 밖에서 쓰는 것 모음 |
| `src/lib/ransomText/ransomText.test.ts` | 배치 검사 |

`src/lib/`은 여러 곳(메인 페이지, 씬, 엔진)이 함께 쓰는 기능을 두는 곳이다. `lib/`은 `engine/`, `content/`, `home/`을 가져오지 않는다 (`src/layers.test.ts`).

## 조각 하나

| 항목 | 정하는 법 |
|---|---|
| 글꼴 크기 | `letterSize`(기본 64) × 0.82~1.14 |
| 조각 크기 | 잉크 상자 + 안쪽 여백(글꼴 크기의 0.1~0.26배). 최소 너비 0.62~0.8배, 최소 높이 0.82~1.02배라 소문자·문장 부호도 엄지손톱만 한 조각이 된다 |
| 종이·잉크 색 | `RANSOM_PAPERS`의 14가지 종이(빨강, 분홍, 주황, 노랑, 연두, 청록, 파랑, 남색, 보라, 검정, 크림, 신문지, 크라프트, 흰색)와 종이마다 어울리는 잉크 |
| 기울기, 높낮이 | ±`tilt`(기본 0.13 라디안), 글자 크기의 ±8% |
| 간격 | 글자 크기의 -5%~+1% (살짝 겹치거나 붙음), 공백은 0.24~0.34배 |
| 찢긴 가장자리 `torn` | 직사각형 둘레를 따라 짧은 간격으로 안팎으로 흔든 다각형. 흰 종이 속살 색(#fbfaf6)으로 칠하고 옅은 그림자를 준다 |
| 색 면 `face` | 변마다 다르게 안쪽으로 들인 또 하나의 찢긴 다각형. 둘 사이로 흰 가장자리가 고르지 않게 보인다 |
| 종이 결 | 옅은 얼룩 점. 밝은 종이는 60% 확률로 신문 글줄 같은 가는 줄 무늬(`newsprint`) |

글자는 잉크 상자(`actualBoundingBox`)가 조각 가운데에 오도록 놓는다. 여러 줄(`\n`)은 줄마다 가운데 정렬해 아래로 쌓는다(`lineHeight` 기본 1.35배). 결과 크기는 회전한 조각과 그림자 자리까지 감싼다.

## 쓰는 법

DOM에 넣기:

```ts
import { createRansomCanvas } from '../lib/ransomText';
const title = createRansomCanvas('Game Blog', { letterSize: 72 }); // role="img", aria-label="Game Blog"
element.append(title); // CSS 크기는 자유롭게 (class "ransom-text", aspect-ratio가 걸려 있다)
```

캔버스에 그리기 (빌보드 그림 `BillboardImageDef.draw`, 텍스처 캔버스 등):

```ts
import { canvasMeasure, drawRansomLayout, layoutRansomText } from '../../lib/ransomText';
const layout = layoutRansomText('Hello', canvasMeasure(ctx), { letterSize: 48, seed: 3 });
ctx.save();
ctx.scale(w / layout.width, h / layout.height); // 원하는 칸 크기에 맞춤
drawRansomLayout(ctx, layout);
ctx.restore();
```

선택 값(`RansomOptions`): `letterSize`, `seed`(같은 글을 다른 모양으로), `mixCase`(대소문자를 섞음, 기본 꺼짐), `tilt`, `lineHeight`. `createRansomCanvas`는 `pixelRatio`(기본 `devicePixelRatio`, 최대 2)도 받는다.

## 브라우저 확인 (2026-11-24, 개발 서버)

| 항목 | 결과 |
|---|---|
| 메인 페이지 제목 `Game Blog` | 코믹 프레임 위 제목 띠에 맞게 들어감 |
| `Hello World 2026!`, `Ransom Note`(`mixCase`) | 조각마다 글꼴·색·기울기가 다르고, 흰 찢긴 가장자리와 신문지 무늬가 보임 |
| 콘솔 오류 | 없음 |

확인하지 않은 것: macOS·모바일의 시스템 글꼴로 본 모양, 3D 씬 안(빌보드·텍스처)에서 쓰기 (아직 쓰는 곳 없음).
