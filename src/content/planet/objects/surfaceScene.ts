import { add, cross, dot, mat4FromBasis, normalize, scale, sub, type Mat4, type Vec3 } from '../../../engine/math';
import { TV_SHAPE, tvScreenDepths } from '../shapes/tvShape';
import type { OrientedBox } from '../../../engine/physics/collision';
import SURFACE_SCENE_DATA from '../scenes/surface.json';
import { MOON } from './moon';
import { PLANET, surfaceDirection } from '../planet';

/**
 * 행성 표면에 놓는 객체들의 장면 파일(`scenes/surface.json`)을 읽는다.
 * 파일은 위치, 크기, 색만 적고, 상자의 축과 모델 행렬은 여기서 계산한다.
 */

/** 표면 위의 자리. 위도·경도(도)로 적거나, 하늘의 천체 바로 아래로 정한다. */
/** 표면 객체의 모양 */
export type SurfaceShape = 'box' | 'rocket' | 'tv';
const SURFACE_SHAPES: readonly SurfaceShape[] = ['box', 'rocket', 'tv'];

export type SurfacePlacement = { latitude: number; longitude: number } | { under: 'moon' };

/** 장면 파일의 객체 한 개 */
export interface SurfaceObjectData {
  /** 장면 안에서 유일한 이름 */
  id: string;
  /** `box`는 상자, `rocket`은 로켓 모형(`engine/rocketShape.ts`), `tv`는 아날로그 텔레비전 모형(`engine/tvShape.ts`)이다. 모두 `size` 상자 안에 들어가고, 충돌은 그 상자로 한다. */
  shape: SurfaceShape;
  placement: SurfacePlacement;
  /** 폭, 높이, 깊이 */
  size: Vec3;
  /** 행성이 둥글어 바닥 모서리가 뜨지 않도록 표면 아래로 묻는 깊이 */
  sink: number;
  /** 선형 RGB */
  color: Vec3;
  roughness: number;
  /** 캐릭터가 통과할 수 없으면 true */
  collides: boolean;
  /** `tv`의 화면에서 반복 재생할 YouTube 영상 id (11자). 없으면 화면이 꺼져 있다. */
  youtube?: string;
}

export interface SurfaceSceneData {
  objects: SurfaceObjectData[];
}

/** 장면 파일을 읽어 월드에 놓을 수 있게 계산한 객체 */
export interface SurfaceObject {
  id: string;
  shape: SurfaceShape;
  /** 바닥 중심의 위치 (도) */
  latitude: number;
  longitude: number;
  size: Vec3;
  color: Vec3;
  roughness: number;
  collides: boolean;
  /** 화면에서 재생할 YouTube 영상 id. `tv`에만 있다. */
  youtube: string | null;
  /** 그리기와 충돌에 같은 값을 쓴다. */
  box: OrientedBox;
  model: Mat4;
}

/** 표면에 세우는 상자의 위치와 크기 */
export interface SurfaceSpot {
  latitude: number;
  longitude: number;
  size: Vec3;
  sink: number;
}

/** 표면에 세운 상자. 축은 [오른쪽, 위, 정면]이고, 정면은 시작 지점(+Y) 쪽 표면 접선이다. */
export function surfaceBox({ latitude, longitude, size, sink }: SurfaceSpot): OrientedBox {
  const up = surfaceDirection(latitude, longitude);
  const [width, height, depth] = size;
  const toSpawn: Vec3 = [0, 1, 0];
  const front = normalize(sub(toSpawn, scale(up, dot(toSpawn, up))));
  const right = cross(up, front);
  return {
    center: scale(up, PLANET.radius + height / 2 - sink),
    axes: [right, up, front],
    halfExtents: [width / 2, height / 2, depth / 2],
  };
}

/** 상자의 모델 행렬. 단위 정육면체(한 변 1)를 상자 크기만큼 늘린다. */
export function boxModel({ center, axes, halfExtents }: OrientedBox): Mat4 {
  const [x, y, z] = axes.map((axis, i) => scale(axis, halfExtents[i] * 2));
  return mat4FromBasis(center, x, y, z);
}

/** 자리를 위도·경도(도)로 바꾼다. 위성 아래 자리는 `MOON.direction`에서 계산하므로 위성을 옮기면 따라간다. */
export function placementLatLon(placement: SurfacePlacement): { latitude: number; longitude: number } {
  if ('under' in placement) {
    const [x, y, z] = MOON.direction;
    return { latitude: (Math.asin(y) * 180) / Math.PI, longitude: (Math.atan2(x, z) * 180) / Math.PI };
  }
  return { latitude: placement.latitude, longitude: placement.longitude };
}

/** YouTube 영상 id. 주소 `watch?v=` 뒤의 11자다. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNumber);

function validatePlacement(p: unknown, where: string): SurfacePlacement {
  if (typeof p === 'object' && p !== null) {
    const o = p as Record<string, unknown>;
    if ('under' in o) {
      if (o.under === 'moon') return { under: 'moon' };
      throw new Error(`${where}.placement.under: "moon"만 쓸 수 있다`);
    }
    if (isNumber(o.latitude) && isNumber(o.longitude) && Math.abs(o.latitude) <= 90) {
      return { latitude: o.latitude, longitude: o.longitude };
    }
  }
  throw new Error(`${where}.placement: { latitude, longitude } 또는 { under: "moon" }이어야 한다`);
}

/** 장면 파일의 내용을 검사한다. 잘못된 값이 있으면 어느 객체의 어느 값인지 적어 예외를 던진다. */
export function validateSurfaceScene(data: unknown): SurfaceSceneData {
  const objects = (data as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(objects)) throw new Error('장면 파일에 objects 배열이 없다');
  const ids = new Set<string>();
  return {
    objects: objects.map((raw, i): SurfaceObjectData => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const where = `objects[${i}]`;
      if (typeof o.id !== 'string' || o.id === '') throw new Error(`${where}.id: 빈 문자열이 아닌 이름이어야 한다`);
      if (ids.has(o.id)) throw new Error(`${where}.id: "${o.id}"가 겹친다`);
      ids.add(o.id);
      const at = `${where}(${o.id})`;
      if (!SURFACE_SHAPES.includes(o.shape as SurfaceShape)) {
        throw new Error(`${at}.shape: ${SURFACE_SHAPES.map((v) => `"${v}"`).join(', ')} 중 하나여야 한다`);
      }
      if (!isVec3(o.size) || o.size.some((v) => v <= 0)) throw new Error(`${at}.size: 양수 세 개여야 한다`);
      if (!isNumber(o.sink) || o.sink < 0) throw new Error(`${at}.sink: 0 이상이어야 한다`);
      if (!isVec3(o.color) || o.color.some((v) => v < 0)) throw new Error(`${at}.color: 0 이상인 선형 RGB 세 개여야 한다`);
      if (!isNumber(o.roughness) || o.roughness < 0 || o.roughness > 1) throw new Error(`${at}.roughness: 0~1이어야 한다`);
      if (typeof o.collides !== 'boolean') throw new Error(`${at}.collides: true 또는 false여야 한다`);
      if (o.youtube !== undefined) {
        if (o.shape !== 'tv') throw new Error(`${at}.youtube: shape가 "tv"인 객체에만 쓸 수 있다`);
        if (typeof o.youtube !== 'string' || !YOUTUBE_ID.test(o.youtube)) {
          throw new Error(`${at}.youtube: 11자 YouTube 영상 id여야 한다`);
        }
      }
      return {
        id: o.id,
        shape: o.shape as SurfaceShape,
        placement: validatePlacement(o.placement, at),
        size: o.size,
        sink: o.sink,
        color: o.color,
        roughness: o.roughness,
        collides: o.collides,
        ...(o.youtube !== undefined ? { youtube: o.youtube as string } : {}),
      };
    }),
  };
}

/** 장면 파일을 검사하고 객체마다 상자와 모델 행렬을 계산한다. */
export function loadSurfaceScene(data: unknown): SurfaceObject[] {
  return validateSurfaceScene(data).objects.map((o) => {
    const { latitude, longitude } = placementLatLon(o.placement);
    const box = surfaceBox({ latitude, longitude, size: o.size, sink: o.sink });
    return {
      id: o.id,
      shape: o.shape,
      latitude,
      longitude,
      size: o.size,
      color: o.color,
      roughness: o.roughness,
      collides: o.collides,
      youtube: o.youtube ?? null,
      box,
      model: boxModel(box),
    };
  });
}

/** `scenes/surface.json`에 적힌 표면 객체들 */
export const SURFACE_OBJECTS: readonly SurfaceObject[] = loadSurfaceScene(SURFACE_SCENE_DATA);

/**
 * 텔레비전 화면에 영상을 띄울 자리. 화면 유리 판의 중심, 축, 월드 크기와 텔레비전의 모델 행렬이다.
 * 렌더러는 모델 행렬로 유리 자리에 캔버스 구멍을 내고, 그 뒤에 같은 크기의 영상을 놓는다.
 */
export interface VideoScreen {
  youtube: string;
  /** 텔레비전 모델 행렬 (`tvScreen` 메시를 놓는 행렬) */
  model: Mat4;
  center: Vec3;
  right: Vec3;
  up: Vec3;
  /** 화면이 보는 방향 */
  normal: Vec3;
  width: number;
  height: number;
}

/** 영상이 있는 텔레비전의 화면 자리. 영상이 없거나 텔레비전이 아니면 null이다. */
export function tvVideoScreen(o: SurfaceObject): VideoScreen | null {
  if (o.shape !== 'tv' || o.youtube === null) return null;
  const { x, y, width, height } = TV_SHAPE.screen;
  const local: Vec3 = [x, y, tvScreenDepths().glass];
  const [right, up, normal] = o.box.axes;
  const center = o.box.axes.reduce((p, axis, i) => add(p, scale(axis, local[i] * o.size[i])), o.box.center);
  return { youtube: o.youtube, model: o.model, center, right, up, normal, width: width * o.size[0], height: height * o.size[1] };
}

/** 영상 소리가 가장 큰 거리와 들리지 않게 되는 거리 (화면 중심에서) */
export const VIDEO_SOUND = { fullDistance: 10, silentDistance: 32 };

/** 화면 중심에서 `distance`만큼 떨어졌을 때의 소리 크기(0~1). 멀어질수록 부드럽게 줄어든다. */
export function videoVolume(distance: number): number {
  const { fullDistance, silentDistance } = VIDEO_SOUND;
  const t = Math.min(1, Math.max(0, (silentDistance - distance) / (silentDistance - fullDistance)));
  return t * t * (3 - 2 * t);
}
