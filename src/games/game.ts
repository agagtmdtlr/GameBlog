/**
 * 미니 게임: 엔진(`engine/`)을 쓰지 않고 혼자 화면을 그리는 콘텐츠. 주소 `?game=<id>`로 연다.
 * 3D 씬(`content/`)과 달리 캐릭터 이동·일시 정지가 없는 놀이를 여기에 둔다.
 */
export interface GameDefinition {
  /** 주소의 `?game=` 값 */
  readonly id: string;
  /** `root` 안에 게임 화면을 만들고 시작한다. */
  start(root: HTMLElement): void;
}
