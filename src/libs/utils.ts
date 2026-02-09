// Functions that don't use ns at all

export function filenameFromPath(path: string): string {
  return path.substring(path.lastIndexOf(`/`));
}

export function decimalRound(num: number, placesAfterDecimal: number) {
  return Math.round(num * Math.pow(10, placesAfterDecimal)) / Math.pow(10, placesAfterDecimal);
}

export function calcGrowthFromThreads(currMoney: number, threads: number, growthMultiplier: number) {
  return (currMoney + threads) * Math.exp((growthMultiplier / 100) * threads);
}
