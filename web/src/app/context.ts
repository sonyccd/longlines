import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../lib/api";

export interface AppContextValue {
  session: Session | null;
  sessionLoading: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  notify: (message: string) => void;
  toast: string | null;
  clearToast: () => void;
  /** Shown once on the sign-in page after a signed-out transition (e.g. account deleted). */
  signInNotice: string | null;
  setSignInNotice: (notice: string | null) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

