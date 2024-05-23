/**
 * Flatten a 2-dimensional array into a 1-dimensional one.
 */
export function flattenArray<T>(nestedArray: T[][]): T[] {
  return nestedArray.reduce((acc, array) => [...acc, ...array], []);
}

/**
 * Remove all duplicates from the list.
 * Doesn't preserve ordering.
 */
export function uniq<A>(a: A[]): A[] {
  return Array.from(new Set(a));
}
