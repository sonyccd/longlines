// Shapes shared by the deliver and send-test functions. `PendingDelivery`
// mirrors a row from the claim_deliveries RPC.

export interface DeliverySpot {
  id: number;
  source: string;
  spot_time: string;
  callsign: string;
  spotter: string | null;
  frequency_khz: number;
  band: string | null;
  mode: string | null;
  comment: string;
  pota_reference: string | null;
  pota_park_name: string | null;
  pota_location: string | null;
  sota_summit_ref: string | null;
}

export interface DeliveryDestination {
  id: string;
  type: "discord" | "webhook";
  name: string;
  url: string;
  signing_secret: string | null;
  health: "ok" | "failing" | "paused";
  consecutive_failures: number;
}

export interface PendingDelivery {
  msg_id: number;
  delivery_id: number;
  subscription_id: string;
  attempts: number;
  created_at: string;
  destination: DeliveryDestination;
  spot: DeliverySpot;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  fields: DiscordEmbedField[];
  timestamp: string;
}

export interface DiscordMessage {
  embeds: DiscordEmbed[];
}

export interface WebhookPayload {
  deliveries: Array<{ delivery_id: number; subscription_id: string; spot: DeliverySpot }>;
}
