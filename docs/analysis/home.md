# 메인 페이지 (코믹 프레임) 분석

사이트 첫 화면인 코믹 프레임 페이지의 구조, 컷 배치와 콘텐츠를 바꾸는 방법을 정리한 문서다.

- **규칙:** [rules/world.md](../rules/world.md)의 "메인 페이지"
- **색인:** [docs/README.md](../README.md)
- **분석 기준:** `feature/comic-home` (2026-11-24, 커밋 `e03a7f7` 위에서 추가)
- **최신 여부 확인:** 아래 명령에 결과가 있으면 그 변경분만 확인해 이 문서를 고친다.

```bash
git log --oneline e03a7f7..HEAD -- src/home src/main.ts index.html
```

## 흐름

```
/ (주소에 ?scene= 없음) ── main.ts ── home/comicPage.ts: 코믹 프레임을 그린다. WebGL·엔진·씬 코드는 내려받지 않는다
   │ 컷 클릭
   ├─ open.scene  → ?scene=<id>  ── main.ts가 engine/app.ts와 content/를 동적으로 불러와 그 씬을 올린다
   ├─ open.youtube → https://www.youtube.com/watch?v=<id> (새 탭)
   └─ open.url     → 그 주소 (새 탭)
?scene=<id> 의 시작·일시 정지 화면 ── "메인으로" 링크(index.html의 #screen-home) → ./
```

- 메인 페이지와 씬은 주소로만 이어진다. 씬 사이를 오가며 WebGL 컨텍스트를 다시 쓰지 않고 페이지를 새로 연다.
- `main.ts`가 `content/`와 `engine/app.ts`를 `import()`로 불러오므로, 빌드하면 엔진·씬이 따로 청크로 나뉘고 메인 페이지는 작은 청크만 받는다.
- `src/layers.test.ts`가 `home/`이 `engine/`, `content/`를 가져오지 않는지 검사한다. 씬은 id 글자로만 가리킨다.

## 파일

| 파일 | 내용 |
|---|---|
| `src/home/comicLayout.ts` | 컷 배치 `COMIC_LAYOUT`(페이지 크기, 바깥 여백, 컷 사이 여백, 제목 띠 높이, 컷 다각형), 볼록 다각형 줄이기(`insetPolygon`), 종이 좌표로 옮기기(`placeCuts`). DOM 없음 |
| `src/home/contents.json` | 페이지 제목(`title`, 영어)과 컷 id마다 넣을 콘텐츠 |
| `src/home/comicContents.ts` | `contents.json` 읽기·검사(`loadCutContents`), 누르면 갈 주소(`targetLink`), YouTube 썸네일 주소. DOM 없음 |
| `src/home/comicPage.ts` | DOM 그리기 (`showComicPage`) |
| `src/home/previews/` | 컷 미리 보기 그림·영상 파일 |
| `src/home/comicHome.test.ts` | 배치와 콘텐츠 검사 |
| `src/style.css`의 "메인 페이지" 부분 | 종이·컷·테두리·망점·재생 표시 스타일 |

## 컷 배치 (`comicLayout.ts`)

- 컷은 안쪽 영역(가로 100 × 세로 150) 좌표의 **볼록 다각형**이고, 이웃 컷과 **변을 함께 쓰도록 틈 없이** 적는다. 컷 사이 여백(`gutter` 2)은 `placeCuts`가 각 컷의 변을 안쪽으로 `gutter / 2`씩 밀어 만든다. 바깥 여백은 `margin`(3)이다.
- 기본 배치는 사용자가 보여 준 그림을 따른 세 줄 여덟 컷이다.

| 줄 | 컷 | 모양 |
|---|---|---|
| 위 (y 0~44) | `a`, `b` | x 66에서 나눈 큰 컷과 작은 컷 |
| 가운데 (y 44~112) | `c`, `d`, `e`, `f` | 긴 사선 (0,60)→(100,94)이 위아래로 나누고, 위는 (56,44)→(50,77) 사선이, 아래는 (25,68.5)→(48,112) 사선이 다시 나눈다 |
| 아래 (y 112~150) | `g`, `h` | (64,112)→(67.4,150) 사선으로 나눈 두 컷 |

- 컷을 바꿀 때 사선 위의 꼭짓점은 그 사선 위에 정확히 놓아야 한다. 테스트가 컷 넓이의 합이 페이지 넓이와 같은지, 모두 볼록한지, id가 겹치지 않는지 검사한다.
- 컷 영역 위에 높이 `header`(20)의 제목 띠가 있고, `contents.json`의 `title`을 오림 글자([ransomText.md](ransomText.md), `letterSize` 72)로 띠 안에 맞춰 그린다. 제목은 영어만 쓴다 (`loadPageTitle`이 검사).
- 페이지 비율은 `(width + 2·margin) / (height + header + 2·margin)`이고 CSS `aspect-ratio`로 화면 안에 통째로 맞춘다 (스크롤 없음).

## 컷 콘텐츠 (`contents.json`)

```json
{
  "cuts": {
    "a": { "title": "행성 산책", "preview": { "image": "planet.jpg" }, "open": { "scene": "planet" } },
    "b": { "title": "플라워 모작 유니티 시연", "preview": { "youtube": "AXhuradE5oo" }, "open": { "youtube": "AXhuradE5oo" } },
    "c": { "title": "치킨차차 보드게임 온라인 이식 시연", "preview": { "youtube": "aUECXWnuohA" }, "open": { "youtube": "aUECXWnuohA" } }
  }
}
```

| 키 | 값 |
|---|---|
| `title` | 스크린 리더 이름과 마우스 툴팁. 화면에 글로 쓰지 않는다 |
| `preview` | 하나만: `image`(previews/의 그림), `video`(previews/의 mp4·webm, 소리 없이 반복), `youtube`(영상 id → 16:9 썸네일 `maxresdefault`, 없으면 `mqdefault`) |
| `open` | 하나만: `scene`(이 사이트의 씬 id), `youtube`(영상 id, 새 탭), `url`(`https://` 주소, 새 탭) |

- 콘텐츠가 없는 컷은 망점 무늬 빈 컷으로 남고 누를 수 없다.
- 테스트가 콘텐츠의 컷 id가 배치에 있는지, `scene`이 `SCENES`에 있는지, 미리 보기 파일이 `previews/`에 있는지 검사한다.
- `open.youtube` 컷에는 가운데에 재생 삼각형을 얹는다.

### 컷에 콘텐츠를 넣는 절차

1. 미리 보기 그림을 `src/home/previews/`에 넣는다 (컷 상자 비율에 가깝게, 900px 안팎 JPEG). YouTube 썸네일을 쓰면 필요 없다.
2. `contents.json`의 `cuts`에 컷 id로 항목을 더한다.
3. `npm test`로 검사한다.

`b`는 사용자가 게임 "Flower"를 모방해 Unity로 만든 시연 영상이다 (2026-11-24 사용자 요청, 임시로 넣었던 "Big Buck Bunny"를 대체).

`c`는 사용자가 보드게임 "치킨차차"를 온라인 게임으로 이식한 프로젝트의 시연 영상이다 (2026-11-24 사용자 요청).

`previews/planet.jpg`는 개발 서버의 `?scene=planet` 시작 화면에서 캔버스를 3:2로 잘라 900×600 JPEG로 저장했다.

## 화면

- 컷은 컷 상자 크기의 `<a>`(콘텐츠 없음은 `<div>`)에 `clip-path: polygon(...)`을 걸어 모양을 낸다. 누르는 영역도 다각형 안으로 잘린다.
- 테두리는 `clip-path`에 잘리지 않게 종이 위에 SVG 다각형으로 따로 그린다 (`vector-effect: non-scaling-stroke`, 3px). 마우스를 올리거나 키보드로 고른 컷은 테두리가 주황으로 굵어지고 그림이 살짝 커진다.

## 브라우저 확인 (2026-11-24, 개발 서버)

| 항목 | 결과 |
|---|---|
| 800×600 | 종이가 화면 높이에 맞고, 여덟 컷과 사선이 그림과 같은 배치. `a`에 행성 그림, `b`·`c`에 YouTube 썸네일과 재생 표시, 나머지는 망점 빈 컷 |
| 375×812 (모바일) | 종이가 화면 너비에 맞고 스크롤 없음 |
| `a` 마우스 올림 | 테두리 강조, 그림 확대 |
| `a` 클릭 → `?scene=planet` | 행성 시작 화면, `gl.getError()` 0. "메인으로"를 누르면 메인 페이지로 돌아옴 |
| 콘솔 오류 | 없음 |

확인하지 않은 것: 실제 터치 기기, `video` 미리 보기(아직 쓰는 컷 없음), YouTube 새 탭 열림(링크 속성만 확인).
