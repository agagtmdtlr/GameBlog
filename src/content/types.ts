import type { Vec3 } from '../engine/math';

/** 콘텐츠가 월드에 영향을 줄 수 있는 창구. 필요한 기능은 여기에 추가한다. */
export interface ContentContext {
  planet: {
    /** 행성 표면의 색을 선형 RGB 값으로 서서히 바꾼다. */
    setSurfaceColor(color: Vec3): void;
  };
}

/** 발판으로 켜지는 그래픽스 콘텐츠 */
export interface GraphicsContent {
  id: string;
  label: string;
  activate(ctx: ContentContext): void;
  deactivate(ctx: ContentContext): void;
  update?(dt: number, ctx: ContentContext): void;
}

export interface ContentEntry {
  content: GraphicsContent;
  /** 행성 표면의 작동 영역. 구가 이 원 안으로 들어오면 콘텐츠가 켜진다. */
  zone: {
    /** 영역 중심의 위치 (도). 위도 90이 시작 지점, 경도 180이 시작할 때 바라보는 방향이다. */
    latitude: number;
    longitude: number;
    /** 영역 색 (선형 RGB) */
    color: Vec3;
  };
}
