# Guided tour for new users

Date: 2026-10-05

## Goal

A new user signs in for the first time and, in about two minutes, ends up with a
working webhook destination they have seen receive a test delivery and a
subscription that sends spots to it. The tour is hands-on: it waits for the
user to perform each action in the real UI rather than describing it.

The tour is built into the web app with react-joyride. No third-party tour or
onboarding service.

## Non-goals

- Persisting tour progress across reloads or devices. Progress lives in memory.
- Touring Sources, Account, or Discord destinations. The tour tolerates a
  Discord destination being created in step 3 but does not explain it.
- Component or browser tests. The web app has no DOM test harness and this
  feature does not add one.

## Behavior

### Starting

- **First sign-in after sign-up.** `App.tsx` already detects this through the
  `longlines.welcome` key in localStorage and navigates to Destinations with a
  welcome toast. It will instead navigate to Destinations and start the tour.
  The welcome toast is removed; the tour's first step carries the greeting.
  Because the key is consumed on first use, auto-start happens at most once per
  browser. No new persisted flag is added.
- **Account menu.** A "Take the tour" item below "Account" navigates to
  Destinations and starts the tour from step 1. It works whether or not the user
  already has destinations.

### Ending

- Skip tour, the close control, or Done on the last step ends the tour.
- Any navigation that leaves the current step's route, other than the tour's own
  navigation, ends the tour and shows the toast
  "Tour ended. You can take it again from the account menu."
- Ending never deletes anything the user created during the tour.

### Steps

Order is destination, test, subscription because a subscription cannot be saved
without a destination. Copy below is final. It lives only in
`web/src/tour/model.ts`: `docs/ui-mock.html` became a minified bundle in
commit caee34b0, so there is no readable mock section to hold it. Form steps
(3, 4 and 8) hide Joyride's dimmed overlay so the whole dialog stays usable.

| # | Title | Route | Target | Advances on |
|---|-------|-------|--------|-------------|
| 1 | Welcome | /destinations | centered | Start button |
| 2 | Add a destination | /destinations | `add-destination` button | `destination-dialog-opened` |
| 3 | Point it at webhook.site | /destinations | `destination-form` (dialog content, overlay hidden) | `destination-created` |
| 4 | Your signing secret | /destinations | `signing-secret` (secret dialog content) | `secret-dismissed`; skipped when `destination-created` reports no secret |
| 5 | Send a test | /destinations | `send-test` button on the tour's destination row | `test-sent` |
| 6 | Now pick your spots | /destinations | centered | Next button |
| 7 | Create a subscription | /subscriptions | `new-subscription` button | `subscription-dialog-opened` |
| 8 | Choose what to receive | /subscriptions | `subscription-save` (Create subscription button, tooltip above, overlay hidden) | `subscription-created` |
| 9 | You're on the air | /subscriptions | centered | Done button |

Copy:

1. **Welcome to Long Lines.** "Long Lines watches POTA and SOTAwatch and
   delivers the spots you care about. This tour takes about two minutes: you'll
   add a webhook destination, send it a test, and create your first
   subscription." Buttons: Start, Skip tour.
2. **Add a destination.** "A destination is a place spots get delivered. Click
   Add destination."
3. **Point it at webhook.site.** "Choose Webhook. Then open webhook.site in a
   new tab, copy the URL it gives you, and paste it as the Endpoint URL. Give it
   a name like Tour test and click Add destination." The text "webhook.site"
   is a link to https://webhook.site that opens in a new tab.
4. **Your signing secret.** "Every delivery is signed with this secret so your
   server can verify it came from Long Lines. You won't need it for
   webhook.site. Click Done."
5. **Send a test.** "Click Send test. Long Lines posts one sample spot from
   N0CALL to your URL. Switch to the webhook.site tab to see the request and its
   JSON body."
6. **Now pick your spots.** "Delivery works. Next, a subscription chooses which
   spots to send." Button: Next.
7. **Create a subscription.** "Click New subscription."
8. **Choose what to receive.** "Name it and pick filters: sources, bands,
   modes, callsigns, or a park, summit, or location. Leave a filter empty to
   match everything. Under Send matches to, choose your webhook. The preview
   shows how many of the last 200 spots would have matched. Click Create
   subscription."
9. **You're on the air.** "Matching spots now go to your webhook as they come
   in. When you're ready for a real endpoint, add it as a new destination and
   point the subscription at it. You can take this tour again from the account
   menu." Button: Done.

Event-driven steps (2, 3, 4, 5, 7, 8) show no Next button; the user advances by
doing the action. Every step shows Skip tour. There is no Back button: going
back would point at UI that is no longer in that state (a dialog that has
closed, a destination that already exists).

## Architecture

All tour code lives in `web/src/tour/`. Nothing outside that folder imports
react-joyride.

### `model.ts` (pure)

- `TourEvent` union: `destination-dialog-opened`, `destination-created`,
  `secret-dismissed`, `test-sent`, `subscription-dialog-opened`,
  `subscription-created`.
- `TourStep`: `id`, `route`, `target` (a `data-tour` name or `null` for
  centered), `title`, `body` (copy as plain strings plus a `link` field for step
  3), `advanceOn` (`"next"` or a `TourEvent`).
- `STEPS`: the nine steps in order.
- `TourState`: `{ active: boolean; index: number; destinationId: string | null }`.
- `TourAction`: `start`, `next`, `end`, and
  `{ type: "event"; event: TourEvent; destinationId?: string; secret?: boolean }`.
- `reduce(state, action)`: `start` sets `active` and `index: 0`; `next` moves
  only on steps with `advanceOn: "next"`; `event` advances only when the
  current step's `advanceOn` equals the event, and when the event is
  `destination-created` with `secret: false` it skips step 4; `next` or an
  event on the last step, and `end`, set `active: false`. `destinationId` is
  recorded from `destination-created` so the page can mark the right row.

### `TourProvider.tsx`

- Holds `TourState` with `useReducer`. The context lives in `context.ts` and
  `useTour()` in `hooks.ts` (mirroring `app/`), returning
  `{ active, destinationId, start, report }`.
- Renders one `<Joyride>` in controlled mode: `run`, `stepIndex`, `steps`
  derived from `STEPS` (each `target` becomes `[data-tour="name"]`, centered
  steps use `placement: "center"`), `continuous`, `showSkipButton`,
  `disableOverlayClose`, `spotlightClicks`, `hideBackButton`, `hideFooter` on
  event steps, `locale` for Start, Next, Done and Skip tour, and a z-index above
  MUI's dialog layer. The `callback` maps Joyride NEXT, SKIP and CLOSE to
  reducer actions.
- When the active step's route differs from the current location it navigates
  there. When the location changes to something other than the active step's
  route, it dispatches `end` and shows the toast.
- Joyride's own `targetWaitTimeout` (3 s) polls for a step's target before
  showing it. If the target never appears, Joyride reports target-not-found
  and the provider ends the tour with the same toast as leaving the page.
- A module header comment explains why react-joyride was added.

### Page integration

- `App.tsx` wraps `Router` in `TourProvider` inside `AppProvider` so the tour
  can use `notify` and routing. The welcome effect calls `start()` instead of
  passing a toast.
- `AppShell.tsx` adds the "Take the tour" menu item.
- `DestinationsPage.tsx` sets `data-tour="add-destination"` on the header
  button, reports `destination-dialog-opened` when it opens the dialog,
  reports `destination-created` with the new id and whether a secret was
  returned after `reload()` finishes, reports `secret-dismissed` when the
  secret dialog closes, reports `test-sent` after a successful test, and sets
  `data-tour="send-test"` on the Send test button of the row whose id matches
  the tour's `destinationId`, falling back to the first row.
- `DestinationDialog.tsx` sets `data-tour` on both of its `DialogContent`s;
  `SubscriptionDialog.tsx` sets it on the Create subscription button, because
  its dialog is nearly viewport-high and a tooltip beside the content gets
  pushed off screen.
- `SubscriptionsPage.tsx` sets `data-tour="new-subscription"`, reports
  `subscription-dialog-opened` and `subscription-created`.
- `CLAUDE.md` gains a line under web app rules: tour steps and copy live in
  `web/src/tour/model.ts`; only `TourProvider` imports react-joyride; pages
  only add `data-tour` attributes and call `report`.

## Testing

`web/src/tour/model.test.ts` (Vitest, matches the existing include pattern):

- Step list invariants: unique ids, every event step names a `TourEvent`,
  routes are `/destinations` or `/subscriptions`, centered steps have
  `advanceOn: "next"`.
- `start` activates at index 0; `next` on a next-step advances; `next` on an
  event step does nothing.
- A matching event advances; a non-matching event is ignored.
- `destination-created` with `secret: false` lands on step 5; with
  `secret: true` lands on step 4.
- `secret-dismissed` and `test-sent` advance in order; `destinationId` is
  retained.
- `end`, Skip, and `next` on the last step deactivate.

Verification before completion: `npm run lint`, `npm test`, `npm run build`
clean, and one manual walk through the tour against `supabase start`.
