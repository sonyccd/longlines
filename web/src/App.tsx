import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createTheme, CssBaseline, LinearProgress, Snackbar, ThemeProvider, useMediaQuery } from "@mui/material";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { AppProvider } from "./app/AppContext";
import { useApp, WELCOME_KEY } from "./app/hooks";
import { SignInPage } from "./auth/SignInPage";
import { CheckEmailPage } from "./auth/CheckEmailPage";
import { ResetPasswordPage } from "./auth/ResetPasswordPage";
import { SetPasswordPage } from "./auth/SetPasswordPage";
import { AppShell } from "./layout/AppShell";
import { SourcesPage } from "./sources/SourcesPage";
import { DestinationsPage } from "./destinations/DestinationsPage";
import { SubscriptionsPage } from "./subscriptions/SubscriptionsPage";
import { AccountPage } from "./account/AccountPage";
import { loadDestinations, loadSubscriptions, type Destination, type SubscriptionWithLinks } from "./lib/api";
import type { TimePrefs } from "./lib/time";

export default function App() {
  const dark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(() => createTheme({ palette: { mode: dark ? "dark" : "light" } }), [dark]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppProvider>
        <Router />
        <Toast />
      </AppProvider>
    </ThemeProvider>
  );
}

function Toast() {
  const { toast, clearToast } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  // A toast can also arrive through navigation state (e.g. the welcome after sign-up).
  const routed = (location.state as { toast?: string } | null)?.toast ?? null;
  const message = toast ?? routed;
  const close = () => {
    if (toast) clearToast();
    if (routed) void navigate(location.pathname, { replace: true, state: null });
  };
  return (
    <Snackbar open={!!message} autoHideDuration={3000} onClose={close} message={message} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
  );
}

function Router() {
  return (
    <Routes>
      <Route path="/signin" element={<PublicOnly><SignInPage /></PublicOnly>} />
      <Route path="/check-email" element={<CheckEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/sources" element={<RequireAuth page="sources" />} />
      <Route path="/subscriptions" element={<RequireAuth page="subscriptions" />} />
      <Route path="/destinations" element={<RequireAuth page="destinations" />} />
      <Route path="/account" element={<RequireAuth page="account" />} />
      <Route path="*" element={<Navigate to="/sources" replace />} />
    </Routes>
  );
}

/** Signed-in users skip the sign-in screen. */
function PublicOnly({ children }: { children: ReactNode }) {
  const { session, sessionLoading } = useApp();
  if (sessionLoading) return <LinearProgress />;
  if (session) return <Navigate to="/sources" replace />;
  return children;
}

type Page = "sources" | "subscriptions" | "destinations" | "account";

function RequireAuth({ page }: { page: Page }) {
  const { session, sessionLoading, profile } = useApp();
  const location = useLocation();
  if (sessionLoading) return <LinearProgress />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  if (!profile) return <LinearProgress />;
  return <SignedIn page={page} />;
}

function SignedIn({ page }: { page: Page }) {
  const { profile, notify } = useApp();
  const navigate = useNavigate();
  const mobile = useMediaQuery((t: ReturnType<typeof createTheme>) => t.breakpoints.down("md"));
  const [dests, setDests] = useState<Destination[]>([]);
  const [subs, setSubs] = useState<SubscriptionWithLinks[]>([]);
  const [loading, setLoading] = useState(true);
  const prefs: TimePrefs = { utcTimes: profile?.utc_times ?? true, timezone: profile?.timezone ?? "UTC" };

  const reload = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([loadDestinations(), loadSubscriptions()]);
      setDests(d);
      setSubs(s);
    } catch {
      notify("Couldn't load your destinations and subscriptions.");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // A brand-new account lands on Destinations with a welcome.
  useEffect(() => {
    if (!profile) return;
    let welcome: string | null = null;
    try {
      welcome = localStorage.getItem(WELCOME_KEY);
      if (welcome) localStorage.removeItem(WELCOME_KEY);
    } catch {
      return;
    }
    if (welcome && welcome === profile.callsign) {
      void navigate("/destinations", { replace: true, state: { toast: `Welcome, ${profile.callsign}. Start by adding a destination.` } });
    }
  }, [profile, navigate]);

  if (!profile) return <LinearProgress />;

  return (
    <AppShell destinationsFailing={dests.some((d) => d.health === "failing")}>
      {page === "sources" && <SourcesPage prefs={prefs} />}
      {page === "subscriptions" && (
        <SubscriptionsPage subs={subs} dests={dests} loading={loading} reload={reload} prefs={prefs} fullScreen={mobile} />
      )}
      {page === "destinations" && <DestinationsPage dests={dests} subs={subs} loading={loading} reload={reload} />}
      {page === "account" && <AccountPage profile={profile} />}
    </AppShell>
  );
}
