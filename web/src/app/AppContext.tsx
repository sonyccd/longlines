import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppContext, type AppContextValue } from "./context";
import { loadProfile, type Profile } from "../lib/api";
import { useSession } from "../auth/useSession";

export function AppProvider({ children }: { children: ReactNode }) {
  const { session, loading: sessionLoading } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [signInNotice, setSignInNotice] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await loadProfile(userId));
    } catch {
      setProfile(null);
    }
  }, [userId]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const value = useMemo<AppContextValue>(() => ({
    session,
    sessionLoading,
    profile,
    refreshProfile,
    notify: setToast,
    toast,
    clearToast: () => setToast(null),
    signInNotice,
    setSignInNotice,
  }), [session, sessionLoading, profile, refreshProfile, toast, signInNotice]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
