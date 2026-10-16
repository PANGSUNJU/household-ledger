/*
 * 서비스 워커 — 설치형 앱(PWA)과 푸시 알림
 *  · 기록·계산은 하지 않는다. 앱 파일을 미리 저장(캐시)하지도 않는다 (인터넷 필요 앱, 새 버전이 바로 보이게)
 *  · 인터넷이 끊겼을 때 앱 화면 대신 안내 화면(offline.html)만 보여준다
 *  · 푸시 알림을 받아 띄우고, 누르면 앱을 연다
 */
const CACHE = 'ledger-shell-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icons/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

// 화면 이동 요청만: 인터넷이 되면 그대로, 안 되면 안내 화면
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)))
})

self.addEventListener('push', (e) => {
  let msg = {}
  try { msg = e.data ? e.data.json() : {} } catch { msg = { body: e.data && e.data.text() } }
  const title = msg.title || '가계부'
  e.waitUntil(self.registration.showNotification(title, {
    body: msg.body || '이번 주 정리할까요?',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',     // 갤럭시 상단 상태 표시줄에 보이는 작은 흰색 아이콘
    tag: msg.tag || 'weekly-remind',
    renotify: true,
    data: { url: msg.url || '/' }
  }))
})

// 알림을 누르면: 열려 있는 앱이 있으면 그 화면으로, 없으면 새로 연다
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus()
        if ('navigate' in c) { try { await c.navigate(url) } catch { /* 같은 화면 */ } }
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
