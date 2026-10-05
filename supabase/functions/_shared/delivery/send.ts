// HTTP delivery to Discord and webhooks. Each function sends as much of the
// batch as it can, in order, and reports how many deliveries went out so the
// worker can mark exactly those as sent.

import { signWebhookBody } from "./hmac.ts";
import { discordMessages, webhookPayloads } from "./format.ts";
import {
  assertSafeDestinationUrl,
  assertSafeResolvedHost,
  hostOf,
  type Resolver,
} from "./urlsafety.ts";
import type { DeliveryDestination, PendingDelivery } from "./types.ts";

export const USER_AGENT = "LongLines/0.2";
export const DISCORD_MESSAGES_PER_RUN = 30; // Discord allows ~30 messages/minute per webhook
export const WEBHOOK_TIMEOUT_MS = 10_000;
const DISCORD_TIMEOUT_MS = 10_000;

export interface SendOptions {
  /** Tests only: skip URL safety so a loopback http server can stand in for the destination. */
  allowInsecure?: boolean;
  resolver?: Resolver;
}

export interface SendResult {
  ok: boolean;
  /** Deliveries confirmed sent, counted from the start of the batch. */
  sent: number;
  error?: string;
  /** Present when the rest should wait rather than count as a failure. */
  retryAfterSeconds?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Redirects are never followed: a safe public hostname could otherwise send
// us to an internal address after the URL check. With redirect: "manual" the
// runtime reports the 3xx itself (status 0 "opaqueredirect" in some runtimes).
function isRedirect(response: Response): boolean {
  return response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400);
}

export async function sendDiscord(
  destination: DeliveryDestination,
  deliveries: readonly PendingDelivery[],
  options: SendOptions = {},
): Promise<SendResult> {
  if (!options.allowInsecure) {
    try {
      assertSafeDestinationUrl("discord", destination.url);
    } catch (error) {
      return { ok: false, sent: 0, error: errorMessage(error) };
    }
  }

  const messages = discordMessages(deliveries.map((d) => d.spot));
  const url = new URL(destination.url);
  url.searchParams.set("wait", "false");
  let sent = 0;

  for (const [index, message] of messages.entries()) {
    if (index >= DISCORD_MESSAGES_PER_RUN) {
      return {
        ok: false,
        sent,
        error: "Discord per-run message cap reached",
        retryAfterSeconds: 60,
      };
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
        redirect: "manual",
      });
    } catch (error) {
      return { ok: false, sent, error: `Discord request failed: ${errorMessage(error)}` };
    }
    if (isRedirect(response)) {
      await response.body?.cancel();
      return {
        ok: false,
        sent,
        error: `Discord redirected (HTTP ${response.status}); redirects are not followed`,
      };
    }
    if (response.status === 429) {
      const retryAfter = await retryAfterSecondsOf(response);
      return {
        ok: false,
        sent,
        error: "Discord HTTP 429 (rate limited)",
        retryAfterSeconds: retryAfter,
      };
    }
    await response.body?.cancel();
    if (!response.ok) {
      return { ok: false, sent, error: `Discord HTTP ${response.status}` };
    }
    sent += message.embeds.length;
  }
  return { ok: true, sent };
}

/** Discord reports retry_after in seconds (fractional) in the body, or a Retry-After header. */
async function retryAfterSecondsOf(response: Response): Promise<number> {
  const header = Number(response.headers.get("retry-after"));
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // no JSON body
  }
  const fromBody = typeof body === "object" && body !== null
    ? Number((body as { retry_after?: unknown }).retry_after)
    : NaN;
  const seconds = Number.isFinite(fromBody) ? fromBody : Number.isFinite(header) ? header : 5;
  return Math.max(1, Math.ceil(seconds));
}

export async function sendWebhook(
  destination: DeliveryDestination,
  deliveries: readonly PendingDelivery[],
  options: SendOptions = {},
): Promise<SendResult> {
  if (!options.allowInsecure) {
    try {
      const url = assertSafeDestinationUrl("webhook", destination.url);
      await assertSafeResolvedHost(hostOf(url), options.resolver);
    } catch (error) {
      return { ok: false, sent: 0, error: errorMessage(error) };
    }
  }
  if (!destination.signing_secret) {
    return { ok: false, sent: 0, error: "Webhook destination has no signing secret" };
  }

  let sent = 0;
  for (const payload of webhookPayloads(deliveries)) {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signWebhookBody(destination.signing_secret, timestamp, body);
    let response: Response;
    try {
      response = await fetch(destination.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          "X-LongLines-Timestamp": String(timestamp),
          "X-LongLines-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        redirect: "manual",
      });
    } catch (error) {
      return { ok: false, sent, error: `Webhook request failed: ${errorMessage(error)}` };
    }
    await response.body?.cancel();
    if (isRedirect(response)) {
      return {
        ok: false,
        sent,
        error: `Webhook redirected (HTTP ${response.status}); redirects are not followed`,
      };
    }
    if (!response.ok) {
      return { ok: false, sent, error: `Webhook HTTP ${response.status}` };
    }
    sent += payload.deliveries.length;
  }
  return { ok: true, sent };
}
