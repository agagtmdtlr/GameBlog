/** 0 이상 1 미만의 난수를 돌려주는 함수 */
export type Random = () => number;

/** 씨앗을 받는 난수 (mulberry32). 테스트에서 같은 판을 다시 만들 때 쓴다. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
