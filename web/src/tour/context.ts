import { createContext } from "react";
import type { TourEvent } from "./model";

export interface TourDetail {
  destinationId?: string;
  secret?: boolean;
}

export interface TourValue {
  active: boolean;
  /** The destination created during this tour, so Destinations can mark its Send test button. */
  destinationId: string | null;
  start: () => void;
  report: (event: TourEvent, detail?: TourDetail) => void;
}

export const TourContext = createContext<TourValue | null>(null);
