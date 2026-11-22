import { add, normalize, scale, type Vec3 } from '../engine/math';
import type { Billboard } from '../engine/billboard';
import { MOON } from './moon';

/**
 * 바위 위성(달) 곁에 떠 있는 우주인 스티커. 3D 모델이 아니라 사진을 잡지에서 오린 스티커처럼 다듬은 그림
 * (`assets/astronaut-sticker.png`)을 카메라를 보는 빌보드로 붙인다. 위아래로 둥실거리고 조금씩 기우뚱한다.
 */
export const ASTRONAUT = {
  /**
   * 위성 중심에서 스티커 가운데까지. 시작 지점 쪽(앞)과 오른쪽으로 비켜, 시작 화면에서 위성 오른쪽 가장자리에
   * 겹쳐 앞에 떠 보인다. 거리가 위성 반지름(최대 약 6.3) + 스티커 대각선 절반(약 5) + 둥실거림보다 커서
   * 어느 쪽에서 보아도 위성 속에 묻히지 않는다.
   */
  offset: [9.1, 0.8, 8] as Vec3,
  /** 스티커 한 변의 월드 크기 (그림 칸이 정사각형이다) */
  size: 7,
  /** 둥실거림 높이와 주기 (초) */
  bobAmplitude: 0.45,
  bobPeriodSeconds: 7,
  /** 기본 기울기와 기우뚱거림 (라디안), 그 주기 (초) */
  tilt: -0.18,
  swayAmplitude: 0.1,
  swayPeriodSeconds: 11,
};

export class FloatingAstronaut {
  /** 둥실거림의 기준점 */
  readonly anchor: Vec3 = add(scale(MOON.direction, MOON.distance), ASTRONAUT.offset);
  /** 둥실거리는 방향. 행성 바깥쪽(위성의 위쪽)이다. */
  private readonly up: Vec3 = normalize(this.anchor);
  private time = 0;
  private previousTime = 0;

  step(dt: number): void {
    this.previousTime = this.time;
    this.time += dt;
  }

  billboard(alpha = 1): Billboard {
    const t = this.previousTime + (this.time - this.previousTime) * alpha;
    const bob = Math.sin((2 * Math.PI * t) / ASTRONAUT.bobPeriodSeconds) * ASTRONAUT.bobAmplitude;
    const sway = Math.sin((2 * Math.PI * t) / ASTRONAUT.swayPeriodSeconds) * ASTRONAUT.swayAmplitude;
    return {
      image: 'astronaut',
      position: add(this.anchor, scale(this.up, bob)),
      size: [ASTRONAUT.size, ASTRONAUT.size],
      rotation: ASTRONAUT.tilt + sway,
      // 사진 색을 그대로 보인다. 별 얼굴처럼 조명과 톤 매핑을 받지 않는다.
      color: [1, 1, 1],
      toneMapped: false,
    };
  }
}
