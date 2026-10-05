import type { DestinationType } from "../lib/api";

export const DEST_TYPES: Array<{ id: DestinationType; label: string; help: string }> = [
  { id: "discord", label: "Discord channel", help: "Post matching spots into a channel using a Discord webhook URL." },
  { id: "webhook", label: "Webhook", help: "We POST each matching spot as JSON to your URL, signed with a shared secret." },
];

export function typeLabel(id: string): string {
  return DEST_TYPES.find((t) => t.id === id)?.label ?? id;
}
