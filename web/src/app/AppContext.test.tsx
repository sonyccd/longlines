import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { useSession } from "../auth/useSession";
import { loadProfile } from "../lib/api";
import { PROFILE, SESSION } from "../test/render";
import { AppProvider } from "./AppContext";
import { errorText, useApp, useNotify } from "./hooks";

vi.mock("../auth/useSession", () => ({ useSession: vi.fn() }));
vi.mock("../lib/api", () => ({ loadProfile: vi.fn() }));

function session(value: Session | null, loading = false) {
  vi.mocked(useSession).mockReturnValue({ session: value, loading });
}

beforeEach(() => {
  vi.mocked(loadProfile).mockReset().mockResolvedValue(PROFILE);
  session(SESSION);
});

const hook = () => renderHook(() => ({ app: useApp(), notify: useNotify() }), { wrapper: AppProvider });

describe("AppProvider", () => {
  it("loads the signed-in user's profile", async () => {
    const { result } = hook();
    await waitFor(() => expect(result.current.app.profile).toEqual(PROFILE));
    expect(loadProfile).toHaveBeenCalledWith("u1");
    expect(result.current.app.session).toBe(SESSION);
  });

  it("has no profile when signed out", async () => {
    session(null, true);
    const { result } = hook();
    await act(() => result.current.app.refreshProfile());
    expect(result.current.app.profile).toBeNull();
    expect(result.current.app.sessionLoading).toBe(true);
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it("treats a failed profile load as no profile", async () => {
    vi.mocked(loadProfile).mockRejectedValue(new Error("x"));
    const { result } = hook();
    await waitFor(() => expect(loadProfile).toHaveBeenCalled());
    expect(result.current.app.profile).toBeNull();
  });

  it("holds the toast and the sign-in notice", () => {
    const { result } = hook();
    act(() => result.current.notify("Saved"));
    expect(result.current.app.toast).toBe("Saved");
    act(() => result.current.app.clearToast());
    expect(result.current.app.toast).toBeNull();
    act(() => result.current.app.setSignInNotice("bye"));
    expect(result.current.app.signInNotice).toBe("bye");
  });
});

describe("app hooks", () => {
  it("useApp throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Bare() {
      useApp();
      return null;
    }
    expect(() => render(<Bare />)).toThrow("useApp must be used inside AppProvider");
  });

  it("errorText prefers the error's message", () => {
    expect(errorText(new Error("specific"), "fallback")).toBe("specific");
    expect(errorText(new Error(""), "fallback")).toBe("fallback");
    expect(errorText("string", "fallback")).toBe("fallback");
  });
});
