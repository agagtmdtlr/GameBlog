import type { FrameData } from './frame';
import type { Graphics } from './render/graphics';

/**
 * 엔진과 콘텐츠 사이의 약속. 콘텐츠 층(`content/`)은 씬마다 `SceneDefinition` 하나를 내놓고,
 * 엔진(`engine/app.ts`)은 그 씬을 만들어 입력을 넘기고, 고정 간격으로 진행하고, 돌려받은 `FrameData`를 그린다.
 * 엔진은 씬 안에 무엇이 있는지 모른다.
 */

/** 한 프레임의 조작. 키보드와 가상 조이스틱을 합친 값이다. */
export interface Controls {
  /** 앞(+)·뒤(-) 이동 (-1~1을 넘을 수 있다. 씬이 정규화한다) */
  forward: number;
  /** 오른쪽(+)·왼쪽(-) 이동 */
  strafe: number;
  /** 이번 프레임에 쌓인 시점 회전 (포인터 이동량) */
  lookX: number;
  lookY: number;
}

/** 만들어진 씬. 게임 상태는 모두 씬이 가진다. */
export interface SceneInstance {
  /** 플레이 중 프레임마다 물리 진행 전에 한 번 부른다. 시점을 돌리고 이동 방향을 정한다. */
  applyControls(controls: Controls): void;
  /** 고정 간격(`dt`초)으로 게임 규칙과 물리를 진행한다. 플레이 중에만 부른다. */
  fixedStep(dt: number): void;
  /**
   * 프레임마다 물리 뒤에 부른다(일시 정지 중에도). `alpha`는 지난 고정 걸음과 다음 걸음 사이의 보간 비율이다.
   * 카메라 따라가기, 소리처럼 프레임 단위로 바뀌는 것을 여기서 한다.
   */
  update(frameSeconds: number, alpha: number, playing: boolean): void;
  /** 이번 프레임에 그릴 것 */
  frame(alpha: number): FrameData;
  /** 씬을 떠날 때 부른다. 렌더러에 등록한 것은 엔진이 지운다. */
  dispose?(): void;
  /** 개발 서버에서 `window.__game`에 더해 둘 값 */
  readonly debug?: Readonly<Record<string, unknown>>;
}

/** 콘텐츠가 엔진에 등록하는 씬 */
export interface SceneDefinition {
  /** 주소의 `?scene=` 값으로 쓰는 이름 */
  readonly id: string;
  /**
   * 씬을 만든다. `graphics`에 메시, 빌보드 그림, 배경, 셰이더 층을 등록한다.
   * `onError`는 비동기로 불러오다 실패해 더 그릴 수 없을 때 부른다.
   */
  create(graphics: Graphics, onError: (error: unknown) => void): SceneInstance;
}
