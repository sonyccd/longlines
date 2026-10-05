import { describe, expect, it } from "vitest";
import { formatSpotTime, relativeAge } from "./time";



describe("relativeAge", () => {
  it("formats seconds, minutes, hours and days", () => {
    expect(relativeAge(12)).toBe("12s ago");
    expect(relativeAge(90)).toBe("1m ago");
    expect(relativeAge(3 * 3600 + 5)).toBe("3h ago");
    expect(relativeAge(2 * 86400)).toBe("2d ago");
  });
  it("handles missing and future values", () => {
    expect(relativeAge(null)).toBe("never");
    expect(relativeAge(-5)).toBe("0s ago");
  });
});

describe("formatSpotTime", () => {
  it("shows HH:MM:SS in UTC when utcTimes is on", () => {
    expect(formatSpotTime("2026-10-05T14:32:08+00:00", { utcTimes: true, timezone: "America/New_York" })).toBe("14:32:08");
  });
  it("shows the user's time zone when utcTimes is off", () => {
    expect(formatSpotTime("2026-10-05T14:32:08+00:00", { utcTimes: false, timezone: "America/New_York" })).toBe("10:32:08");
  });
  it("falls back to UTC for an unknown time zone", () => {
    expect(formatSpotTime("2026-10-05T14:32:08+00:00", { utcTimes: false, timezone: "Not/AZone" })).toBe("14:32:08");
  });
});
