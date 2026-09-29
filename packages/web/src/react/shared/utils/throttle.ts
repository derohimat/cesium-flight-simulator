/**
 * Leading + trailing throttle: the first call runs immediately and the latest call within
 * the window runs when it closes, so the final value (e.g. speed settling at 0) is never lost.
 */
export function throttle<T extends (...args: never[]) => void>(
  func: T,
  limit: number
): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const flush = () => {
    if (pendingArgs) {
      const args = pendingArgs;
      pendingArgs = null;
      func(...args);
      timer = setTimeout(flush, limit);
    } else {
      timer = null;
    }
  };

  return function (...args: Parameters<T>) {
    if (timer === null) {
      func(...args);
      timer = setTimeout(flush, limit);
    } else {
      pendingArgs = args;
    }
  } as T;
}
