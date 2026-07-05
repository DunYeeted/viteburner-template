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

/**
 * Replaces the values in an array
 * @remarks This mutates the array in place
 * @param arr Array to modify
 * @param valueToReplace Value that should be replaced
 * @param replacementValue Value that the elements will be replaced with
 */
export function replaceAll<t>(arr: t[], valueToReplace: t, replacementValue: t) {
  if (valueToReplace === replacementValue) return;

  let replaceIndex = arr.indexOf(valueToReplace);
  while (replaceIndex !== -1) {
    arr[replaceIndex] = replacementValue;
    replaceIndex = arr.indexOf(valueToReplace);
  }
}

/**
 * Replaces the text in a string
 */
export function replaceAt(str: string, index: number, replacement: string) {
  return str.substring(0, index) + replacement + str.substring(index + replacement.length);
}
