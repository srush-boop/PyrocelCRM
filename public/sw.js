// Service worker for web push notifications.
/* eslint-disable no-restricted-globals */

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch (e) {
    payload = { title: 'Notification', body: event.data.text() }
  }

  const title = payload.title || 'Notification'
  const data = payload.data || {}

  // "Safe now" signal: a check-in landed on some device (the phone, a paired
  // watch, or the office making contact). Dismiss any outstanding lone-worker
  // alarm notifications on THIS device so it stops sounding immediately, without
  // waiting for the app to be opened. We still surface a brief, silent
  // confirmation (platforms expect a received push to show a notification).
  if (data.kind === 'lone_worker_clear') {
    event.waitUntil(
      (async () => {
        const notes = await self.registration.getNotifications()
        for (const n of notes) {
          const nd = n.data || {}
          if (
            n.tag === 'lone_worker' ||
            nd.kind === 'lone_worker_self' ||
            nd.kind === 'lone_worker_alert'
          ) {
            n.close()
          }
        }
        await self.registration.showNotification(title || 'Safety confirmed', {
          body: payload.body || "You're checked in — the safety alarm has been cleared.",
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'lone_worker',
          renotify: false,
          requireInteraction: false,
          silent: true,
          data: { url: payload.url || '/dashboard', ...data },
        })
      })(),
    )
    return
  }

  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Keep the original push data so notificationclick can react to it (e.g.
    // the lone-worker "I'm safe" acknowledgement).
    data: { url: payload.url || '/dashboard', ...data },
    tag: payload.category || 'general',
  }

  // Lone-worker self-nudges (sent to the worker's own device, reachable even
  // when the app is closed) get a one-tap "I'm safe" action. On a paired
  // Android/Wear OS watch this surfaces as a button the worker can tap to
  // confirm safety without opening the phone or the app.
  if (data.kind === 'lone_worker_self') {
    options.actions = [{ action: 'im_safe', title: "I'm safe" }]
    // Persist until the worker interacts, and re-alert on each escalation.
    options.requireInteraction = true
    options.renotify = true
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Acknowledge safety directly from the notification action (incl. from a watch)
// by calling the same-origin endpoint with the session cookie. No window is
// opened so the worker never has to unlock their phone.
async function acknowledgeSafe() {
  try {
    const res = await fetch('/api/lone-worker/im-safe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      await self.registration.showNotification('Safety confirmed', {
        body: "Thanks — we've let the office know you're safe.",
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'lone_worker',
      })
      return
    }
    throw new Error('Request failed with status ' + res.status)
  } catch (err) {
    // If the acknowledgement could not be sent (e.g. offline or signed out),
    // tell the worker to open the app so they don't wrongly believe they are
    // marked safe.
    await self.registration.showNotification("Couldn't confirm safety", {
      body: 'Tap to open the app and confirm you are safe.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'lone_worker',
      data: { url: '/dashboard' },
      requireInteraction: true,
    })
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  // Tap-to-acknowledge: resolve the lone-worker check-in in the background
  // rather than opening a window.
  if (event.action === 'im_safe') {
    event.waitUntil(acknowledgeSafe())
    return
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if one is open, otherwise open a new one.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(targetUrl)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
