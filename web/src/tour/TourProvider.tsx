// The only module that imports react-joyride. It was added for the guided tour because
// it provides the spotlight overlay, tooltip positioning and target polling that the
// hands-on tour needs; writing that against MUI portals ourselves would be far larger.
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { Link, useTheme } from "@mui/material";
import { useLocation, useNavigate } from "react-router";
import { ACTIONS, EVENTS, Joyride, type EventData, type Step } from "react-joyride";
import { useApp } from "../app/hooks";
import { TourContext, type TourDetail, type TourValue } from "./context";
import { INITIAL, reduce, STEPS, TOUR_ENDED_TOAST, type Segment, type TourEvent, type TourStep } from "./model";

const TARGET_WAIT_MS = 3000;

function body(segments: Segment[]) {
  return segments.map((s, i) =>
    typeof s === "string" ? s : <Link key={i} href={s.href} target="_blank" rel="noopener">{s.text}</Link>,
  );
}

function toJoyrideStep(step: TourStep): Step {
  const waits = step.advanceOn !== "next";
  return {
    id: step.id,
    target: step.target === null ? "body" : `[data-tour="${step.target}"]`,
    placement: step.target === null ? "center" : (step.placement ?? "bottom"),
    title: step.title,
    content: body(step.body),
    buttons: waits ? ["skip"] : ["primary", "skip"],
    hideOverlay: step.hideOverlay ?? false,
    locale: step.nextLabel ? { next: step.nextLabel, last: step.nextLabel } : undefined,
  };
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, INITIAL);
  const { notify } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const step = STEPS[state.index];
  const route = state.active ? step?.route : undefined;
  // Set while the tour itself is navigating to a step's page, so that move isn't mistaken for the user leaving.
  const pendingRoute = useRef<string | null>(null);
  // The current path for the step-entry effect, which must not re-run on navigation.
  const pathRef = useRef(location.pathname);
  useEffect(() => {
    pathRef.current = location.pathname;
  });

  // Entering a step on another page: go there.
  useEffect(() => {
    if (!route || pathRef.current === route) return;
    pendingRoute.current = route;
    void navigate(route);
  }, [route, state.index, navigate]);

  // Any other navigation away from the step's page ends the tour.
  useEffect(() => {
    if (!route) return;
    if (location.pathname === route) {
      pendingRoute.current = null;
      return;
    }
    if (pendingRoute.current === route) return;
    dispatch({ type: "end" });
    notify(TOUR_ENDED_TOAST);
  }, [location.pathname, route, notify]);

  const onEvent = useCallback((data: EventData) => {
    if (data.type === EVENTS.STEP_AFTER && data.action === ACTIONS.NEXT) {
      dispatch({ type: "next" });
    } else if (data.type === EVENTS.TOUR_END) {
      dispatch({ type: "end" });
    } else if (data.type === EVENTS.TARGET_NOT_FOUND) {
      dispatch({ type: "end" });
      notify(TOUR_ENDED_TOAST);
    }
  }, [notify]);

  const steps = useMemo(() => STEPS.map(toJoyrideStep), []);
  const start = useCallback(() => dispatch({ type: "start" }), []);
  const report = useCallback((event: TourEvent, detail?: TourDetail) => dispatch({ type: "event", event, ...detail }), []);
  const value = useMemo<TourValue>(
    () => ({ active: state.active, destinationId: state.destinationId, start, report }),
    [state.active, state.destinationId, start, report],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <Joyride
        steps={steps}
        run={!!route && location.pathname === route}
        stepIndex={state.index}
        continuous
        onEvent={onEvent}
        locale={{ next: "Next", last: "Done", skip: "Skip tour" }}
        options={{
          zIndex: theme.zIndex.modal + 50,
          disableFocusTrap: true,
          overlayClickAction: false,
          dismissKeyAction: false,
          closeButtonAction: "skip",
          skipBeacon: true,
          targetWaitTimeout: TARGET_WAIT_MS,
          backgroundColor: theme.palette.background.paper,
          arrowColor: theme.palette.background.paper,
          textColor: theme.palette.text.primary,
          primaryColor: theme.palette.primary.main,
          width: "min(380px, calc(100vw - 32px))",
        }}
      />
    </TourContext.Provider>
  );
}
