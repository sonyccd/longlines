/**
 * Memoize an async loader across visits to /stats for as long as its last
 * result is fresh, so a snapshot is fetched once per hour no matter how often
 * the user navigates to and from the page, and never polled. `freshUntil`
 * returns the epoch millisecond the value expires at, or null for a value that
 * must not be kept (the page uses that for "no snapshot yet"). A rejected load
 * is forgotten so the next visit can try again. `peek` is the synchronous
 * read a mounting component uses to skip its loading state.
 */
export interface Cached<T> {
  get(): Promise<T>;
  peek(): T | undefined;
}

export function cached<T>(load: () => Promise<T>, freshUntil: (value: T) => number | null, now: () => number = Date.now): Cached<T> {
  let pending: Promise<T> | null = null;
  let kept: { value: T; until: number } | null = null;
  const fresh = (): T | undefined => (kept !== null && now() < kept.until ? kept.value : undefined);
  return {
    peek: fresh,
    get() {
      const value = fresh();
      if (value !== undefined) return Promise.resolve(value);
      pending ??= load()
        .then((loaded) => {
          const until = freshUntil(loaded);
          kept = until === null ? null : { value: loaded, until };
          return loaded;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}
