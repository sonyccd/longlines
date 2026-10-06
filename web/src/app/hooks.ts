import { useContext } from "react";
import { AppContext, type AppContextValue } from "./context";

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function useNotify(): (message: string) => void {
  return useApp().notify;
}

/** Set at sign-up; consumed on the first signed-in render to start the guided tour. */
export const WELCOME_KEY = "longlines.welcome";

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
