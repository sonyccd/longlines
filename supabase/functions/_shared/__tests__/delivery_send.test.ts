import { assertEquals, assertMatch } from "@std/assert";
import { sendDiscord, sendWebhook } from "../delivery/send.ts";
import { signWebhookBody } from "../delivery/hmac.ts";
import type { DeliveryDestination, PendingDelivery } from "../delivery/types.ts";

async function withServer(
  handler: (req: Request) => Response | Promise<Response>,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const ac = new AbortController();
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen() {} },
    handler,
  );
  try {
    await fn(`http://127.0.0.1:${server.addr.port}`);
  } finally {
    ac.abort();
    await server.finished;
  }
}

function dest(url: string, type: "discord" | "webhook"): DeliveryDestination {
  return {
    id: "d1",
    type,
    name: "Test",
    url,
    signing_secret: "whsec_testsecret",
    health: "ok",
    consecutive_failures: 0,
  };
}

function delivery(id: number, destination: DeliveryDestination): PendingDelivery {
  return {
    msg_id: id,
    delivery_id: id,
    subscription_id: "s1",
    attempts: 0,
    created_at: new Date().toISOString(),
    destination,
    spot: {
      id,
      source: "pota",
      spot_time: "2026-10-05T14:32:08.000Z",
      callsign: "KK4PWJ",
      spotter: "W4ABC",
      frequency_khz: 14062,
      band: "20m",
      mode: "cw",
      comment: "",
      pota_reference: "US-2763",
      pota_park_name: null,
      pota_location: "US-NC",
      sota_summit_ref: null,
    },
  };
}

Deno.test("sendDiscord posts one message per 10 spots and reports success", async () => {
  const bodies: unknown[] = [];
  await withServer(
    async (req) => {
      bodies.push(await req.json());
      return new Response(null, { status: 204 });
    },
    async (base) => {
      const d = dest(`${base}/api/webhooks/1/abc`, "discord");
      const result = await sendDiscord(
        d,
        Array.from({ length: 12 }, (_, i) => delivery(i + 1, d)),
        { allowInsecure: true },
      );
      assertEquals(result, { ok: true, sent: 12 });
      assertEquals(bodies.length, 2);
      assertEquals((bodies[0] as { embeds: unknown[] }).embeds.length, 10);
    },
  );
});

Deno.test("sendDiscord stops on 429 and reports retry_after without sending the rest", async () => {
  let calls = 0;
  await withServer(
    () => {
      calls++;
      return calls === 1
        ? new Response(null, { status: 204 })
        : Response.json({ retry_after: 2.5 }, { status: 429 });
    },
    async (base) => {
      const d = dest(`${base}/api/webhooks/1/abc`, "discord");
      const result = await sendDiscord(
        d,
        Array.from({ length: 25 }, (_, i) => delivery(i + 1, d)),
        { allowInsecure: true },
      );
      assertEquals(result.ok, false);
      assertEquals(result.sent, 10);
      assertEquals(result.retryAfterSeconds, 3);
      assertMatch(result.error ?? "", /429/);
      assertEquals(calls, 2);
    },
  );
});

Deno.test("sendDiscord caps a single run at 30 messages per webhook", async () => {
  let calls = 0;
  await withServer(
    () => {
      calls++;
      return new Response(null, { status: 204 });
    },
    async (base) => {
      const d = dest(`${base}/api/webhooks/1/abc`, "discord");
      const result = await sendDiscord(
        d,
        Array.from({ length: 320 }, (_, i) => delivery(i + 1, d)),
        { allowInsecure: true },
      );
      assertEquals(calls, 30);
      assertEquals(result.ok, false);
      assertEquals(result.sent, 300);
      assertEquals(result.retryAfterSeconds, 60);
    },
  );
});

Deno.test("sendWebhook signs the body and sets the Long Lines headers", async () => {
  let seen: { headers: Headers; body: string } | null = null;
  await withServer(
    async (req) => {
      seen = { headers: req.headers, body: await req.text() };
      return new Response("ok", { status: 200 });
    },
    async (base) => {
      const d = dest(`${base}/spots`, "webhook");
      const result = await sendWebhook(d, [delivery(1, d), delivery(2, d)], {
        allowInsecure: true,
      });
      assertEquals(result, { ok: true, sent: 2 });
      const s = seen as unknown as { headers: Headers; body: string };
      assertEquals(s.headers.get("content-type"), "application/json");
      assertMatch(s.headers.get("user-agent") ?? "", /^LongLines\/0\.2/);
      const ts = Number(s.headers.get("x-longlines-timestamp"));
      assertEquals(Number.isInteger(ts), true);
      assertEquals(
        s.headers.get("x-longlines-signature"),
        await signWebhookBody("whsec_testsecret", ts, s.body),
      );
      assertEquals(JSON.parse(s.body).deliveries.length, 2);
    },
  );
});

Deno.test("sendWebhook treats non-2xx as failure with the status in the error", async () => {
  await withServer(
    () => new Response("boom", { status: 500 }),
    async (base) => {
      const d = dest(`${base}/spots`, "webhook");
      const result = await sendWebhook(d, [delivery(1, d)], { allowInsecure: true });
      assertEquals(result.ok, false);
      assertEquals(result.sent, 0);
      assertMatch(result.error ?? "", /500/);
    },
  );
});

Deno.test("sendWebhook refuses an unsafe destination before connecting", async () => {
  let called = false;
  await withServer(
    () => {
      called = true;
      return new Response("ok");
    },
    async (base) => {
      // Not allowInsecure: a plain-http loopback URL must be refused by the safety check.
      const d = dest(`${base}/spots`, "webhook");
      const result = await sendWebhook(d, [delivery(1, d)]);
      assertEquals(result.ok, false);
      assertEquals(called, false);
    },
  );
});
