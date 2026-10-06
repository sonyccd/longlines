import { describe, expect, it, vi } from "vitest";
import { cached } from "./cache";

const keepFor = (ms: number) => (value: string | null) => (value === null ? null : Date.now() + ms);

describe("cached", () => {
  it("shares one in-flight load and keeps a fresh value without reloading", async () => {
    const load = vi.fn(async () => "snap");
    const get = cached(load, keepFor(60_000));
    expect(get.peek()).toBeUndefined();
    const [a, b] = await Promise.all([get.get(), get.get()]);
    expect(a).toBe(b);
    await get.get();
    expect(get.peek()).toBe("snap");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads once the value has expired", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
      const get = cached(load, keepFor(1_000));
      await expect(get.get()).resolves.toBe("old");
      vi.advanceTimersByTime(999);
      await expect(get.get()).resolves.toBe("old");
      vi.advanceTimersByTime(1);
      expect(get.peek()).toBeUndefined();
      await expect(get.get()).resolves.toBe("new");
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not keep a value that freshUntil rejects, so the next call loads again", async () => {
    const load = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce("snap");
    const get = cached(load, keepFor(60_000));
    await expect(get.get()).resolves.toBeNull();
    expect(get.peek()).toBeUndefined();
    await expect(get.get()).resolves.toBe("snap");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retries after a failure instead of caching the rejection", async () => {
    const load = vi.fn<() => Promise<string | null>>().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("ok");
    const get = cached(load, keepFor(60_000));
    await expect(get.get()).rejects.toThrow("down");
    await expect(get.get()).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
