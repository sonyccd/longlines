import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/render";
import { setMobile } from "../test/media";
import { StatsPage } from "./StatsPage";
import type { LatestStats, StatsPayload } from "./types";
import { useStats } from "./useStats";

vi.mock("./useStats", () => ({ useStats: vi.fn() }));

export const PAYLOAD: StatsPayload = {
  totals: { spots: 12345, potaSpots: 10000, sotaSpots: 2345, activators: 812, references: 640 },
  peakHour: 14,
  busiestSlot: { day: "2026-10-03", hour: 15 },
  daily: ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((day, i) => ({
    day, pota: 1000 + i, sota: 300 + i,
  })),
  potaByState: { NC: 900, CA: 700, TX: 0 },
  sotaAssociations: [{ code: "W4C", spots: 120 }, { code: "W7A", spots: 90 }],
  bands: [{ band: "40m", pota: 3000, sota: 500 }, { band: "20m", pota: 5000, sota: 900 }],
  modes: [{ label: "CW", percent: 40 }, { label: "SSB", percent: 35 }, { label: "FT8/FT4", percent: 25 }],
  topActivators: [{ callsign: "KK4PWJ", references: 9, spots: 120, topBand: "20m" }, { callsign: "W1AW", references: 2, spots: 10, topBand: null }],
  topReferences: [
    { reference: "US-0817", name: "Pisgah National Forest", program: "POTA", spots: 80 },
    { reference: "W4C/CM-001", name: null, program: "SOTA", spots: 40 },
  ],
};

const STATS: LatestStats = { payload: PAYLOAD, generatedAt: "2026-10-05T13:00:00Z" };

beforeEach(() => {
  vi.mocked(useStats).mockReset();
});

describe("StatsPage", () => {
  it("shows progress while loading", () => {
    vi.mocked(useStats).mockReturnValue({ stats: null, loading: true, error: null });
    renderPage(<StatsPage />);
    expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0);
  });

  it("shows the load error", () => {
    vi.mocked(useStats).mockReturnValue({ stats: null, loading: false, error: "Couldn't load stats." });
    renderPage(<StatsPage />);
    expect(screen.getByText("Couldn't load stats.")).toBeInTheDocument();
  });

  it("shows the empty state before there is data", () => {
    vi.mocked(useStats).mockReturnValue({ stats: null, loading: false, error: null });
    renderPage(<StatsPage />);
    expect(screen.getByText(/Not enough data yet/)).toBeInTheDocument();
  });

  it("renders the dashboard from the snapshot", () => {
    vi.mocked(useStats).mockReturnValue({ stats: STATS, loading: false, error: null });
    renderPage(<StatsPage />);
    expect(screen.getByText("All times UTC. Updated hourly, last at 13:00 UTC Oct 5.")).toBeInTheDocument();
    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(screen.getByText("10,000 POTA, 2,345 SOTA")).toBeInTheDocument();
    expect(screen.getByText("14:00")).toBeInTheDocument();
    expect(screen.getByText("Busiest slot: Sat 15:00")).toBeInTheDocument();
    expect(screen.getByText("1. North Carolina")).toBeInTheDocument();
    expect(screen.getByText("2. California")).toBeInTheDocument();
    expect(screen.queryByText(/Texas/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Map of spots by state" })).toBeInTheDocument();
    expect(screen.getByText("Most active activators")).toBeInTheDocument();
  });

  it("renders on phones", () => {
    setMobile(true);
    vi.mocked(useStats).mockReturnValue({ stats: STATS, loading: false, error: null });
    renderPage(<StatsPage />);
    expect(screen.getByText("Most spotted parks and summits")).toBeInTheDocument();
  });
});
