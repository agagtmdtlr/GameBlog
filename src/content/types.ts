import type { Vec3 } from '../engine/math';

/** 콘텐츠가 월드에 영향을 줄 수 있는 창구. 필요한 기능은 여기에 추가한다. */
export interface ContentContext {
  sphere: {
    /** 구의 색을 선형 RGB 값으로 서서히 바꾼다. */
    setColor(color: Vec3): void;
    /** 구 안에 물을 채워 투명하게 만들거나, 다시 비워 불투명하게 되돌린다. */
    setWaterFilled(filled: boolean): void;
    /** 구를 달궈 표면을 빛내고 연기를 뿜게 하거나, 다시 식힌다. */
    setHeated(heated: boolean): void;
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
  plate: {
    /** 행성 위의 위치 (도). 위도 90이 시작 지점, 경도 180이 시작할 때 바라보는 방향이다. */
    latitude: number;
    longitude: number;
    /** 발판 색 (선형 RGB) */
    color: Vec3;
  };
}
