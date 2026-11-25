# 문서 색인

기능별 규칙과 분석 문서의 위치를 모아 둔 곳이다.

## 기능별 문서

| 기능 | 해당 작업 | 규칙 | 분석 |
|---|---|---|---|
| 메인 페이지 | 첫 화면 코믹 프레임, 오림 글자 제목, 컷 배치(다각형·여백)와 컷 나누기, 컷에 넣는 콘텐츠(미리 보기 그림·영상·YouTube 썸네일, 씬·미니 게임·YouTube·외부 주소로 가기), 씬에서 메인으로 돌아가기 | [rules/world.md](rules/world.md) | [analysis/home.md](analysis/home.md) |
| 색칠 놀이와 미니 게임 | 3D 해 질 녘 도시를 자유 시점으로 돌아다니며 메시를 눌러 무작위 색을 채우는 색칠 놀이(`games/coloring/`), 도시 배치(도로·차·가로등·사람·건물·나무·하늘·해), 자유 시점 카메라와 조작, 칠하기 셰이더·선 테두리, 색 묶음, 클리어 연출, 엔진 없는 미니 게임 계층(`games/`, `?game=<id>`)과 새 게임 추가 | [rules/world.md](rules/world.md) | [analysis/coloring.md](analysis/coloring.md) |
| 2048 | 판을 밀어 같은 숫자 타일을 합치는 미니 게임(`games/game2048/`), 밀기·합치기 규칙, 타일 색, 애니메이션, 점수와 최고 점수, 이김·끝 표시 | [rules/world.md](rules/world.md) | [analysis/game2048.md](analysis/game2048.md) |
| 플레이 기록 | 미니 게임의 기록을 이 기기의 브라우저(IndexedDB)에 남기기(`lib/save/`), 누적 수치·판 기록·하다 만 판, 형식 버전과 옮기기, 새 게임에 붙이기, 보류한 서버 연동 | [rules/world.md](rules/world.md) | [analysis/saveRecords.md](analysis/saveRecords.md) |
| 오림 글자 | 종이를 찢어 오린 글자를 이어 붙인 제목(`lib/ransomText/`), 영어만 지원, 글꼴·종이 색·찢긴 가장자리, DOM 캔버스나 빌보드·텍스처에 그리기 | [rules/world.md](rules/world.md) | [analysis/ransomText.md](analysis/ransomText.md) |
| 월드 컨셉과 구조 | 글 없이 그래픽으로 전달하는 컨셉, 지워진 콘텐츠·작동 영역 시스템의 참고 커밋 | [rules/world.md](rules/world.md) | [analysis/threejs.md](analysis/threejs.md) |
| 엔진·콘텐츠 계층과 씬 | 코어 엔진(`engine/`)과 콘텐츠(`content/`)의 역할 나누기, 씬 정의(`SceneDefinition`)와 그래픽 등록(`Graphics`), 새 씬·씬 셰이더 추가, 셰이더별 정점 속성(`GeometryData`, `VertexLayout`)과 셰이더 등록(`defineShader`), 씬 바꾸기, 가져오기 규칙 검사 | [rules/world.md](rules/world.md) | [analysis/architecture.md](analysis/architecture.md) |
| 입력과 조작 | 키보드·마우스·터치 입력, 가상 조이스틱, 일시 정지, 조작 안내 | 없음 | [analysis/input.md](analysis/input.md) |
| 플레이어 캐릭터 | 구체 몸과 다리의 모양, Blender 모델, 서기·걷기 키프레임 애니메이션, 물리 몸체 | [rules/character.md](rules/character.md) | [analysis/character.md](analysis/character.md) |
| 문어 외계인 | 행성 위를 떠다니는 문어 꼴 외계인, 챙 머리·눈가리개·더듬이·촉수·광선총 모양, 촉수 스킨 메시, 시작 자리 | 없음 | [analysis/alien.md](analysis/alien.md) |
| NPC | 행성 위를 혼자 돌아다니는 플레이어 모양의 NPC, 색·몸 모양(구·정육면체·피라미드)·시작 위치·걷는 빠르기, 캐릭터끼리 밀어내기, 다가가면 뜨는 인사 말풍선 | 없음 | [analysis/npc.md](analysis/npc.md) |
| 먼 우주 스카이박스 | 큐브맵 텍스처로 그린 아주 먼 배경 우주, 알록달록한 점·반짝이·별·초승달의 개수·크기·색 | 없음 | [analysis/skybox.md](analysis/skybox.md) |
| 별 빌보드 | 행성 둘레의 의인화된 코믹한 별, 별 얼굴 텍스처·개수·배치 | 없음 | [analysis/starfield.md](analysis/starfield.md) |
| 빌보드 일괄 렌더링 | 카메라를 보는 빌보드(별, 햇살, 해 눈)를 모아 한 번에 그리는 계층, 텍스처 아틀라스, 새 빌보드 추가 | 없음 | [analysis/billboard.md](analysis/billboard.md) |
| 비눗방울 띠 | 행성을 소행성대처럼 감싸고 떠다니는 비눗방울, 띠의 기울기·범위·개수·크기, 공전·둥실거림, 무지개빛 막 셰이더 | 없음 | [analysis/bubbles.md](analysis/bubbles.md) |
| 위성 | 행성 주변에 떠서 자전하는 바위 위성, 충돌구 모양 | 없음 | [analysis/moon.md](analysis/moon.md) |
| 우주인 스티커 | 위성 곁에 떠 있는 잡지 오림 스티커 꼴의 우주인 사진, 스티커 그림 만들기, 자리·크기·둥실거림, 파일에서 불러오는 빌보드 그림 | 없음 | [analysis/astronaut.md](analysis/astronaut.md) |
| 인공위성 | 행성을 도는 인공위성, 몸통·접시 안테나·태양 전지판 모양, 해를 따라 도는 전지판, 궤도와 궤적 고리, 접시에서 퍼지는 신호 물결 | 없음 | [analysis/satellite.md](analysis/satellite.md) |
| 표면 장면 | 행성 표면에 놓는 객체(아날로그 텔레비전 모형, 로켓 모형)의 장면 파일, 위치·크기·색·충돌, 객체 추가, 로켓·텔레비전 모형 모양, 텔레비전 화면의 YouTube 영상 | 없음 | [analysis/surfaceScene.md](analysis/surfaceScene.md) |
| 몽환적인 땅 | 행성 땅의 언덕·높이 함수, 파스텔 색 물결, 둥근 지형물(언덕·기둥·공·막대사탕)의 수·크기·색·충돌, 땅 충돌 | [rules/world.md](rules/world.md) | [analysis/terrain.md](analysis/terrain.md) |
| 잔디밭과 바람 | 행성 땅을 덮는 인스턴스 잔디(밀도·키·폭·잔디 없는 곳), 행성을 감도는 바람(축·세기·돌풍 띠), 잎 휘기·떨림 셰이더, 몸이 잔디 밀어내기, 카메라 둘레 셀 고르기 | [rules/world.md](rules/world.md) | [analysis/grass.md](analysis/grass.md) |
| 기차 | 행성 표면의 스플라인 선로(레일·침목), 노선 조절점, 선로를 도는 기차의 차량·빠르기·충돌, 굴뚝 연기 | 없음 | [analysis/train.md](analysis/train.md) |
| 해 | 행성을 도는 해, 햇살 빌보드, 캐릭터를 보는 눈, 궤적 고리, 해와 맞춘 직사광 방향, 낮과 밤 | 없음 | [analysis/sun.md](analysis/sun.md) |
| three.js 렌더러 | 렌더러, 그림자 패스, 툰 셰이더와 재질, 셰이더 규약, three.js 버전 변경, 브라우저 확인 방법 | [rules/threejs.md](rules/threejs.md) | [analysis/threejs.md](analysis/threejs.md) |

## 프로젝트 전체

- [../README.md](../README.md): 저장소 소개, 조작, 시작 방법
- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md): 현재 구조, 기능, 명령어, 알려진 한계
- [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md): 결정 배경과 앞으로의 계획

## 문서 구분

| 경로 | 담는 내용 | 작성 기준 |
|---|---|---|
| `rules/<기능>.md` | 지켜야 할 규칙 | 사용자가 정했거나 확인한 내용, 코드와 테스트가 강제하는 내용 |
| `analysis/<기능>.md` | 구조, 수정 파일, 절차 같은 사실 | 코드를 분석한 결과. 맨 위에 기준 커밋을 적는다 |

## 새 기능 문서 추가

1. `analysis/<기능>.md`에 분석 결과를 쓰고, 기준 커밋과 규칙 문서 링크를 맨 위에 둔다.
2. 규칙이 있으면 `rules/<기능>.md`에 쓰고, 분석 문서 링크를 맨 위에 둔다.
3. 위 표에 한 줄을 추가한다.
