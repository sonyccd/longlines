import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => {
  let listener: ((event: string, session: unknown) => void) | null = null;
  return {
    unsubscribe: vi.fn(),
    getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: "u1" } } as unknown } })),
    onAuthStateChange(fn: (event: string, session: unknown) => void) {
      listener = fn;
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    },
    emit(session: unknown) {
      listener?.("SIGNED_IN", session);
    },
  };
});

vi.mock("../supabase", () => ({ supabase: { auth } }));

const { useSession } = await import("./useSession");

describe("useSession", () => {
  it("starts loading, then reports the stored session", async () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual({ user: { id: "u1" } });
  });

  it("follows auth state changes and unsubscribes on unmount", async () => {
    const { result, unmount } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => auth.emit(null));
    expect(result.current.session).toBeNull();
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });

  it("ignores a stored session that arrives after unmount", async () => {
    let resolve: (v: { data: { session: unknown } }) => void = () => {};
    auth.getSession.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useSession());
    unmount();
    resolve({ data: { session: { user: { id: "late" } } } });
    await Promise.resolve();
    expect(result.current.session).toBeNull();
  });
});
