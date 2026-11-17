import { dot, normalize, sub, type Vec3 } from '../engine/math';

/**
 * 행성 표면의 원형 작동 영역. 구가 있는 방향(행성 중심에서 구 중심)이 영역 안에 들어오면 작동한다.
 * 구가 영역 밖으로 완전히 벗어나야 다시 작동하므로 경계를 오가도 반복 작동하지 않는다.
 */
export class SurfaceZone {
  private armed = true;
  private readonly cosRadius: number;
  private readonly cosRearm: number;

  /**
   * @param direction 행성 중심에서 영역 중심을 향하는 단위 벡터
   * @param angularRadius 영역의 반지름 (라디안)
   * @param rearmMargin 다시 작동할 수 있게 되려면 영역 경계에서 더 벗어나야 하는 각도 (라디안)
   */
  constructor(
    readonly direction: Vec3,
    readonly angularRadius: number,
    rearmMargin: number,
  ) {
    this.cosRadius = Math.cos(angularRadius);
    this.cosRearm = Math.cos(angularRadius + rearmMargin);
  }

  /** 구가 영역 위에 있는지 */
  contains(sphereCenter: Vec3, planetCenter: Vec3): boolean {
    return dot(normalize(sub(sphereCenter, planetCenter)), this.direction) >= this.cosRadius;
  }

  /** @returns 이번 스텝에서 작동했으면 true */
  update(sphereCenter: Vec3, planetCenter: Vec3): boolean {
    const alignment = dot(normalize(sub(sphereCenter, planetCenter)), this.direction);
    if (alignment < this.cosRearm) this.armed = true;
    const activated = alignment >= this.cosRadius && this.armed;
    if (activated) this.armed = false;
    return activated;
  }
}
