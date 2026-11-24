/**
 * 숫자 키프레임 트랙과 클립. 시간은 클립 길이로 나눈 0~1 값으로 적는다.
 * three.js에 의존하지 않는다.
 */

export interface Keyframe {
  /** 0~1 사이의 정규화된 시간 */
  readonly time: number;
  readonly value: number;
}

/** 시간 순서의 키. 첫 키는 0, 마지막 키는 1에 둔다. 반복 클립이면 두 키의 값이 같아야 한다. */
export type Track = readonly Keyframe[];

export interface Clip<K extends string> {
  /** 한 번 재생하는 시간(초). 진행도로 재생하는 클립은 1로 둔다. */
  readonly duration: number;
  /** 끝나면 처음으로 돌아가는지 */
  readonly loop: boolean;
  readonly tracks: Readonly<Record<K, Track>>;
}

const key = (time: number, value: number): Keyframe => ({ time, value });

/** `[시간, 값]` 쌍으로 트랙을 만든다. */
export function track(...keys: readonly (readonly [number, number])[]): Track {
  return keys.map(([time, value]) => key(time, value));
}

/**
 * 정규화된 시간 u(0~1)에서 트랙 값을 구한다. 키 사이는 Catmull-Rom 접선의 3차 Hermite로 잇는다.
 * 반복 트랙은 끝과 처음의 접선을 이어 붙여 이음매에서 부드럽다.
 */
export function sampleTrack(keys: Track, u: number, loop: boolean): number {
  const n = keys.length;
  if (n === 1) return keys[0].value;
  u = loop ? u - Math.floor(u) : Math.min(Math.max(u, 0), 1);
  let i = 0;
  while (i < n - 2 && u > keys[i + 1].time) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.time - a.time;
  const s = span > 0 ? (u - a.time) / span : 0;
  const ma = tangent(keys, i, loop) * span;
  const mb = tangent(keys, i + 1, loop) * span;
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * a.value + (s3 - 2 * s2 + s) * ma + (-2 * s3 + 3 * s2) * b.value + (s3 - s2) * mb
  );
}

/** 클립의 모든 트랙을 `time`초에서 샘플링한다. */
export function sampleClip<K extends string>(clip: Clip<K>, time: number): Record<K, number> {
  const u = time / clip.duration;
  const out = {} as Record<K, number>;
  for (const name of Object.keys(clip.tracks) as K[]) out[name] = sampleTrack(clip.tracks[name], u, clip.loop);
  return out;
}

/** i번째 키에서의 기울기 (값 / 정규화 시간) */
function tangent(keys: Track, i: number, loop: boolean): number {
  const n = keys.length;
  let prev: Keyframe;
  let next: Keyframe;
  if (i === 0 || i === n - 1) {
    if (!loop) {
      // 끝 키는 한쪽 이웃만 본다.
      return i === 0
        ? (keys[1].value - keys[0].value) / (keys[1].time - keys[0].time)
        : (keys[n - 1].value - keys[n - 2].value) / (keys[n - 1].time - keys[n - 2].time);
    }
    // 반복: 0과 1은 같은 키다. 앞 이웃은 마지막 앞 키를 한 바퀴 당겨 쓴다.
    prev = key(keys[n - 2].time - 1, keys[n - 2].value);
    next = keys[1];
  } else {
    prev = keys[i - 1];
    next = keys[i + 1];
  }
  return (next.value - prev.value) / (next.time - prev.time);
}
