import { createServiceClient } from "../_shared/db.ts";
import { sendToDestination } from "../_shared/delivery/send.ts";
import { handleSendTest } from "../_shared/handlers/test_delivery.ts";

// LONGLINES_ALLOW_INSECURE_DESTINATIONS is for local development only: it lets
// a plain-http receiver on the Docker host stand in for a real destination.
// Never set on the hosted project.
const allowInsecure = Deno.env.get("LONGLINES_ALLOW_INSECURE_DESTINATIONS") === "1";

Deno.serve((req) =>
  handleSendTest(req, {
    admin: createServiceClient,
    send: (destination, deliveries) =>
      sendToDestination(destination, deliveries, { allowInsecure }),
  })
);
