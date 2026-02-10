// Functions that don't use ns at all

export function filenameFromPath(path: string): string {
  return path.substring(path.lastIndexOf(`/`));
}

export function decimalRound(num: number, placesAfterDecimal: number) {
  return Math.round(num * Math.pow(10, placesAfterDecimal)) / Math.pow(10, placesAfterDecimal);
}

export function clamp(max: number, min: number, n: number): number {
  return Math.max(max, Math.min(min, n));
}
