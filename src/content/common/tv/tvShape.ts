import type { Vec3 } from '../../../engine/math';

/**
 * 표면에 세우는 아날로그 텔레비전 모형. 다리 넷 달린 나무 상자 앞면 왼쪽에 둥근 모서리의 브라운관 화면,
 * 오른쪽 위에 손잡이 둘 달린 조작판, 그 아래에 가로 살을 댄 스피커가 있다.
 * three.js를 쓰지 않는 값과 계산만 둔다. 지오메트리는 `renderer.ts`가 이 값으로 만든다.
 *
 * 좌표는 한 변 1인 상자 안(-0.5~0.5)이다. 바닥(다리 끝)이 y = -0.5이고, 화면이 정면(+Z)을 본다.
 * 장면 파일의 `size`가 이 상자를 늘린다.
 */
export const TV_SHAPE = {
  /** 다리: 몸통 모서리에서의 위치, 길이, 위·아래 반지름 */
  legs: { x: 0.4, z: 0.34, length: 0.26, topRadius: 0.05, bottomRadius: 0.028 },
  /** 나무 몸통: 폭과 깊이(뚜껑보다 조금 작다) */
  cabinet: { width: 0.97, depth: 0.97 },
  /** 몸통 위를 덮는 뚜껑의 두께 */
  lidThickness: 0.035,
  /** 화면: 중심(x, y), 유리의 폭·높이·모서리 반지름, 테의 폭과 두께 */
  screen: { x: -0.12, y: 0.14, width: 0.58, height: 0.46, cornerRadius: 0.07, bezel: 0.045, bezelDepth: 0.035 },
  /** 조작판: 중심(x, y), 폭·높이, 손잡이 반지름과 두께 */
  panel: { x: 0.33, y: 0.33, width: 0.2, height: 0.15, knobRadius: 0.026, knobDepth: 0.035 },
  /** 스피커: 중심(x, y), 폭·높이, 가로 살 수 */
  speaker: { x: 0.33, y: 0.05, width: 0.2, height: 0.32, slats: 8 },
  /** 화면 유리 (선형 RGB). 꺼진 브라운관의 어두운 청회색 */
  screenColor: [0.035, 0.05, 0.055] as Vec3,
  screenRoughness: 0.12,
  /** 화면 테와 손잡이 (선형 RGB). 은색 */
  trimColor: [0.5, 0.5, 0.48] as Vec3,
  trimRoughness: 0.3,
  /** 조작판과 스피커 천 (선형 RGB). 검은 갈색 */
  darkColor: [0.025, 0.02, 0.016] as Vec3,
  darkRoughness: 0.85,
};

/** 상자 부품. 중심과 크기(폭, 높이, 깊이) */
export interface TvBox {
  center: Vec3;
  size: Vec3;
}

/** 다리. 축은 +Y이고 `center`는 축의 가운데다. */
export interface TvLeg {
  center: Vec3;
  length: number;
  topRadius: number;
  bottomRadius: number;
}

const FRONT = TV_SHAPE.cabinet.depth / 2;
/** 몸통 바닥(다리 위 끝)의 높이 */
export const TV_CABINET_BOTTOM = -0.5 + TV_SHAPE.legs.length;

/** 다리 넷. 아래 끝이 바닥(y = -0.5)에 닿고 위 끝이 몸통 바닥에 붙는다. */
export function tvLegs(): TvLeg[] {
  const { x, z, length, topRadius, bottomRadius } = TV_SHAPE.legs;
  const y = -0.5 + length / 2;
  return [
    [-x, -z],
    [x, -z],
    [-x, z],
    [x, z],
  ].map(([lx, lz]) => ({ center: [lx, y, lz], length, topRadius, bottomRadius }));
}

/** 나무로 칠하는 상자: 몸통, 뚜껑, 스피커 가로 살 */
export function tvWoodBoxes(): TvBox[] {
  const { width, depth } = TV_SHAPE.cabinet;
  const lid = TV_SHAPE.lidThickness;
  const top = 0.5 - lid;
  const boxes: TvBox[] = [
    { center: [0, (TV_CABINET_BOTTOM + top) / 2, 0], size: [width, top - TV_CABINET_BOTTOM, depth] },
    { center: [0, 0.5 - lid / 2, 0], size: [1, lid, 1] },
  ];
  const s = TV_SHAPE.speaker;
  const gap = s.height / s.slats;
  for (let i = 0; i < s.slats; i++) {
    const y = s.y - s.height / 2 + gap * (i + 0.5);
    boxes.push({ center: [s.x, y, FRONT + 0.016], size: [s.width + 0.01, gap * 0.35, 0.02] });
  }
  return boxes;
}

/** 검게 칠하는 상자: 조작판, 스피커 천 */
export function tvDarkBoxes(): TvBox[] {
  const { panel, speaker } = TV_SHAPE;
  return [
    { center: [panel.x, panel.y, FRONT + 0.006], size: [panel.width, panel.height, 0.012] },
    { center: [speaker.x, speaker.y, FRONT + 0.004], size: [speaker.width, speaker.height, 0.008] },
  ];
}

/** 조작판의 손잡이 둘. 정면(+Z)으로 튀어나온 원기둥의 앞면 중심 */
export function tvKnobs(): Vec3[] {
  const { x, y, width, knobDepth } = TV_SHAPE.panel;
  const z = FRONT + 0.012 + knobDepth / 2;
  return [
    [x - width / 4, y, z],
    [x + width / 4, y, z],
  ];
}

/** 화면 테가 몸통 앞면에서 시작하는 z와, 화면 유리의 z */
export function tvScreenDepths(): { bezelBack: number; glass: number } {
  return { bezelBack: FRONT, glass: FRONT + 0.008 };
}

/**
 * 둥근 모서리 사각형의 둘레 점. 중심 (0, 0), 반시계 방향이다.
 * `cornerSegments`는 모서리 한 곳을 나누는 수다.
 */
export function roundedRect(width: number, height: number, radius: number, cornerSegments = 8): [number, number][] {
  const r = Math.min(radius, width / 2, height / 2);
  const hx = width / 2 - r;
  const hy = height / 2 - r;
  const corners: [number, number, number][] = [
    [hx, -hy, -Math.PI / 2],
    [hx, hy, 0],
    [-hx, hy, Math.PI / 2],
    [-hx, -hy, Math.PI],
  ];
  const points: [number, number][] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = start + (Math.PI / 2) * (i / cornerSegments);
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return points;
}
