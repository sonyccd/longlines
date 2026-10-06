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

  it("lets the form steps be dismissed, and only event steps", () => {
    expect(STEPS.filter((s) => s.dismissible).map((s) => s.id)).toEqual(["destination-form", "subscription-form"]);
    for (const s of STEPS) {
      if (s.dismissible) expect(s.advanceOn).not.toBe("next");
    }
  });
});

describe("reduce", () => {
  it("start activates at the first step", () => {
    expect(started()).toEqual({ active: true, index: 0, destinationId: null, dismissed: false });
  });

  it("dismiss hides a dismissible step until it advances", () => {
    const form = play({ type: "next" }, { type: "event", event: "destination-dialog-opened" });
    expect(form.index).toBe(indexOf("destination-form"));
    const hidden = reduce(form, { type: "dismiss" });
    expect(hidden.dismissed).toBe(true);
    expect(hidden.index).toBe(form.index);
    const next = reduce(hidden, { type: "event", event: "destination-created", destinationId: "d1", secret: true });
    expect(next.dismissed).toBe(false);
    expect(next.index).toBe(indexOf("secret"));
  });

  it("dismiss is ignored on other steps", () => {
    expect(reduce(started(), { type: "dismiss" })).toEqual(started());
    const button = play({ type: "next" });
    expect(reduce(button, { type: "dismiss" })).toEqual(button);
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
