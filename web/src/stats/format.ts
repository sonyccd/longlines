// Pure presentation helpers for the Stats page. Everything here is testable
// in node: no React, no supabase-js.

import type { LatestStats } from "./types";

export const fmt = (n: number): string => n.toLocaleString("en-US");

export const hourLabel = (hour: number): string => `${String(hour).padStart(2, "0")}:00`;

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Tue" for a YYYY-MM-DD UTC day. */
export function weekday(day: string): string {
  return WEEKDAY.format(new Date(`${day}T00:00:00Z`));
}

/** "Tue 9/29" for a YYYY-MM-DD UTC day. */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${weekday(day)} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** The caption under the page title; copy from docs/ui-mock.html. */
export function updatedCaption(generatedAt: string): string {
  const d = new Date(generatedAt);
  return `All times UTC. Updated hourly, last at ${TIME.format(d)} UTC ${DATE.format(d)}.`;
}

/** The empty state shows when there is no snapshot or it counted no spots. */
export function hasData(stats: LatestStats | null): stats is LatestStats {
  return stats !== null && stats.payload.totals.spots > 0;
}

/** Busiest states: spots desc, ties by code so the list is stable. potaByState is zero-filled, so idle states are dropped. */
export function topStates(byState: Record<string, number>, limit = 10): { code: string; spots: number }[] {
  return Object.entries(byState)
    .map(([code, spots]) => ({ code, spots }))
    .filter((s) => s.spots > 0)
    .sort((a, b) => b.spots - a.spots || a.code.localeCompare(b.code))
    .slice(0, limit);
}

/**
 * Choropleth alpha: 0.12 for the lightest active state up to 1 for the busiest.
 * 0 means "use the neutral hover color"; it also covers a week with no US POTA
 * activity (max 0) so the map never divides by zero.
 */
export function fillOpacity(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return 0.12 + 0.88 * (value / max);
}
