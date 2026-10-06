# Guided Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hands-on, in-app tour (react-joyride) that walks a new user through adding a webhook.site destination, sending it a test, and creating a subscription.

**Architecture:** A pure reducer in `web/src/tour/model.ts` owns the step list, copy and transitions. `TourProvider` renders one controlled `<Joyride>`, navigates between routes, and exposes `useTour()` with `start` and `report`. Pages add `data-tour` attributes and call `report` at moments that already exist in their code.

**Tech Stack:** React 19, react-router 8, MUI 9, react-joyride 3.2, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-guided-tour-design.md`

## Global Constraints

- Only `web/src/tour/TourProvider.tsx` imports react-joyride; it carries a header comment saying why the dependency exists.
- Pages touch the tour only through `data-tour` attributes and `useTour().report(...)`.
- `sx` is for layout only. Joyride colors come from Joyride `options`, fed from the MUI theme.
- No `any`. Strict TypeScript with `noUncheckedIndexedAccess`; `STEPS[i]` is `TourStep | undefined`.
- Copy is final as written in the spec. `docs/ui-mock.html` is now a minified bundle (commit caee34b0), so tour copy lives only in `model.ts` and CLAUDE.md says so.
- No persisted tour flag. Auto-start uses the existing `longlines.welcome` key.
- `npm run lint`, `npm test`, `npm run build` clean in `web/` before every commit.

## Review Focus

1. User creates a Discord destination in step 3 instead of a webhook: step 4 (secret) must be skipped and step 5 must still point at that row. Test in Task 1 (`skips the secret step when no secret was returned`).
2. An event arrives for a step that is not waiting for it (e.g. user opens the dialog twice, or sends a test from a second row while on step 8): state must not move. Test in Task 1 (`ignores events the current step is not waiting for`).
3. User navigates away mid-tour with the sidebar: tour ends with the toast and Joyride stops. Manual check in Task 5; logic in Task 2's location effect.
4. User restarts from the menu while a tour is already running: starts over at step 1 on Destinations. Test in Task 1 (`start resets a running tour`); manual check in Task 5.
5. Target never appears (e.g. destination list failed to load): Joyride reports target not found after 3 s and the tour ends with the toast instead of hanging. Handled in Task 2's `onEvent`; manual check not required.

---

### Task 1: Tour model and reducer

**Files:**
- Modify: `web/package.json` (add `react-joyride`)
- Create: `web/src/tour/model.ts`
- Test: `web/src/tour/model.test.ts`

**Interfaces:**
- Produces: `TourEvent`, `TourStep`, `Segment`, `STEPS`, `TourState`, `INITIAL`, `TourAction`, `reduce(state, action)`, `TOUR_ENDED_TOAST`.

- [ ] **Step 1: Install react-joyride**

```bash
cd web && npm install react-joyride@3.2.0
```

- [ ] **Step 2: Write the failing tests**

`web/src/tour/model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INITIAL, reduce, STEPS, TOUR_EVENTS, type TourState } from "./model";

const started = (): TourState => reduce(INITIAL, { type: "start" });

/** Run the tour forward through the given actions. */
function play(...actions: Parameters<typeof reduce>[1][]): TourState {
  return actions.reduce(reduce, started());
}

const indexOf = (id: string) => STEPS.findIndex((s) => s.id === id);

describe("STEPS", () => {
  it("has unique ids", () => {
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
  });

  it("only waits on known events", () => {
    for (const s of STEPS) {
      if (s.advanceOn !== "next") expect(TOUR_EVENTS).toContain(s.advanceOn);
    }
  });

  it("uses only tour routes and centers next-steps", () => {
    for (const s of STEPS) {
      expect(["/destinations", "/subscriptions"]).toContain(s.route);
      if (s.target === null) expect(s.advanceOn).toBe("next");
    }
  });
});

describe("reduce", () => {
  it("start activates at the first step", () => {
    expect(started()).toEqual({ active: true, index: 0, destinationId: null });
  });

  it("start resets a running tour", () => {
    const mid = play({ type: "next" }, { type: "event", event: "destination-dialog-opened" });
    expect(mid.index).toBe(2);
    expect(reduce(mid, { type: "start" }).index).toBe(0);
  });

  it("next advances only on next-steps", () => {
    expect(play({ type: "next" }).index).toBe(1);
    expect(play({ type: "next" }, { type: "next" }).index).toBe(1);
  });

  it("a matching event advances", () => {
    expect(play({ type: "next" }, { type: "event", event: "destination-dialog-opened" }).index).toBe(2);
  });

  it("ignores events the current step is not waiting for", () => {
    const s = play({ type: "next" }, { type: "event", event: "test-sent" });
    expect(s.index).toBe(1);
    expect(reduce(INITIAL, { type: "event", event: "destination-dialog-opened" })).toEqual(INITIAL);
  });

  it("shows the secret step when a secret was returned", () => {
    const s = play(
      { type: "next" },
      { type: "event", event: "destination-dialog-opened" },
      { type: "event", event: "destination-created", destinationId: "d1", secret: true },
    );
    expect(s.index).toBe(indexOf("secret"));
    expect(s.destinationId).toBe("d1");
  });

  it("skips the secret step when no secret was returned", () => {
    const s = play(
      { type: "next" },
      { type: "event", event: "destination-dialog-opened" },
      { type: "event", event: "destination-created", destinationId: "d1", secret: false },
    );
    expect(s.index).toBe(indexOf("send-test"));
    expect(s.destinationId).toBe("d1");
  });

  it("walks the whole tour in order and ends", () => {
    const s = play(
      { type: "next" },
      { type: "event", event: "destination-dialog-opened" },
      { type: "event", event: "destination-created", destinationId: "d1", secret: true },
      { type: "event", event: "secret-dismissed" },
      { type: "event", event: "test-sent" },
      { type: "next" },
      { type: "event", event: "subscription-dialog-opened" },
      { type: "event", event: "subscription-created" },
    );
    expect(s.index).toBe(STEPS.length - 1);
    expect(s.active).toBe(true);
    expect(reduce(s, { type: "next" }).active).toBe(false);
  });

  it("end deactivates and keeps the index", () => {
    const s = reduce(play({ type: "next" }), { type: "end" });
    expect(s.active).toBe(false);
    expect(reduce(s, { type: "next" })).toEqual(s);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/tour/model.test.ts`
Expected: FAIL, cannot resolve `./model`.

- [ ] **Step 4: Write the model**

`web/src/tour/model.ts`:

```ts
// The guided tour's steps, copy and state machine. Pure: no React, no DOM, no Joyride.
// TourProvider turns STEPS into Joyride steps; pages report TourEvents as they happen.

export const TOUR_EVENTS = [
  "destination-dialog-opened",
  "destination-created",
  "secret-dismissed",
  "test-sent",
  "subscription-dialog-opened",
  "subscription-created",
] as const;
export type TourEvent = (typeof TOUR_EVENTS)[number];

export type TourRoute = "/destinations" | "/subscriptions";

/** Body copy; an object segment renders as a link that opens in a new tab. */
export type Segment = string | { text: string; href: string };

export interface TourStep {
  id: string;
  route: TourRoute;
  /** `data-tour` attribute value of the element to point at, or null for a centered step. */
  target: string | null;
  title: string;
  body: Segment[];
  /** "next" shows a primary button; an event name waits for the page to report it. */
  advanceOn: "next" | TourEvent;
  /** Primary button label on "next" steps. Defaults to Next (Done on the last step). */
  nextLabel?: string;
  /** Tooltip side; ignored for centered steps. Defaults to bottom. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Steps that spotlight a whole form drop the dimmed overlay so the form stays usable. */
  hideOverlay?: boolean;
}

export const TOUR_ENDED_TOAST = "Tour ended. You can take it again from the account menu.";

export const STEPS: readonly TourStep[] = [
  {
    id: "welcome", route: "/destinations", target: null, advanceOn: "next", nextLabel: "Start",
    title: "Welcome to Long Lines",
    body: ["Long Lines watches POTA and SOTAwatch and delivers the spots you care about. This tour takes about two minutes: you'll add a webhook destination, send it a test, and create your first subscription."],
  },
  {
    id: "add-destination", route: "/destinations", target: "add-destination", advanceOn: "destination-dialog-opened",
    title: "Add a destination",
    body: ["A destination is a place spots get delivered. Click Add destination."],
  },
  {
    id: "destination-form", route: "/destinations", target: "destination-form", advanceOn: "destination-created", placement: "right", hideOverlay: true,
    title: "Point it at webhook.site",
    body: [
      "Choose Webhook. Then open ", { text: "webhook.site", href: "https://webhook.site" },
      " in a new tab, copy the URL it gives you, and paste it as the Endpoint URL. Give it a name like Tour test and click Add destination.",
    ],
  },
  {
    id: "secret", route: "/destinations", target: "signing-secret", advanceOn: "secret-dismissed", placement: "bottom", hideOverlay: true,
    title: "Your signing secret",
    body: ["Every delivery is signed with this secret so your server can verify it came from Long Lines. You won't need it for webhook.site. Click Done."],
  },
  {
    id: "send-test", route: "/destinations", target: "send-test", advanceOn: "test-sent",
    title: "Send a test",
    body: ["Click Send test. Long Lines posts one sample spot from N0CALL to your URL. Switch to the webhook.site tab to see the request and its JSON body."],
  },
  {
    id: "to-subscriptions", route: "/destinations", target: null, advanceOn: "next",
    title: "Now pick your spots",
    body: ["Delivery works. Next, a subscription chooses which spots to send."],
  },
  {
    id: "new-subscription", route: "/subscriptions", target: "new-subscription", advanceOn: "subscription-dialog-opened",
    title: "Create a subscription",
    body: ["Click New subscription."],
  },
  {
    id: "subscription-form", route: "/subscriptions", target: "subscription-form", advanceOn: "subscription-created", placement: "right", hideOverlay: true,
    title: "Choose what to receive",
    body: ["Name it and pick filters: sources, bands, modes, callsigns, or a park, summit, or location. Leave a filter empty to match everything. Under Send matches to, choose your webhook. The preview shows how many of the last 200 spots would have matched. Click Create subscription."],
  },
  {
    id: "done", route: "/subscriptions", target: null, advanceOn: "next", nextLabel: "Done",
    title: "You're on the air",
    body: ["Matching spots now go to your webhook as they come in. When you're ready for a real endpoint, add it as a new destination and point the subscription at it. You can take this tour again from the account menu."],
  },
];

export interface TourState {
  active: boolean;
  index: number;
  /** The destination created during this tour, so the page can mark its Send test button. */
  destinationId: string | null;
}

export const INITIAL: TourState = { active: false, index: 0, destinationId: null };

export type TourAction =
  | { type: "start" }
  | { type: "next" }
  | { type: "end" }
  | { type: "event"; event: TourEvent; destinationId?: string; secret?: boolean };

function advance(state: TourState, to: number): TourState {
  return to >= STEPS.length ? { ...state, active: false } : { ...state, index: to };
}

export function reduce(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { active: true, index: 0, destinationId: null };
    case "end":
      return state.active ? { ...state, active: false } : state;
    case "next": {
      const step = STEPS[state.index];
      if (!state.active || !step || step.advanceOn !== "next") return state;
      return advance(state, state.index + 1);
    }
    case "event": {
      const step = STEPS[state.index];
      if (!state.active || !step || step.advanceOn !== action.event) return state;
      let to = state.index + 1;
      // A Discord destination has no secret, so there is no secret dialog to point at.
      if (action.secret === false && STEPS[to]?.advanceOn === "secret-dismissed") to += 1;
      const destinationId = action.destinationId ?? state.destinationId;
      return advance({ ...state, destinationId }, to);
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/tour/model.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Lint, then commit**

```bash
cd web && npm run lint && npm test
git add web/package.json web/package-lock.json web/src/tour/model.ts web/src/tour/model.test.ts
git commit -m "Add guided tour model and reducer"
```

---

### Task 2: TourProvider, app wiring, menu item

**Files:**
- Create: `web/src/tour/TourProvider.tsx`
- Modify: `web/src/App.tsx` (wrap `Router` in `TourProvider`; welcome effect starts the tour)
- Modify: `web/src/layout/AppShell.tsx` (menu item)

**Interfaces:**
- Consumes: everything from Task 1's `model.ts`; `useApp().notify`.
- Produces: `TourProvider`, `useTour(): { active: boolean; destinationId: string | null; start(): void; report(event: TourEvent, detail?: { destinationId?: string; secret?: boolean }): void }`.

- [ ] **Step 1: Write the provider**

`web/src/tour/TourProvider.tsx`:

```tsx
// The only module that imports react-joyride. It was added for the guided tour because
// it provides the spotlight overlay, tooltip positioning and target polling that the
// hands-on tour needs; writing that against MUI portals ourselves would be far larger.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { Link, useTheme } from "@mui/material";
import { useLocation, useNavigate } from "react-router";
import { ACTIONS, EVENTS, Joyride, type EventData, type Step } from "react-joyride";
import { useApp } from "../app/hooks";
import { INITIAL, reduce, STEPS, TOUR_ENDED_TOAST, type Segment, type TourEvent, type TourStep } from "./model";

const TARGET_WAIT_MS = 3000;

export interface TourDetail {
  destinationId?: string;
  secret?: boolean;
}

export interface TourValue {
  active: boolean;
  destinationId: string | null;
  start: () => void;
  report: (event: TourEvent, detail?: TourDetail) => void;
}

const TourContext = createContext<TourValue | null>(null);

export function useTour(): TourValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

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
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

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
```

Notes for the implementer:
- `disableFocusTrap` is required: MUI dialogs already trap focus and the user must be able to type in them while the tooltip is open.
- `targetWaitTimeout` is Joyride's own polling; nothing custom is needed.
- `run` is false until the location matches the step's route so Joyride doesn't look for the target on the old page.
- If `options.width` is rejected by the types, drop it; it is cosmetic.

- [ ] **Step 2: Wire the provider and the welcome start in App.tsx**

In `web/src/App.tsx`:

```tsx
import { TourProvider, useTour } from "./tour/TourProvider";
```

Change the provider nesting in `App`:

```tsx
      <AppProvider>
        <TourProvider>
          <Router />
          <Toast />
        </TourProvider>
      </AppProvider>
```

In `SignedIn`, add `const { start: startTour } = useTour();` next to `useNavigate()`, and replace the welcome effect body's final `if`:

```tsx
    // A brand-new account lands on the tour, which begins on Destinations.
    if (welcome && welcome === profile.callsign) startTour();
```

with `startTour` added to that effect's dependency array in place of `navigate` (remove the `navigate` and `useNavigate` import from `SignedIn` if nothing else uses them). Update the effect's leading comment to "A brand-new account starts the tour."

- [ ] **Step 3: Add the menu item in AppShell.tsx**

```tsx
import { useTour } from "../tour/TourProvider";
```

Inside `AppShell`, after `const { profile, session, notify } = useApp();`:

```tsx
  const { start: startTour } = useTour();
  const takeTour = () => {
    setMenuEl(null);
    setNavOpen(false);
    startTour();
  };
```

In the `<Menu>`, between the Account and Sign out items:

```tsx
            <MenuItem onClick={takeTour}>Take the tour</MenuItem>
```

- [ ] **Step 4: Type-check, lint, test, build**

Run: `cd web && npm run lint && npm test && npm run build`
Expected: no errors. If `tsc` complains about `data-tour` anywhere, it is on an object literal rather than a JSX attribute; move it to JSX.

- [ ] **Step 5: Commit**

```bash
git add web/src/tour/TourProvider.tsx web/src/App.tsx web/src/layout/AppShell.tsx
git commit -m "Add TourProvider and tour entry points"
```

---

### Task 3: Destinations page hooks

**Files:**
- Modify: `web/src/destinations/DestinationsPage.tsx`
- Modify: `web/src/destinations/DestinationDialog.tsx`

**Interfaces:**
- Consumes: `useTour()` from Task 2.

- [ ] **Step 1: Mark the dialogs**

In `DestinationDialog.tsx`, change the two `DialogContent` openings:

```tsx
      <DialogContent dividers data-tour="destination-form">
```

and in `SecretDialog`:

```tsx
      <DialogContent dividers data-tour="signing-secret">
```

- [ ] **Step 2: Report events and mark the buttons in DestinationsPage.tsx**

Add the import and hook:

```tsx
import { useTour } from "../tour/TourProvider";
…
  const tour = useTour();
  const openDialog = () => {
    setOpen(true);
    tour.report("destination-dialog-opened");
  };
  // The tour points at the row it created; before that, the first row.
  const tourRow = dests.find((d) => d.id === tour.destinationId) ?? dests[0];
```

Replace both `onClick={() => setOpen(true)}` with `onClick={openDialog}`, and add `data-tour="add-destination"` to the header button:

```tsx
        <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog} data-tour="add-destination" sx={{ flexShrink: 0 }}>Add destination</Button>
```

Change `onCreated` so the event is reported after the list has reloaded and the secret dialog state is set:

```tsx
  const onCreated = async (d: CreatedDestination) => {
    setOpen(false);
    await reload();
    notify(`Added ${d.name}`);
    if (d.signing_secret) setSecret({ value: d.signing_secret, name: d.name });
    tour.report("destination-created", { destinationId: d.id, secret: d.signing_secret !== null });
  };
```

Send test button:

```tsx
                    <Button
                      size="small" variant="outlined" disabled={busyId === d.id}
                      data-tour={d.id === tourRow?.id ? "send-test" : undefined}
                      onClick={() => void run(d.id, async () => {
                        await sendTest(d.id);
                        notify(`Test spot sent to ${d.name}`);
                        tour.report("test-sent");
                      })}
                    >
```

Secret dialog close:

```tsx
      <SecretDialog
        secret={secret?.value ?? null} name={secret?.name ?? ""}
        onClose={() => {
          setSecret(null);
          tour.report("secret-dismissed");
        }}
      />
```

- [ ] **Step 3: Lint, test, build, commit**

Run: `cd web && npm run lint && npm test && npm run build`

```bash
git add web/src/destinations
git commit -m "Report tour events from the destinations page"
```

---

### Task 4: Subscriptions page hooks

**Files:**
- Modify: `web/src/subscriptions/SubscriptionsPage.tsx`
- Modify: `web/src/subscriptions/SubscriptionDialog.tsx`

- [ ] **Step 1: Mark the dialog**

In `SubscriptionDialog.tsx`:

```tsx
      <DialogContent dividers data-tour="subscription-form">
```

- [ ] **Step 2: Report events in SubscriptionsPage.tsx**

```tsx
import { useTour } from "../tour/TourProvider";
…
  const tour = useTour();
  const startNew = () => {
    setEditing(blankSub());
    tour.report("subscription-dialog-opened");
  };
```

Header button:

```tsx
        <Button variant="contained" startIcon={<AddIcon />} onClick={startNew} data-tour="new-subscription" sx={{ flexShrink: 0 }}>New subscription</Button>
```

In `save`, after `setEditing(null);`:

```tsx
      if (!s.id) tour.report("subscription-created");
```

- [ ] **Step 3: Lint, test, build, commit**

Run: `cd web && npm run lint && npm test && npm run build`

```bash
git add web/src/subscriptions
git commit -m "Report tour events from the subscriptions page"
```

---

### Task 5: Docs and manual walk-through

**Files:**
- Modify: `CLAUDE.md` (web app rules)
- Modify: `docs/superpowers/specs/2026-10-05-guided-tour-design.md` (record the two refinements)

- [ ] **Step 1: CLAUDE.md**

Under "Web app rules" add:

```
- The guided tour lives in `web/src/tour/`. Steps and copy are in `model.ts` (the mock has no
  tour section); `TourProvider.tsx` is the only module that imports react-joyride. Pages only add
  `data-tour` attributes and call `useTour().report(...)`; never drive Joyride from a page.
```

- [ ] **Step 2: Spec refinements**

In the spec, replace the custom 100 ms poller sentence with Joyride's `targetWaitTimeout` (3 s), note that form steps target `DialogContent` with the overlay hidden, and note that copy lives in `model.ts` because `docs/ui-mock.html` became a bundle.

- [ ] **Step 3: Manual walk-through**

Create `web/.env.local` from `supabase status` (local anon key and API URL), run `cd web && npm run dev`, sign up a fresh account, and confirm:
- the tour starts on Destinations with the welcome step and no welcome toast;
- each event step advances when the action is done, including Send test reaching webhook.site;
- Skip tour ends it; clicking Sources mid-tour ends it with the toast;
- "Take the tour" in the account menu restarts it;
- dark mode tooltip colors follow the theme.

Fix anything found, keeping fixes inside `web/src/tour/` where possible.

- [ ] **Step 4: Final verification and commit**

Run: `cd web && npm run lint && npm test && npm run build`

```bash
git add CLAUDE.md docs/superpowers
git commit -m "Document the guided tour"
```
