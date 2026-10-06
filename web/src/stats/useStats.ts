import { useEffect, useState } from "react";
import { errorText } from "../app/hooks";
import { loadLatestStats } from "../lib/api";
import { cached } from "./cache";
import type { LatestStats } from "./types";

const HOUR = 60 * 60 * 1000;

// One request per hour of page use, never polled (see cache.ts). A snapshot
// stays fresh until the next hourly refresh is due; "no snapshot yet" (null)
// is not kept, so the first visit after the first refresh picks it up.
const snapshot = cached(loadLatestStats, (s) => (s ? Date.parse(s.generatedAt) + HOUR : null));

export function useStats(): { stats: LatestStats | null; loading: boolean; error: string | null } {
  // Seed from the cache so returning to /stats renders the dashboard at once instead of flashing a progress bar.
  const [stats, setStats] = useState<LatestStats | null>(() => snapshot.peek() ?? null);
  const [loading, setLoading] = useState(() => snapshot.peek() === undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (snapshot.peek() !== undefined) return;
    let active = true;
    snapshot
      .get()
      .then((s) => {
        if (active) setStats(s);
      })
      .catch((err: unknown) => {
        if (active) setError(errorText(err, "Couldn't load stats."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { stats, loading, error };
}
