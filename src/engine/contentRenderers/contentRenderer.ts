import type {
  BufferGeometry,
  IUniform,
  Mesh,
  PerspectiveCamera,
  RawShaderMaterial,
  Texture,
  WebGLRenderer,
} from 'three';
import type { ContentFrame, DrawItem, MeshKind } from '../frame';

export type Uniforms = Record<string, IUniform>;
export type ToonMesh = Mesh<BufferGeometry, RawShaderMaterial>;

/** `Renderer`가 콘텐츠 렌더러에 빌려주는 공용 자원과 기능 */
export interface RenderContext {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly geometries: Readonly<Record<MeshKind, BufferGeometry>>;
  /** 조명, 카메라 위치처럼 모든 재질이 함께 참조하는 프레임 단위 uniform */
  readonly shared: Readonly<Uniforms>;
  /** 툰 재질을 가진 메시를 만든다. 장면에는 직접 넣어야 한다. */
  createToonMesh(): ToonMesh;
  /** 그리기 항목의 지오메트리, 행렬, 재질 값을 툰 메시에 옮긴다. */
  applyItem(mesh: ToonMesh, item: DrawItem): void;
  /** 지금까지 그린 화면을 복사한 텍스처. 다음 호출 때 덮어쓴다. */
  copySceneColor(): Texture;
}

/**
 * 콘텐츠 하나의 전용 그리기를 맡는다. `Renderer`는 이 클래스의 메서드만 호출하고,
 * 콘텐츠마다 필요한 메서드를 오버라이드해 확장한다. 기본 구현은 아무 일도 하지 않는다.
 *
 * `T`는 이 렌더러가 받는 프레임 값이며, `kind`가 같은 값만 전달된다.
 */
export abstract class ContentRenderer<T extends ContentFrame = ContentFrame> {
  /** 이 렌더러가 그리는 `ContentFrame.kind` */
  abstract readonly kind: T['kind'];

  /**
   * 툰 셰이더(`toon.frag`)에 더하는 uniform. 모든 툰 재질이 같은 객체를 참조하므로
   * `prepare`에서 `value`만 고치면 장면 전체에 반영된다.
   */
  readonly toonUniforms: Uniforms = {};

  /** 공용 uniform이 정해진 뒤 한 번 호출된다. 메시와 재질을 여기서 만든다. */
  init(_ctx: RenderContext): void {}

  /**
   * 매 프레임, 어떤 패스보다 먼저 호출된다.
   * 이번 프레임에 이 콘텐츠의 값이 없으면 `data`는 `null`이며, 켜 둔 효과를 꺼야 한다.
   */
  prepare(_data: T | null): void {}

  /** 메인 패스 뒤에 호출된다. 이번 프레임에 값이 있을 때만 불린다. */
  render(_data: T, _ctx: RenderContext): void {}
}
