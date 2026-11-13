export function retryDelay(attempt, baseMs = 100) {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new RangeError(`attempt must be a nonnegative integer, got ${attempt}`);
  }
  if (typeof baseMs !== "number" || !Number.isFinite(baseMs) || baseMs <= 0) {
    throw new RangeError(`baseMs must be a positive finite number, got ${baseMs}`);
  }
  return baseMs * 2 ** attempt;
}
