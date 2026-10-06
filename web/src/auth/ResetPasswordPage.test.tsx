import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderPage } from "../test/render";
import { requestPasswordReset } from "../lib/api";
import { ResetPasswordPage } from "./ResetPasswordPage";

vi.mock("../lib/api", () => ({ requestPasswordReset: vi.fn() }));

beforeEach(() => {
  vi.mocked(requestPasswordReset).mockReset().mockResolvedValue(undefined);
});

describe("ResetPasswordPage", () => {
  it.each([
    ["succeeds", () => undefined],
    ["fails", () => Promise.reject(new Error("rate limited"))],
  ])("returns to sign in with the same notice whether the request %s", async (_label, impl) => {
    vi.mocked(requestPasswordReset).mockImplementation(impl as () => Promise<void>);
    const { user } = renderPage(<ResetPasswordPage />, { route: "/reset-password" });
    const submit = screen.getByRole("button", { name: "Send reset link" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Email"), " brad@example.com ");
    await user.click(submit);
    expect(requestPasswordReset).toHaveBeenCalledWith("brad@example.com");
    const where = screen.getByTestId("location");
    await waitFor(() => expect(where).toHaveTextContent("/signin"));
    expect(JSON.parse(where.dataset.state ?? "null")).toEqual({
      notice: "If an account uses brad@example.com, a reset link is on its way.",
    });
  });

  it("links back to sign in", async () => {
    const { user } = renderPage(<ResetPasswordPage />, { route: "/reset-password" });
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/signin");
  });
});
