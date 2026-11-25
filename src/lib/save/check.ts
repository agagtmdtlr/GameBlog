/** 저장소에서 꺼낸 값 검사 도우미. 다른 버전의 코드나 손으로 고친 값이 들어 있을 수 있다. */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const isIntegerArray = (value: unknown, length?: number): value is number[] =>
  Array.isArray(value) && (length === undefined || value.length === length) && value.every((n) => Number.isInteger(n));
