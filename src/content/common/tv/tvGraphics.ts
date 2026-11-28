import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Matrix4, Shape, ShapeGeometry, Vector2, type BufferGeometry } from 'three';
import type { Graphics } from '../../../engine/render/graphics';
import { mergeParts } from '../../../engine/render/geometry';
import { roundedRect, tvDarkBoxes, tvKnobs, tvLegs, tvScreenDepths, tvWoodBoxes, TV_SHAPE, type TvBox } from './tvShape';

const tvBoxPart = ({ center, size }: TvBox): [BufferGeometry, Matrix4] => [
  new BoxGeometry(...size),
  new Matrix4().makeTranslation(...center),
];

const tvShapeOf = (points: [number, number][]): Shape => new Shape(points.map(([x, y]) => new Vector2(x, y)));

/** 텔레비전의 나무 부분: 몸통, 뚜껑, 다리, 스피커 가로 살. 모양은 `tvShape.ts`가 정한다. */
function createTvGeometry(): BufferGeometry {
  return mergeParts([
    ...tvWoodBoxes().map(tvBoxPart),
    ...tvLegs().map(({ center, length, topRadius, bottomRadius }): [BufferGeometry, Matrix4] => [
      new CylinderGeometry(topRadius, bottomRadius, length, 16),
      new Matrix4().makeTranslation(...center),
    ]),
  ]);
}

/** 텔레비전의 은색 부분: 화면 테와 손잡이 */
function createTvTrimGeometry(): BufferGeometry {
  const { x, y, width, height, cornerRadius, bezel, bezelDepth } = TV_SHAPE.screen;
  const frame = tvShapeOf(roundedRect(width + 2 * bezel, height + 2 * bezel, cornerRadius + bezel));
  frame.holes.push(tvShapeOf(roundedRect(width, height, cornerRadius)));
  const { knobRadius, knobDepth } = TV_SHAPE.panel;
  return mergeParts([
    [
      new ExtrudeGeometry(frame, { depth: bezelDepth, bevelEnabled: false, curveSegments: 8 }),
      new Matrix4().makeTranslation(x, y, tvScreenDepths().bezelBack),
    ],
    ...tvKnobs().map((center): [BufferGeometry, Matrix4] => [
      new CylinderGeometry(knobRadius, knobRadius, knobDepth, 16).rotateX(Math.PI / 2),
      new Matrix4().makeTranslation(...center),
    ]),
  ]);
}

/** 텔레비전의 검은 부분: 조작판과 스피커 천 */
function createTvDarkGeometry(): BufferGeometry {
  return mergeParts(tvDarkBoxes().map(tvBoxPart));
}

/** 텔레비전 화면 유리. 테 안쪽, 몸통 앞면 바로 앞에 놓은 둥근 모서리 판이다. */
function createTvScreenGeometry(): BufferGeometry {
  const { x, y, width, height, cornerRadius } = TV_SHAPE.screen;
  return mergeParts([
    [new ShapeGeometry(tvShapeOf(roundedRect(width, height, cornerRadius))), new Matrix4().makeTranslation(x, y, tvScreenDepths().glass)],
  ]);
}

/** 텔레비전을 칠하는 색마다 나눈 지오메트리: 나무, 은색 테·손잡이, 검은 판, 화면 유리 */
export interface TvPartGeometries {
  wood: BufferGeometry;
  trim: BufferGeometry;
  dark: BufferGeometry;
  screen: BufferGeometry;
}

/** 텔레비전 부품 지오메트리를 새로 만든다. 좌표는 `tvShape.ts`의 한 변 1인 상자 안이다. */
export function createTvPartGeometries(): TvPartGeometries {
  return { wood: createTvGeometry(), trim: createTvTrimGeometry(), dark: createTvDarkGeometry(), screen: createTvScreenGeometry() };
}

/** 텔레비전 메시 `tv`, `tvTrim`, `tvDark`, `tvScreen`을 등록한다. */
export function defineTvMeshes(graphics: Graphics): void {
  const parts = createTvPartGeometries();
  graphics.defineMesh('tv', parts.wood);
  graphics.defineMesh('tvTrim', parts.trim);
  graphics.defineMesh('tvDark', parts.dark);
  graphics.defineMesh('tvScreen', parts.screen);
}
