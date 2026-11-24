import { DOODLE_PARADE } from './doodleParade';

/** 색칠 그림. 판을 새로 시작할 때 이 가운데서 고른다. 새 그림은 `svg.ts`의 도우미로 짓고 여기에 더한다. */
export interface ColoringPicture {
  readonly id: string;
  /** 1000 × 1000 SVG 문서 (`pictureSvg`) */
  readonly svg: string;
}

export const PICTURES: readonly ColoringPicture[] = [{ id: 'doodle-parade', svg: DOODLE_PARADE }];
