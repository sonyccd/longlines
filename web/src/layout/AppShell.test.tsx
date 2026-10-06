import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderPage } from "../test/render";
import { setMobile } from "../test/media";
import { signOut } from "../lib/api";
import { TOUR_MENU_LABEL } from "../tour/model";
import { AppShell } from "./AppShell";
import { PublicShell } from "./PublicShell";

vi.mock("../lib/api", () => ({ signOut: vi.fn() }));

beforeEach(() => {
  vi.mocked(signOut).mockReset().mockResolvedValue(undefined);
});

const shell = (failing = false) => <AppShell destinationsFailing={failing}><p>page body</p></AppShell>;

describe("AppShell", () => {
  it("renders the page with navigation, highlighting the current page", () => {
    renderPage(shell(), { route: "/subscriptions" });
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscriptions" })).toHaveClass("Mui-selected");
    expect(screen.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument();
  });

  it("navigates from the drawer", async () => {
    const { user } = renderPage(shell(), { route: "/sources" });
    await user.click(screen.getByRole("button", { name: "Stats" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/stats");
  });

  it("opens a temporary drawer on phones", async () => {
    setMobile(true);
    const { user } = renderPage(shell(true), { route: "/sources" });
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(await screen.findByRole("button", { name: "Destinations" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/destinations");
  });

  it("shows who is signed in and opens Account", async () => {
    const { user } = renderPage(shell(), { route: "/sources" });
    await user.click(screen.getAllByRole("button", { name: "Account menu" })[1]!);
    expect(screen.getByText("Brad")).toBeInTheDocument();
    expect(screen.getByText("kk4pwj@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Account" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/account");
  });

  it("starts the tour from the account menu", async () => {
    const { user, tour } = renderPage(shell(), { route: "/sources" });
    await user.click(screen.getAllByRole("button", { name: "Account menu" })[0]!);
    await user.click(screen.getByRole("menuitem", { name: TOUR_MENU_LABEL }));
    expect(tour.start).toHaveBeenCalled();
  });

  it("signs out, and reports a failure", async () => {
    const { user, app } = renderPage(shell(), { route: "/sources" });
    await user.click(screen.getAllByRole("button", { name: "Account menu" })[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();

    vi.mocked(signOut).mockRejectedValue(new Error("offline"));
    await user.click(screen.getAllByRole("button", { name: "Account menu" })[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(app.notify).toHaveBeenCalledWith("Couldn't sign out. Try again."));
  });

  it("falls back to the callsign and a placeholder avatar", () => {
    renderPage(shell(), { route: "/sources", app: { profile: null } });
    expect(screen.getAllByText("?").length).toBeGreaterThan(0);
  });
});

describe("PublicShell", () => {
  it("offers sign in and remembers the page", async () => {
    const { user } = renderPage(<PublicShell><p>public body</p></PublicShell>, { route: "/stats" });
    expect(screen.getByText("public body")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const where = screen.getByTestId("location");
    expect(where).toHaveTextContent("/signin");
    expect(JSON.parse(where.dataset.state ?? "null")).toEqual({ from: "/stats" });
  });
});
