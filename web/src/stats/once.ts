/**
 * Memoize an async loader for the life of the module, i.e. the browser
 * session. The Stats page uses this so a snapshot is fetched once per page
 * load no matter how often the user navigates to and from /stats. A rejected
 * load is forgotten so the next visit can try again.
 */
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch((err: unknown) => {
      pending = null;
      throw err;
    });
    return pending;
  };
}
