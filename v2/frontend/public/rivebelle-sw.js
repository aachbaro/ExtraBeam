self.addEventListener('push', event => {
  let data;
  try { data = event.data.json(); } catch { return; }
  const url = typeof data.url === 'string' && /^\/requests\/[a-f0-9-]+$/.test(data.url) ? data.url : '/notifications';
  event.waitUntil(self.registration.showNotification(data.title || 'Rivebelle', {
    body: data.body || '', tag: data.tag, silent: data.silent === true, data: { url },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.navigate(url); return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
