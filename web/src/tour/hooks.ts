import { useContext } from "react";
import { TourContext, type TourValue } from "./context";

export function useTour(): TourValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}
