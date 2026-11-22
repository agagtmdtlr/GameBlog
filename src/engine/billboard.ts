import type { Vec3 } from './math';
import { SIGNAL_ARC } from './signalArc';
import { STAR_FACES } from './starfield';

/**
 * 늘 카메라를 보는 사각 빌보드의 공통 모양. three.js에 의존하지 않는다.
 * `World`가 별, 햇살, 해 눈을 모두 이 모양으로 모아 넘기면, 렌더러의 `BillboardBatch`가
 * 한 장의 텍스처 아틀라스와 한 번의 인스턴스 그리기로 그린다.
 */

/**
 * 아틀라스에 들어가는 그림. `starFace`는 `STAR_FACES`만큼 프레임이 있다.
 * `disk`는 칸을 꽉 채운 흰 원, `sunRays`는 `sunRays.ts`의 햇살을 흰색으로 칠한 것이다.
 * `astronaut`는 `assets/astronaut-sticker.png`(잡지에서 오린 스티커 꼴의 우주인 사진)다. 파일을 비동기로 불러와
 * 칸에 그리므로, 불러오기 전에는 투명해 보이지 않는다.
 * `signalArc`는 인공위성 신호 물결 하나(흰 초승달 호)이고, 퍼질수록 가늘어지는 프레임이 있다 (`signalArc.ts`).
 */
export type BillboardImage = 'starFace' | 'disk' | 'sunRays' | 'astronaut' | 'signalArc';

/** 파일에서 불러와 칸에 그리는 그림 */
export const FILE_BILLBOARD_IMAGES: readonly BillboardImage[] = ['astronaut'];

export interface BillboardImageSpec {
  /** 아틀라스 칸 한 변의 픽셀 수 */
  size: number;
  frames: number;
}

export const BILLBOARD_IMAGES: Readonly<Record<BillboardImage, BillboardImageSpec>> = {
  // 화면에 크게 보일 수 있어 가장 크게 둔다.
  sunRays: { size: 512, frames: 1 },
  // 원본 사진이 466×580이라 512칸이면 충분하다.
  astronaut: { size: 512, frames: 1 },
  starFace: { size: 256, frames: STAR_FACES.length },
  disk: { size: 128, frames: 1 },
  signalArc: { size: 256, frames: SIGNAL_ARC.frames },
};

export interface Billboard {
  image: BillboardImage;
  /** `image`의 프레임 번호. 없으면 0 */
  frame?: number;
  /** 빌보드 가운데의 월드 위치 */
  position: Vec3;
  /** 화면 가로·세로 방향의 월드 크기. 가로가 음수면 좌우로 뒤집는다. */
  size: [number, number];
  /** 화면 안에서 반시계 방향으로 돌리는 각 (라디안). 없으면 0 */
  rotation?: number;
  /** 텍스처 색에 곱하는 선형 RGB. 1보다 밝게 둘 수 있다. */
  color: Vec3;
  /**
   * 툰 셰이더와 같은 ACES 톤 매핑을 건다. 해처럼 툰 발광색과 같은 색으로 보여야 하는 것에 켠다.
   * 끄면 텍스처 색이 그대로 나온다 (별 얼굴).
   */
  toneMapped: boolean;
  /** 불투명도 (0~1). 그림의 알파에 곱한다. 없으면 1 */
  opacity?: number;
}

/** 아틀라스 안의 칸. 픽셀 단위이고 원점은 왼쪽 위다. */
export interface AtlasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  /** `atlasKey(image, frame)`로 찾는다. */
  rects: ReadonlyMap<string, AtlasRect>;
}

export const ATLAS_MAX_WIDTH = 1024;
/** 칸 둘레에 비워 두는 픽셀. 밉맵에서 이웃 칸의 색이 번지지 않게 한다. */
export const ATLAS_GUTTER = 4;

export function atlasKey(image: BillboardImage, frame = 0): string {
  return `${image}:${frame}`;
}

/**
 * 모든 그림을 한 장에 놓는다. 큰 칸부터 왼쪽에서 오른쪽으로 채우고, 줄이 차면 아래 줄로 내려간다.
 * 줄 높이는 그 줄의 첫 칸(가장 큰 칸) 높이다.
 */
export function packAtlas(
  images: Readonly<Record<string, BillboardImageSpec>> = BILLBOARD_IMAGES,
  maxWidth = ATLAS_MAX_WIDTH,
  gutter = ATLAS_GUTTER,
): AtlasLayout {
  const cells: { key: string; size: number }[] = [];
  for (const [image, spec] of Object.entries(images)) {
    for (let frame = 0; frame < spec.frames; frame++) {
      cells.push({ key: atlasKey(image as BillboardImage, frame), size: spec.size + gutter * 2 });
    }
  }
  cells.sort((a, b) => b.size - a.size);

  const rects = new Map<string, AtlasRect>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const cell of cells) {
    if (cell.size > maxWidth) throw new Error(`아틀라스 칸이 너무 큽니다: ${cell.key}`);
    if (x + cell.size > maxWidth) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    rowHeight = Math.max(rowHeight, cell.size);
    rects.set(cell.key, { x: x + gutter, y: y + gutter, width: cell.size - gutter * 2, height: cell.size - gutter * 2 });
    x += cell.size;
    width = Math.max(width, x);
  }
  return { width, height: y + rowHeight, rects };
}

/**
 * 텍스처 좌표 [u0, v0, u1, v1]. v는 아래가 0이다 (three.js 텍스처의 `flipY` 기본값).
 * 가장자리 반 픽셀을 안쪽으로 줄여 이웃 칸을 읽지 않게 한다.
 */
export function atlasUv(layout: AtlasLayout, image: BillboardImage, frame = 0): [number, number, number, number] {
  const rect = layout.rects.get(atlasKey(image, frame));
  if (!rect) throw new Error(`아틀라스에 없는 그림: ${atlasKey(image, frame)}`);
  const { width, height } = layout;
  return [
    (rect.x + 0.5) / width,
    1 - (rect.y + rect.height - 0.5) / height,
    (rect.x + rect.width - 0.5) / width,
    1 - (rect.y + 0.5) / height,
  ];
}

/**
 * 뒤에서 앞으로 그릴 순서. 반투명 가장자리가 겹쳐도 자연스럽게 섞인다.
 * 카메라에서 먼 것부터 번호를 돌려준다.
 */
export function backToFrontOrder(billboards: readonly Billboard[], cameraPosition: Vec3): number[] {
  const distance = billboards.map(({ position: p }) => {
    const dx = p[0] - cameraPosition[0];
    const dy = p[1] - cameraPosition[1];
    const dz = p[2] - cameraPosition[2];
    return dx * dx + dy * dy + dz * dz;
  });
  return billboards.map((_, i) => i).sort((a, b) => distance[b] - distance[a]);
}
