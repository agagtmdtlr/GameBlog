import type { Vec3 } from '../engine/math';

/** 콘텐츠가 월드에 영향을 줄 수 있는 창구. 필요한 기능은 여기에 추가한다. */
export interface ContentContext {
  sphere: {
    /** 구의 색을 선형 RGB 값으로 서서히 바꾼다. */
    setColor(color: Vec3): void;
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
    x: number;
    z: number;
    /** 발판 색 (선형 RGB) */
    color: Vec3;
  };
}
