# 문서 색인

기능별 규칙과 분석 문서의 위치를 모아 둔 곳이다.

## 기능별 문서

| 기능 | 해당 작업 | 규칙 | 분석 |
|---|---|---|---|
| 콘텐츠와 셰이더 | 행성 표면의 작동 영역(예전 발판), 콘텐츠, 셰이더, 행성·구의 재질이나 연출 | [rules/content.md](rules/content.md) | [analysis/content.md](analysis/content.md) |
| 입력과 조작 | 키보드·마우스·터치 입력, 가상 조이스틱, 일시 정지, 조작 안내 | 없음 | [analysis/input.md](analysis/input.md) |
| 플레이어 캐릭터 | 구체 몸과 다리의 모양, Blender 모델, 서기·걷기 키프레임 애니메이션, 물리 몸체 | [rules/character.md](rules/character.md) | [analysis/character.md](analysis/character.md) |
| NPC | 행성 위를 혼자 돌아다니는 플레이어 모양의 NPC, 색·몸 모양(구·정육면체·피라미드)·시작 위치·걷는 빠르기, 캐릭터끼리 밀어내기 | 없음 | [analysis/npc.md](analysis/npc.md) |
| 별 빌보드 | 행성 둘레의 의인화된 코믹한 별, 별 얼굴 텍스처·개수·배치 | 없음 | [analysis/starfield.md](analysis/starfield.md) |
| 빌보드 일괄 렌더링 | 카메라를 보는 빌보드(별, 햇살, 해 눈)를 모아 한 번에 그리는 계층, 텍스처 아틀라스, 새 빌보드 추가 | 없음 | [analysis/billboard.md](analysis/billboard.md) |
| 위성 | 행성 주변에 떠서 자전하는 바위 위성, 충돌구 모양 | 없음 | [analysis/moon.md](analysis/moon.md) |
| 표면 장면 | 행성 표면에 놓는 객체(집 자리 상자, 로켓 모형)의 장면 파일, 위치·크기·색·충돌, 객체 추가, 로켓 모형 모양 | 없음 | [analysis/surfaceScene.md](analysis/surfaceScene.md) |
| 해 | 행성을 도는 해, 햇살 빌보드, 캐릭터를 보는 눈, 궤적 고리, 해와 맞춘 직사광 방향, 낮과 밤 | 없음 | [analysis/sun.md](analysis/sun.md) |
| three.js 렌더러 | 렌더러, 그림자·장면 복사 패스, 셰이더 규약, three.js 버전 변경 | [rules/threejs.md](rules/threejs.md) | [analysis/threejs.md](analysis/threejs.md) |

## 프로젝트 전체

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
