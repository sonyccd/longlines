// Delivery worker. Claims queued deliveries, sends them grouped by
// destination, and records the outcome. Invoked by cron every minute and by
// the matcher as soon as it creates deliveries.

import { bearerToken } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/db.ts";
import { backoffSeconds } from "../_shared/delivery/format.ts";
import { sendDiscord, type SendOptions, sendWebhook } from "../_shared/delivery/send.ts";
import type { PendingDelivery } from "../_shared/delivery/types.ts";

// Local development only: lets a plain-http receiver on the Docker host stand
// in for a real destination. Never set on the hosted project.
const SEND_OPTIONS: SendOptions = {
  allowInsecure: Deno.env.get("LONGLINES_ALLOW_INSECURE_DESTINATIONS") === "1",
};

const CLAIM_LIMIT = 200;
const VISIBILITY_SECONDS = 60;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface DeliverSummary {
  claimed: number;
  sent: number;
  failed: number;
  delayed: number;
  dropped: number;
  skipped_paused: number;
  errors: string[];
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Only the service role (cron, the matcher) may run the worker.
  if (bearerToken(req) !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const summary: DeliverSummary = {
    claimed: 0,
    sent: 0,
    failed: 0,
    delayed: 0,
    dropped: 0,
    skipped_paused: 0,
    errors: [],
  };

  const claimed = await db.rpc("claim_deliveries", {
    p_limit: CLAIM_LIMIT,
    p_vt: VISIBILITY_SECONDS,
  });
  if (claimed.error) {
    console.error(`deliver: claim failed: ${claimed.error.message}`);
    return Response.json({ error: claimed.error.message }, { status: 500 });
  }
  const rows = (claimed.data ?? []) as PendingDelivery[];
  summary.claimed = rows.length;

  // Too old to keep retrying.
  const cutoff = Date.now() - MAX_AGE_MS;
  const expired = rows.filter((r) => new Date(r.created_at).getTime() < cutoff);
  if (expired.length > 0) {
    await rpcOrLog(db, summary, "mark_deliveries_dropped", {
      p_delivery_ids: expired.map((r) => r.delivery_id),
      p_msg_ids: expired.map((r) => r.msg_id),
    });
    summary.dropped = expired.length;
  }

  const groups = new Map<string, PendingDelivery[]>();
  for (const row of rows) {
    if (expired.includes(row)) continue;
    const list = groups.get(row.destination.id) ?? [];
    list.push(row);
    groups.set(row.destination.id, list);
  }

  for (const batch of groups.values()) {
    const destination = batch[0]!.destination;
    if (destination.health === "paused") {
      summary.skipped_paused += batch.length; // messages reappear after the visibility timeout
      continue;
    }

    const result = destination.type === "discord"
      ? await sendDiscord(destination, batch, SEND_OPTIONS)
      : await sendWebhook(destination, batch, SEND_OPTIONS);

    const done = batch.slice(0, result.sent);
    const rest = batch.slice(result.sent);
    if (done.length > 0) {
      await rpcOrLog(db, summary, "mark_deliveries_sent", {
        p_delivery_ids: done.map((r) => r.delivery_id),
        p_msg_ids: done.map((r) => r.msg_id),
      });
      summary.sent += done.length;
    }
    if (rest.length === 0) continue;

    if (result.retryAfterSeconds !== undefined) {
      // Rate limited, not broken: wait without counting a failure.
      await rpcOrLog(db, summary, "delay_deliveries", {
        p_msg_ids: rest.map((r) => r.msg_id),
        p_delay_seconds: result.retryAfterSeconds,
      });
      summary.delayed += rest.length;
    } else {
      const attempt = Math.max(...rest.map((r) => r.attempts)) + 1;
      await rpcOrLog(db, summary, "mark_deliveries_failed", {
        p_delivery_ids: rest.map((r) => r.delivery_id),
        p_msg_ids: rest.map((r) => r.msg_id),
        p_error: result.error ?? "unknown error",
        p_delay_seconds: backoffSeconds(attempt),
      });
      summary.failed += rest.length;
      console.error(`deliver: ${destination.type} "${destination.name}" failed: ${result.error}`);
    }
  }

  console.log(JSON.stringify(summary));
  return Response.json(summary);
});

async function rpcOrLog(
  db: ReturnType<typeof createServiceClient>,
  summary: DeliverSummary,
  fn: string,
  args: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.rpc(fn, args);
  if (error) {
    summary.errors.push(`${fn}: ${error.message}`);
    console.error(`deliver: ${fn} failed: ${error.message}`);
  }
}
