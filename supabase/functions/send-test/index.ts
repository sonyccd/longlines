// "Send test": deliver one clearly labeled sample spot to a destination the
// caller owns, using the same code path as real deliveries.

import { userFromRequest } from "../_shared/auth.ts";
import { json, preflightResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/db.ts";
import { sampleSpot } from "../_shared/delivery/format.ts";
import { sendDiscord, type SendOptions, sendWebhook } from "../_shared/delivery/send.ts";
import type { DeliveryDestination, PendingDelivery } from "../_shared/delivery/types.ts";

// Local development only: lets a plain-http receiver on the Docker host stand
// in for a real destination. Never set on the hosted project.
const SEND_OPTIONS: SendOptions = {
  allowInsecure: Deno.env.get("LONGLINES_ALLOW_INSECURE_DESTINATIONS") === "1",
};

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = preflightResponse(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const admin = createServiceClient();
  const user = await userFromRequest(req, admin);
  if (!user) return json({ error: "Sign in again to send a test." }, 401);

  let destinationId: unknown;
  try {
    destinationId = ((await req.json()) as { destination_id?: unknown }).destination_id;
  } catch {
    destinationId = undefined;
  }
  if (typeof destinationId !== "string") return json({ error: "Pick a destination." }, 400);

  const { data, error } = await admin
    .from("destinations")
    .select("id, type, name, url, signing_secret, health, consecutive_failures")
    .eq("id", destinationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return json({ error: "Couldn't load that destination." }, 500);
  if (!data) return json({ error: "Destination not found." }, 404);

  const destination = data as DeliveryDestination;
  const delivery: PendingDelivery = {
    msg_id: 0,
    delivery_id: 0,
    subscription_id: "00000000-0000-0000-0000-000000000000",
    attempts: 0,
    created_at: new Date().toISOString(),
    destination,
    spot: sampleSpot(destination),
  };
  const result = destination.type === "discord"
    ? await sendDiscord(destination, [delivery], SEND_OPTIONS)
    : await sendWebhook(destination, [delivery], SEND_OPTIONS);

  return result.ok ? json({ ok: true }) : json({ error: result.error ?? "Delivery failed." }, 502);
});
