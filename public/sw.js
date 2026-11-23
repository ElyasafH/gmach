self.addEventListener("push", (e) => {
  e.waitUntil(
    self.registration.showNotification("בקשה חדשה לכלי", {
      body: "שואל ביקש כלי — לחצו לפתיחת הבקשות",
      icon: "/favicon.ico",
      tag: "gmach-request",
      renotify: true,
    }),
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/manage/requests"));
});
