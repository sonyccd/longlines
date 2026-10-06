import { describe, expect, it, vi } from "vitest";
import { once } from "./once";

describe("once", () => {
  it("calls the loader a single time and shares the result", async () => {
    const load = vi.fn(async () => ({ n: 1 }));
    const get = once(load);
    const [a, b] = await Promise.all([get(), get()]);
    expect(a).toBe(b);
    await get();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure instead of caching the rejection", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("ok");
    const get = once(load);
    await expect(get()).rejects.toThrow("down");
    await expect(get()).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
