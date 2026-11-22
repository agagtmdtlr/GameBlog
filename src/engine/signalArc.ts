/**
 * 인공위성 안테나에서 퍼져 나가는 신호 물결 하나(초승달 꼴 호)의 모양. three.js를 쓰지 않는다.
 * 빌보드 칸의 가운데가 신호가 나오는 점이고, 호는 그 점을 중심으로 칸 위쪽(+Y)에 그린다.
 * 그래서 빌보드를 키우면 호가 그 점에서 멀어지며 넓어진다.
 * 프레임마다 굵기가 달라, 퍼질수록 가늘어지는 모습을 프레임을 바꿔 그린다.
 */
export const SIGNAL_ARC = {
  frames: 8,
  /** 호가 벌어진 각의 절반 (라디안) */
  halfAngle: 0.92,
  /** 호 바깥 가장자리의 반지름. 칸 한 변의 절반을 1로 둔다. */
  radius: 0.9,
  /** 첫 프레임과 마지막 프레임 호 가운데의 굵기 (칸 절반 기준) */
  thickest: 0.36,
  thinnest: 0.025,
};

/** 퍼진 정도 `progress`(0~1)에 맞는 프레임 번호 */
export function signalArcFrame(progress: number): number {
  const { frames } = SIGNAL_ARC;
  return Math.min(frames - 1, Math.max(0, Math.floor(progress * frames)));
}

/** 프레임의 호 가운데 굵기. 처음에 빠르게 가늘어진다. */
export function signalArcThickness(frame: number): number {
  const { frames, thickest, thinnest } = SIGNAL_ARC;
  const p = (frame + 0.5) / frames;
  return thinnest + (thickest - thinnest) * (1 - p) ** 2;
}

/**
 * 호의 외곽선 [x, y] 목록 (칸 절반 = 1, 가운데가 원점, 위가 +y).
 * 바깥 원호를 따라간 뒤 안쪽 가장자리로 돌아온다. 굵기는 가운데가 가장 굵고 양 끝에서 0이 되는 초승달이다.
 */
export function signalArcOutline(frame: number, segments = 48): [number, number][] {
  const { halfAngle, radius } = SIGNAL_ARC;
  const thickness = signalArcThickness(frame);
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 - 1;
    const angle = t * halfAngle;
    const r = radius - thickness * (1 - t * t);
    outer.push([Math.sin(angle) * radius, Math.cos(angle) * radius]);
    inner.push([Math.sin(angle) * r, Math.cos(angle) * r]);
  }
  return [...outer, ...inner.reverse()];
}
