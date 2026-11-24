import type { BufferGeometry, Object3D } from 'three';
import type { CameraView, Environment, MeshKind } from '../frame';
import type { Mat4 } from '../math';
import type { ShaderKind, ShaderSpec } from '../shader';
import type { SkinSource } from '../skinning';
import type { GeometryData } from '../vertex';
import type { BillboardImage, BillboardImageDef } from './billboard';
import type { VideoScreenPlacement, YouTubeScreen } from './videoScreenLayer';

/** 콘텐츠 층이 메인 패스에 끼워 그리는 장면. 빌보드 다음에, 더한 순서대로 그린다. */
export interface RenderLayer {
  /** 이 층이 그리는 three.js 객체. 렌더러가 층마다 따로 둔 장면에 넣는다. 그림자 패스에는 들어가지 않는다. */
  readonly object: Object3D;
  /** 그리기 직전에 프레임마다 부른다. 자기 uniform과 인스턴스 속성을 채운다. */
  update(view: { camera: CameraView; environment: Environment }): void;
  dispose?(): void;
}

/**
 * 렌더러가 콘텐츠에 열어 둔 등록 창구. 씬이 만들어질 때 받아 자기 메시, 빌보드 그림, 배경, 셰이더 층을 등록한다.
 * 씬을 바꾸면 렌더러가 등록된 것을 모두 지운다 (`Renderer.resetContent`).
 */
export interface Graphics {
  /**
   * 이름으로 그릴 메시를 등록한다. 같은 이름이면 바꾼다. 지오메트리는 렌더러가 맡아 지운다.
   * 정점 속성은 이름과 성분 수가 자유롭다. three.js 지오메트리나 three.js 없이 만든 `GeometryData`를 받는다.
   */
  defineMesh(kind: MeshKind, geometry: BufferGeometry | GeometryData): void;
  /**
   * CPU 스키닝 메시를 등록한다. `DrawItem.skin`의 뼈 행렬로 `skin`의 기본 자세를 옮겨 그린다.
   * `position`, `normal`은 스키닝한 값을 쓰고, `geometry`의 색인과 다른 정점 속성(예: `uv`)은 그대로 쓴다.
   */
  defineSkinnedMesh(kind: MeshKind, geometry: BufferGeometry | GeometryData, skin: SkinSource): void;
  /**
   * 셰이더를 등록한다. `DrawItem.material`이 `{ shader: kind, uniforms }`이면 이 셰이더로 그린다.
   * 같은 이름이면 바꾼다. `toon`은 엔진 툰 셰이더라 바꿀 수 없다.
   */
  defineShader(kind: ShaderKind, spec: ShaderSpec): void;
  /** 빌보드 아틀라스의 그림 목록을 바꾼다. 파일 그림은 그 뒤에 `loadBillboardImage`로 채운다. */
  setBillboardImages(images: Readonly<Record<BillboardImage, BillboardImageDef>>): void;
  /** 파일 그림(`draw`가 없는 그림)을 불러와 아틀라스 칸에 그린다. 그 전에는 투명하다. */
  loadBillboardImage(image: BillboardImage, url: string): Promise<void>;
  /** 아주 먼 배경 큐브맵의 여섯 면(+X, -X, +Y, -Y, +Z, -Z). `null`이면 배경색만 칠한다. */
  setSkybox(faces: readonly HTMLCanvasElement[] | null): void;
  /** 콘텐츠의 셰이더로 그리는 층을 더한다. */
  addLayer(layer: RenderLayer): void;
  /**
   * 등록한 메시 `screenMesh`를 `model` 자리에 놓고 그 자리의 캔버스를 뚫어, 캔버스 뒤의 YouTube 영상이 보이게 한다.
   * 영상은 `place`에 맞춰 놓는다.
   */
  addVideoScreen(videoId: string, screenMesh: MeshKind, model: Mat4, place: VideoScreenPlacement): YouTubeScreen;
}
