export function getOverlappingLength<T>(parent: T[], child: T[]): number;
export function getOverlappingLength(parent: string, child: string): number;
export function getOverlappingLength<T>(parent: Record<number, T>, child: Record<number, T> & { length: number }): number {
  let matchedLength = 0;
  for (let i = 0; i < child.length; i++) {
    if (parent[i] !== child[i]) {
      break;
    }
    matchedLength++;
  }

  return matchedLength;
}


