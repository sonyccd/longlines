import { useEffect, useState } from "react";
import { errorText } from "../app/hooks";
import { loadLatestStats } from "../lib/api";
import { once } from "./once";
import type { LatestStats } from "./types";

// Exactly one stats request per page load; see once.ts.
const fetchStats = once(loadLatestStats);

export function useStats(): { stats: LatestStats | null; loading: boolean; error: string | null } {
  const [stats, setStats] = useState<LatestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchStats()
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
