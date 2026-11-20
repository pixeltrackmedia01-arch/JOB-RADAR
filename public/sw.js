/* JobRadar service worker: receives job-alert push notifications. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "JobRadar", body: event.data ? event.data.text() : "" }; }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/jobs";
  event.waitUntil(self.registration.showNotification(data.title || "New jobs on JobRadar", {
    body: data.body || "", icon: "/icon.svg", badge: "/icon.svg", tag: data.tag || undefined, data: { url },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/jobs";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener("pushsubscriptionchange", (event) => {
  // The browser rotated the subscription; the next visit to the manage page re-registers it.
  event.waitUntil(Promise.resolve());
});
