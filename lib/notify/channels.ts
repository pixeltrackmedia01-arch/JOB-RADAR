// Notification channel registry. The discovery engine only creates
// notification_events; channels turn events into deliveries. A future
// authorised WhatsApp Business (Cloud API) integration plugs in here by
// implementing `available()` and `send()` — no change to collection or
// matching. Unofficial WhatsApp automation is intentionally not supported.

export type ChannelId = "email" | "push" | "whatsapp";

export type ChannelInfo = { id: ChannelId; label: string; status: "available" | "planned"; note: string };

export const CHANNELS: ChannelInfo[] = [
  { id: "email", label: "Email", status: "available", note: "Primary channel. Double opt-in required." },
  { id: "push", label: "Browser push", status: "available", note: "Optional. Requires explicit browser permission." },
  { id: "whatsapp", label: "WhatsApp", status: "planned", note: "Future: official WhatsApp Business Platform only, with explicit opt-in." },
];

export const SUBSCRIBABLE_CHANNELS: ChannelId[] = ["email", "push"];
