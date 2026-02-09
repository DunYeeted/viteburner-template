// Functions that don't use ns at all

export function filenameFromPath(path: string): string {
  return path.substring(path.lastIndexOf(`/`));
}

export function decimalRound(num: number, placesAfterDecimal: number) {
  return Math.round(num * Math.pow(10, placesAfterDecimal)) / Math.pow(10, placesAfterDecimal);
}

/**
 * Calculate the amount a server will grow to after an ns.grow with a certain number of threads
 * @param currMoney Current money of the server
 * @param threads How many growth threads a single script is using
 * @param growthMultiplier Growth parameter of the server (from ns.getServerGrowth())
 * @returns The server's money after a growth with the specified threads
 */
export function calcGrowthFromThreads(currMoney: number, threads: number, growthMultiplier: number) {
  return (currMoney + threads) * Math.exp((growthMultiplier / 100) * threads);
}
